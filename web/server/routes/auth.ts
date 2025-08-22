import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SalesforceService } from '../../../src/services/salesforce';
import { SandboxService } from '../../../src/sandbox/sandbox-detector';
import { APIResponse, AuthResponse, ConnectionStatus } from '../../shared/types/api';

const router = express.Router();

// Store OAuth states temporarily (in production, use Redis or similar)
const oauthStates = new Map<string, { sessionId: string; timestamp: number }>();

// Cleanup expired states (older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) {
      oauthStates.delete(state);
    }
  }
}, 60 * 1000); // Run every minute

/**
 * Initialize OAuth 2.0 Web Server Flow
 */
router.post('/oauth/init', async (req, res) => {
  try {
    const { 
      loginUrl = 'https://test.salesforce.com',
      clientId: userClientId,
      clientSecret: userClientSecret
    } = req.body;
    
    // Use user-provided credentials if available, otherwise fall back to environment variables
    const clientId = userClientId || process.env.SF_CLIENT_ID;
    const clientSecret = userClientSecret || process.env.SF_CLIENT_SECRET;
    
    if (!clientId) {
      throw new Error('OAuth not configured: Client ID is required. Please provide your Connected App credentials or configure server environment variables.');
    }
    
    if (!clientSecret) {
      throw new Error('OAuth not configured: Client Secret is required. Please provide your Connected App credentials or configure server environment variables.');
    }
    
    // Generate OAuth state parameter for security
    const state = uuidv4();
    const sessionId = req.sessionManager.createSession();
    
    // Store OAuth credentials in session if provided by user
    if (userClientId && userClientSecret) {
      const session = req.sessionManager.getSession(sessionId);
      if (session) {
        session.oauthCredentials = {
          clientId: userClientId,
          clientSecret: userClientSecret,
          loginUrl
        };
        req.sessionManager.updateSession(sessionId, session);
      }
    }
    
    // Store state temporarily
    oauthStates.set(state, {
      sessionId,
      timestamp: Date.now()
    });
    
    const redirectUri = `${process.env.SERVER_URL || 'http://localhost:3001'}/api/auth/oauth/callback`;
    
    // Construct Salesforce OAuth URL
    const authUrl = `${loginUrl}/services/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}&` +
      `scope=api%20refresh_token`;
    
    const response: APIResponse<AuthResponse> = {
      success: true,
      data: {
        authUrl,
        state
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'OAuth initialization failed',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Handle OAuth callback
 */
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }
    
    if (!code || !state) {
      throw new Error('Missing authorization code or state parameter');
    }
    
    // Verify state parameter
    const stateData = oauthStates.get(state as string);
    if (!stateData) {
      throw new Error('Invalid or expired OAuth state');
    }
    
    // Clean up state
    oauthStates.delete(state as string);
    
    // Get session to check for stored OAuth credentials
    const sessionId = stateData.sessionId;
    const session = req.sessionManager.getSession(sessionId);
    
    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(code as string, session);
    
    // Store connection info in session
    if (session) {
      session.connectionInfo = {
        instanceUrl: (tokenResponse as any).instance_url,
        accessToken: (tokenResponse as any).access_token,
        apiVersion: '59.0'
      };
      req.sessionManager.updateSession(sessionId, session);
    }
    
    // Redirect to client with session ID
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    res.redirect(`${clientUrl}/wizard?session=${sessionId}&step=discovery`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    res.redirect(`${clientUrl}/wizard?error=${encodeURIComponent(errorMessage)}`);
  }
});

/**
 * Check connection status
 */
router.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = req.sessionManager.getSession(sessionId);
    
    if (!session || !session.connectionInfo) {
      const response: APIResponse<ConnectionStatus> = {
        success: true,
        data: { connected: false },
        timestamp: new Date().toISOString()
      };
      return res.json(response);
    }
    
    // Test connection and get org info
    const salesforceService = new SalesforceService();
    await salesforceService.setAccessToken(
      session.connectionInfo.accessToken,
      session.connectionInfo.instanceUrl
    );
    
    const orgInfo = await salesforceService.getOrganization();
    const sandboxService = new SandboxService(salesforceService);
    const sandboxInfo = await sandboxService.detectSandboxInfo();
    
    const response: APIResponse<ConnectionStatus> = {
      success: true,
      data: {
        connected: true,
        instanceUrl: session.connectionInfo.instanceUrl,
        organizationName: orgInfo.Name,
        isSandbox: orgInfo.IsSandbox,
        sandboxInfo
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse<ConnectionStatus> = {
      success: true,
      data: { connected: false },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  }
});

/**
 * Disconnect and clear session
 */
router.post('/disconnect/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    req.sessionManager.clearSession(sessionId);
    
    const response: APIResponse = {
      success: true,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Disconnect failed',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string, session?: any) {
  // Use session-stored credentials if available, otherwise fall back to environment variables
  const clientId = session?.oauthCredentials?.clientId || process.env.SF_CLIENT_ID;
  const clientSecret = session?.oauthCredentials?.clientSecret || process.env.SF_CLIENT_SECRET;
  const loginUrl = session?.oauthCredentials?.loginUrl || 'https://login.salesforce.com';
  const redirectUri = `${process.env.SERVER_URL || 'http://localhost:3001'}/api/auth/oauth/callback`;
  
  if (!clientId || !clientSecret) {
    throw new Error('Missing Salesforce OAuth credentials. Please provide your Connected App credentials or configure server environment variables.');
  }
  
  // Use the same login URL for token exchange
  const tokenUrl = `${loginUrl}/services/oauth2/token`;
  
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('redirect_uri', redirectUri);
  params.append('code', code);
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorData}`);
  }
  
  return await response.json();
}

export default router;