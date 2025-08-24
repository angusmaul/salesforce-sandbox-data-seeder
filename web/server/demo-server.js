// Load environment variables FIRST before any other imports
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker');
const { FieldDataGenerator, SALESFORCE_FIELD_TYPES } = require('./lib/salesforce-field-types');
const { getCachedMapping, getRandomStateForCountry } = require('./lib/picklist-decoder');
const { ConstraintSolver } = require('./lib/constraint-solver');
const { suggestionEngine } = require('./services/suggestion-engine.js');
const { abTestingService } = require('./services/ab-testing.js');
const archiver = require('archiver');
const jsforce = require('jsforce');
const fs = require('fs');
const path = require('path');
// Use native fetch in Node.js 18+ or polyfill for older versions
const fetch = globalThis.fetch || require('node-fetch');

// Validation Engine imports (TypeScript compiled to JS)
let ValidationEngine, AIService, EnhancedDiscoveryService;
try {
  // These will be compiled TypeScript modules
  const { ValidationEngine: VE } = require('./services/validation-engine');
  const { AIService: AIS } = require('./services/ai-service');
  const { EnhancedDiscoveryService: EDS } = require('./services/enhanced-discovery');
  ValidationEngine = VE;
  AIService = AIS;
  EnhancedDiscoveryService = EDS;
} catch (error) {
  console.warn('⚠️ Validation Engine modules not available (may need compilation):', error.message);
  // Graceful fallback - validation engine features will be disabled
}

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// File paths for persistent storage
const SESSION_FILE = path.join(__dirname, '../.sessions.json');
const OAUTH_FILE = path.join(__dirname, '../.oauth-configs.json');

// Persistent session and OAuth storage
class PersistentStorage {
  constructor(filePath, defaultData = {}) {
    this.filePath = filePath;
    this.data = this.load() || defaultData;
  }
  
  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`Failed to load ${this.filePath}:`, error.message);
    }
    return null;
  }
  
  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error(`Failed to save ${this.filePath}:`, error.message);
    }
  }
  
  get(key) {
    return this.data[key];
  }
  
  set(key, value) {
    this.data[key] = value;
    this.save();
  }
  
  has(key) {
    return key in this.data;
  }
  
  delete(key) {
    delete this.data[key];
    this.save();
  }
  
  clear() {
    this.data = {};
    this.save();
  }
  
  entries() {
    return Object.entries(this.data);
  }
}

// Initialize persistent storage
const sessions = new PersistentStorage(SESSION_FILE);
const oauthConfigs = new PersistentStorage(OAUTH_FILE);

console.log(`💾 Loaded ${Object.keys(sessions.data).length} existing sessions from storage`);

// Initialize AI and Validation services (with fallback for missing modules)
let aiService = null;
let validationEngine = null;
let enhancedDiscovery = null;

// Initialize AI Service for chat functionality (independent of validation engine)
try {
  // Use the JavaScript AI service from server/services/ai-service.js for chat
  const AIServiceJS = require('./services/ai-service');
  aiService = AIServiceJS.getInstance();
  console.log('✅ AI Service initialized for chat functionality');
} catch (error) {
  console.error('❌ Failed to initialize AI Service for chat:', error.message);
}

function initializeValidationEngine() {
  if (!ValidationEngine || !AIService || !EnhancedDiscoveryService) {
    console.log('⚠️ Validation Engine features disabled - modules not available');
    return;
  }

  try {
    // Initialize enhanced discovery service with mock Salesforce service for now
    // This will be properly integrated when connected to Salesforce
    
    console.log('✅ Validation Engine infrastructure ready');
  } catch (error) {
    console.error('❌ Failed to initialize Validation Engine:', error.message);
  }
}

// Initialize validation engine
initializeValidationEngine();

// Helper function to initialize validation engine for a session with Salesforce connection
async function initializeSessionValidationEngine(sessionId, conn) {
  if (!ValidationEngine || !EnhancedDiscoveryService) {
    return null;
  }

  try {
    // Create Salesforce service wrapper for the connection
    const salesforceService = {
      getConnection: () => conn
    };

    // Initialize enhanced discovery service
    const sessionEnhancedDiscovery = new EnhancedDiscoveryService(salesforceService);
    
    // Initialize validation engine
    const sessionValidationEngine = new ValidationEngine({
      aiService: aiService,
      enhancedDiscovery: sessionEnhancedDiscovery,
      enableAIAnalysis: aiService !== null,
      cacheValidationResults: true,
      maxConcurrentValidations: 5,
      useLocalValidationFirst: true
    });

    console.log(`✅ Session validation engine initialized for session: ${sessionId}`);
    return {
      validationEngine: sessionValidationEngine,
      enhancedDiscovery: sessionEnhancedDiscovery
    };
  } catch (error) {
    console.error(`❌ Failed to initialize session validation engine for ${sessionId}:`, error.message);
    return null;
  }
}

// Cleanup expired sessions (older than 24 hours)
function cleanupExpiredSessions() {
  const now = new Date();
  const expiredSessions = [];
  
  for (const [sessionId, session] of sessions.entries()) {
    const sessionDate = new Date(session.updatedAt || session.createdAt);
    const hoursDiff = (now - sessionDate) / (1000 * 60 * 60);
    
    if (hoursDiff > 24) {
      expiredSessions.push(sessionId);
    }
  }
  
  expiredSessions.forEach(sessionId => {
    sessions.delete(sessionId);
    oauthConfigs.delete(sessionId);
  });
  
  if (expiredSessions.length > 0) {
    console.log(`🧹 Cleaned up ${expiredSessions.length} expired sessions`);
  }
}

// Function to clean up duplicate unauthenticated sessions
function cleanupDuplicateSessions() {
  const authenticatedSessions = [];
  const unauthenticatedSessions = [];
  
  for (const [sessionId, session] of sessions.entries()) {
    if (session.connectionInfo && session.connectionInfo.accessToken) {
      authenticatedSessions.push(sessionId);
    } else {
      unauthenticatedSessions.push(sessionId);
    }
  }
  
  // Keep only the 2 most recent unauthenticated sessions
  if (unauthenticatedSessions.length > 2) {
    const sessionsToDelete = unauthenticatedSessions.slice(2);
    sessionsToDelete.forEach(sessionId => {
      sessions.delete(sessionId);
      oauthConfigs.delete(sessionId);
    });
    console.log(`🧹 Cleaned up ${sessionsToDelete.length} duplicate unauthenticated sessions`);
  }
}

// Run cleanup on startup and every 6 hours
cleanupExpiredSessions();
cleanupDuplicateSessions();
setInterval(() => {
  cleanupExpiredSessions();
  cleanupDuplicateSessions();
}, 6 * 60 * 60 * 1000);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
// Increase payload limit to handle large field metadata (especially picklistValues)
app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: 'demo-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Serve log files statically
app.use('/logs', express.static(path.join(__dirname, '../../logs')));

// Download all logs for a session as a zip file
app.get('/api/logs/download/:loadSessionId', async (req, res) => {
  const { loadSessionId } = req.params;
  
  try {
    const logsDir = path.join(__dirname, '../../logs');
    
    // Check if main log file exists
    const mainLogPath = path.join(logsDir, `${loadSessionId}.json`);
    if (!fs.existsSync(mainLogPath)) {
      return res.status(404).json({
        success: false,
        error: 'Log files not found for this session'
      });
    }
    
    // Create zip archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    // Set response headers for zip download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="session_logs_${loadSessionId}.zip"`);
    
    // Pipe archive to response
    archive.pipe(res);
    
    // Add main session log
    archive.file(mainLogPath, { name: `${loadSessionId}.json` });
    
    // Find and add all per-object log files
    const logFiles = fs.readdirSync(logsDir).filter(file => 
      file.startsWith(`${loadSessionId}_`) && file.endsWith('.json')
    );
    
    for (const logFile of logFiles) {
      const logFilePath = path.join(logsDir, logFile);
      archive.file(logFilePath, { name: logFile });
    }
    
    // Finalize archive
    await archive.finalize();
    
    console.log(`📦 Zip download created for session: ${loadSessionId} (${1 + logFiles.length} files)`);
    
  } catch (error) {
    console.error('Error creating zip download:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create zip download'
    });
  }
});

// OAuth Configuration Management
app.post('/api/auth/config', (req, res) => {
  try {
    const { clientId, clientSecret, instanceUrl, loginUrl, sessionId } = req.body;
    
    // Accept either instanceUrl or loginUrl
    const url = instanceUrl || loginUrl;
    
    if (!clientId || !clientSecret || !url || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: clientId, clientSecret, instanceUrl/loginUrl, sessionId',
        timestamp: new Date().toISOString()
      });
    }
    
    // Store OAuth config for this session (in production, encrypt and store in database)
    oauthConfigs.set(sessionId, {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      loginUrl: url.trim(),
      instanceUrl: url.trim(), // Store as both for compatibility
      createdAt: new Date()
    });
    
    console.log(`🔐 OAuth config saved for session: ${sessionId}`);
    
    res.json({
      success: true,
      data: { configured: true },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Config save error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/auth/config/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const config = oauthConfigs.get(sessionId);
    
    res.json({
      success: true,
      data: {
        configured: !!config,
        instanceUrl: config?.instanceUrl || null
        // Don't return sensitive credentials
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Demo routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0-demo'
  });
});

// Session management
app.post('/api/sessions/create', (req, res) => {
  const sessionId = uuidv4();
  const session = {
    id: sessionId,
    currentStep: 'authentication',
    createdAt: new Date(),
    updatedAt: new Date(),
    completed: false
  };
  
  sessions.set(sessionId, session);
  
  res.json({
    success: true,
    data: { sessionId },
    timestamp: new Date().toISOString()
  });
});

// Validate session's Salesforce connection
app.get('/api/sessions/:sessionId/validate', async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
      valid: false
    });
  }
  
  // Check if session has connection info
  if (!session.connectionInfo || !session.connectionInfo.accessToken) {
    return res.json({
      success: true,
      valid: false,
      reason: 'No Salesforce connection'
    });
  }
  
  try {
    // Test the Salesforce connection with a simple API call
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    // Try to get user info (lightweight call)
    await conn.identity();
    
    return res.json({
      success: true,
      valid: true,
      connectionInfo: {
        instanceUrl: session.connectionInfo.instanceUrl,
        hasToken: true
      }
    });
  } catch (error) {
    console.log(`Session ${req.params.sessionId} has invalid Salesforce credentials:`, error.message);
    
    // Clear invalid connection info
    delete session.connectionInfo;
    session.currentStep = 'authentication'; // Reset to auth step
    sessions.set(req.params.sessionId, session);
    
    return res.json({
      success: true,
      valid: false,
      reason: 'Salesforce session expired',
      error: error.message
    });
  }
});

// List all sessions (for finding existing authenticated sessions) - MUST be before :sessionId route
app.get('/api/sessions/list', async (req, res) => {
  try {
    const sessionList = [];
    const sessionsToDelete = [];
    
    for (const [sessionId, session] of sessions.entries()) {
      // Only return recent sessions (within 24 hours)
      const sessionDate = new Date(session.updatedAt || session.createdAt);
      const hoursDiff = (new Date() - sessionDate) / (1000 * 60 * 60);
      
      if (hoursDiff <= 24) {
        let isValidConnection = false;
        
        // Check if connection is still valid
        if (session.connectionInfo && session.connectionInfo.accessToken) {
          try {
            const conn = new jsforce.Connection({
              instanceUrl: session.connectionInfo.instanceUrl,
              accessToken: session.connectionInfo.accessToken,
              version: session.connectionInfo.apiVersion || '59.0'
            });
            
            // Quick validation - just check if we can make a call
            await conn.identity();
            isValidConnection = true;
          } catch (error) {
            console.log(`Session ${sessionId} has expired Salesforce credentials`);
            // Mark session for cleanup
            delete session.connectionInfo;
            session.currentStep = 'authentication';
            sessions.set(sessionId, session);
          }
        }
        
        sessionList.push({
          ...session,
          hasConnection: isValidConnection
        });
      } else {
        // Mark old sessions for deletion
        sessionsToDelete.push(sessionId);
      }
    }
    
    // Clean up old sessions
    sessionsToDelete.forEach(id => sessions.delete(id));
    
    // Sort by updatedAt, most recent first
    sessionList.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    
    res.json({
      success: true,
      data: sessionList,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list sessions',
      timestamp: new Date().toISOString()
    });
  }
});

// Country/State Metadata API endpoint
app.get('/api/metadata/countries/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session || !session.connectionInfo) {
      return res.status(404).json({
        success: false,
        error: 'Session or connection not found',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🌍 Fetching country/state metadata for session: ${sessionId}`);
    
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    // Get Account object metadata for state/country picklists
    const accountDesc = await conn.describe('Account');
    
    // Extract country and state picklist values
    const countryField = accountDesc.fields.find(f => f.name === 'BillingCountryCode');
    const stateField = accountDesc.fields.find(f => f.name === 'BillingStateCode');
    
    if (!countryField || !stateField) {
      return res.status(400).json({
        success: false,
        error: 'Country or State picklist fields not found in Account object',
        timestamp: new Date().toISOString()
      });
    }
    
    const countries = countryField.picklistValues?.filter(pv => pv.active) || [];
    const states = stateField.picklistValues?.filter(pv => pv.active) || [];
    
    console.log(`📊 Found ${countries.length} countries and ${states.length} states`);
    
    // Decode validFor mappings for state-country relationships
    const stateCountryMapping = decodeStateCountryMappings(countries, states);
    
    // Prepare response data
    const countryData = countries.map(c => ({
      code: c.value,
      name: c.label || getCountryNameFromCode(c.value), // Use the picklist label first, fallback to our mapping
      default: c.defaultValue || false
    }));
    
    // Get recommended Western countries (those in our current dictionary)
    const westernCountries = ['AU', 'US', 'CA', 'GB'];
    const availableWesternCountries = westernCountries.filter(code => 
      countries.some(c => c.value === code)
    );
    
    res.json({
      success: true,
      data: {
        countries: countryData,
        stateCountryMapping,
        recommendedCountries: availableWesternCountries,
        totalCountries: countries.length,
        totalStates: states.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Country metadata fetch error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to fetch country metadata: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// Data Generation Preferences API endpoints
app.get('/api/preferences/data-generation/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const preferences = session.dataGenerationPreferences || {
      selectedCountries: ['AU', 'US', 'CA', 'GB'], // Default Western countries
      useOrgPicklists: true,
      customStateMapping: {},
      savedAt: new Date()
    };
    
    res.json({
      success: true,
      data: preferences,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get preferences',
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/api/preferences/data-generation/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const preferences = {
      ...req.body,
      savedAt: new Date()
    };
    
    // Update session with new preferences
    const updatedSession = {
      ...session,
      dataGenerationPreferences: preferences,
      updatedAt: new Date()
    };
    
    sessions.set(sessionId, updatedSession);
    
    console.log(`💾 Data generation preferences saved for session: ${sessionId}`);
    console.log(`🌍 Selected countries: ${preferences.selectedCountries?.join(', ') || 'None'}`);
    
    res.json({
      success: true,
      data: preferences,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Save preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save preferences',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/sessions/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({
    success: true,
    data: session,
    timestamp: new Date().toISOString()
  });
});

app.put('/api/sessions/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
      timestamp: new Date().toISOString()
    });
  }
  
  const updatedSession = { ...session, ...req.body, updatedAt: new Date() };
  sessions.set(req.params.sessionId, updatedSession);
  
  res.json({
    success: true,
    data: updatedSession,
    timestamp: new Date().toISOString()
  });
});

// OAuth state storage (in production, use Redis or similar)
const oauthStates = new Map();

// Clean up expired states every minute
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes
      oauthStates.delete(state);
    }
  }
}, 60 * 1000);

// Direct Client Credentials authentication (like CLI)
app.post('/api/auth/client-credentials', async (req, res) => {
  try {
    const { sessionId, clientId, clientSecret, loginUrl } = req.body;
    
    if (!sessionId || !clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, clientId, and clientSecret are required',
        timestamp: new Date().toISOString()
      });
    }
    
    const baseUrl = loginUrl || 'https://login.salesforce.com';
    const tokenUrl = `${baseUrl}/services/oauth2/token`;
    
    console.log(`🔐 Client Credentials authentication to: ${tokenUrl}`);
    
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`❌ Client credentials auth failed: ${response.status} - ${errorData}`);
      throw new Error(`Authentication failed: ${response.status} - ${errorData}`);
    }
    
    const tokenResponse = await response.json();
    console.log(`✅ Client credentials authentication successful for: ${tokenResponse.instance_url}`);
    
    // Store OAuth config for auto-reconnection
    oauthConfigs.set(sessionId, {
      clientId: clientId,
      clientSecret: clientSecret,
      loginUrl: baseUrl,
      instanceUrl: tokenResponse.instance_url,
      createdAt: new Date()
    });
    console.log(`🔐 Stored OAuth config for session ${sessionId} for auto-reconnection`);
    
    // Update session with connection info
    const session = sessions.get(sessionId);
    if (session) {
      session.connectionInfo = {
        instanceUrl: tokenResponse.instance_url,
        accessToken: tokenResponse.access_token,
        apiVersion: '59.0'
      };
      sessions.set(sessionId, session);
    }
    
    res.json({
      success: true,
      data: {
        connected: true,
        instanceUrl: tokenResponse.instance_url
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Client credentials auth error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize OAuth flow (keep for fallback)
app.post('/api/auth/oauth/init', (req, res) => {
  try {
    const { sessionId, loginUrl } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required',
        timestamp: new Date().toISOString()
      });
    }
    
    // Check session-based OAuth config first, then fall back to environment
    let clientId, instanceUrl;
    const sessionConfig = oauthConfigs.get(sessionId);
    
    if (sessionConfig) {
      clientId = sessionConfig.clientId;
      instanceUrl = sessionConfig.instanceUrl;
      console.log(`🔐 Using session OAuth config for: ${sessionId}`);
    } else {
      // Fall back to environment variables
      clientId = process.env.SF_CLIENT_ID;
      instanceUrl = loginUrl || 'https://test.salesforce.com';
      
      if (!clientId || clientId === 'your_salesforce_client_id') {
        return res.json({
          success: false,
          error: 'OAuth not configured',
          needsConfiguration: true,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Use instanceUrl from session config if available, otherwise use loginUrl from request
    const oauthBaseUrl = instanceUrl || loginUrl;
    
    // Generate OAuth state parameter for security
    const state = uuidv4();
    
    // Store state temporarily
    oauthStates.set(state, {
      sessionId,
      loginUrl: oauthBaseUrl,
      timestamp: Date.now()
    });
    
    const redirectUri = `http://localhost:3001/api/auth/oauth/callback`;
    
    // Construct Salesforce OAuth URL
    const authUrl = `${oauthBaseUrl}/services/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}&` +
      `scope=api%20refresh_token%20id`;
    
    console.log(`🔐 OAuth URL generated for state: ${state}`);
    console.log(`🔗 OAuth Base URL: ${oauthBaseUrl}`);
    console.log(`🔗 Redirect URI: ${redirectUri}`);
    console.log(`🔗 Full OAuth URL: ${authUrl}`);
    
    res.json({
      success: true,
      data: {
        authUrl,
        state
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('OAuth init error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Handle OAuth callback
app.get('/api/auth/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    console.log(`🔄 OAuth callback received - State: ${state}, Code: ${code ? 'present' : 'missing'}, Error: ${error || 'none'}`);
    
    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }
    
    if (!code || !state) {
      throw new Error('Missing authorization code or state parameter');
    }
    
    // Verify state parameter
    const stateData = oauthStates.get(state);
    if (!stateData) {
      throw new Error('Invalid or expired OAuth state');
    }
    
    // Clean up state
    oauthStates.delete(state);
    
    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(code, stateData.sessionId, stateData.loginUrl);
    
    console.log(`✅ OAuth token exchange successful for instance: ${tokenResponse.instance_url}`);
    
    // Create a session with connection info
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      currentStep: 'discovery',
      connectionInfo: {
        instanceUrl: tokenResponse.instance_url,
        accessToken: tokenResponse.access_token,
        apiVersion: '59.0'
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completed: false
    };
    
    sessions.set(sessionId, session);
    
    // Redirect to client with session ID
    const clientUrl = `http://172.22.84.156:3000`;
    res.redirect(`${clientUrl}/wizard?session=${sessionId}&step=discovery`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    const clientUrl = `http://172.22.84.156:3000`;
    const errorMessage = error.message || 'Authentication failed';
    res.redirect(`${clientUrl}/wizard?error=${encodeURIComponent(errorMessage)}`);
  }
});

// Exchange authorization code for access token
async function exchangeCodeForToken(code, sessionId, loginUrl) {
  let clientId, clientSecret;
  
  // Check session-based OAuth config first
  const sessionConfig = oauthConfigs.get(sessionId);
  if (sessionConfig) {
    clientId = sessionConfig.clientId;
    clientSecret = sessionConfig.clientSecret;
    console.log(`🔐 Using session credentials for token exchange`);
  } else {
    // Fall back to environment variables
    clientId = process.env.SF_CLIENT_ID;
    clientSecret = process.env.SF_CLIENT_SECRET;
    console.log(`🔐 Using environment credentials for token exchange`);
  }
  
  const redirectUri = `http://localhost:3001/api/auth/oauth/callback`;
  
  if (!clientId || !clientSecret) {
    throw new Error('Missing Salesforce OAuth credentials');
  }
  
  // Use the login URL for token exchange
  const tokenUrl = `${loginUrl || 'https://login.salesforce.com'}/services/oauth2/token`;
  
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('redirect_uri', redirectUri);
  params.append('code', code);
  
  console.log(`🔄 Exchanging code for token at: ${tokenUrl}`);
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    console.error(`❌ Token exchange failed: ${response.status} - ${errorData}`);
    throw new Error(`Token exchange failed: ${response.status} - ${errorData}`);
  }
  
  return await response.json();
}

app.get('/api/auth/status/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    const oauthConfig = oauthConfigs.get(sessionId);
    
    if (session && session.connectionInfo && session.connectionInfo.accessToken) {
      // Validate the connection is still good
      try {
        const conn = new jsforce.Connection({
          instanceUrl: session.connectionInfo.instanceUrl,
          accessToken: session.connectionInfo.accessToken,
          version: session.connectionInfo.apiVersion || '59.0'
        });
        
        // Test the connection with a simple API call
        const identity = await conn.identity();
        
        // Connection is valid
        res.json({
          success: true,
          data: {
            connected: true,
            instanceUrl: session.connectionInfo.instanceUrl,
            organizationName: session.connectionInfo.organizationName || identity.organization_id,
            isSandbox: session.connectionInfo.isSandbox,
            sandboxInfo: session.connectionInfo.sandboxInfo
          },
          timestamp: new Date().toISOString()
        });
      } catch (validationError) {
        console.log(`Session ${sessionId} has expired Salesforce credentials:`, validationError.message);
        
        // If we have OAuth config, try to automatically re-authenticate
        if (oauthConfig && oauthConfig.clientId && oauthConfig.clientSecret) {
          console.log(`🔄 Attempting automatic re-authentication for session ${sessionId}`);
          
          try {
            const baseUrl = oauthConfig.loginUrl || oauthConfig.instanceUrl || 'https://login.salesforce.com';
            const tokenUrl = `${baseUrl}/services/oauth2/token`;
            
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');
            params.append('client_id', oauthConfig.clientId);
            params.append('client_secret', oauthConfig.clientSecret);
            
            const response = await fetch(tokenUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: params
            });
            
            if (response.ok) {
              const tokenResponse = await response.json();
              console.log(`✅ Automatic re-authentication successful for session ${sessionId}`);
              
              // Update session with new connection info
              session.connectionInfo = {
                instanceUrl: tokenResponse.instance_url,
                accessToken: tokenResponse.access_token,
                apiVersion: '59.0'
              };
              sessions.set(sessionId, session);
              
              // Return success
              res.json({
                success: true,
                data: {
                  connected: true,
                  instanceUrl: tokenResponse.instance_url,
                  autoReconnected: true,
                  message: 'Automatically reconnected to Salesforce'
                },
                timestamp: new Date().toISOString()
              });
            } else {
              // Auto-reconnection failed - log the actual error
              const errorText = await response.text();
              console.error(`❌ Automatic re-authentication failed for session ${sessionId}`);
              console.error(`   Status: ${response.status}, Error: ${errorText}`);
              
              // Clear invalid connection info
              delete session.connectionInfo;
              session.currentStep = 'authentication';
              sessions.set(sessionId, session);
              
              res.json({
                success: true,
                data: { 
                  connected: false,
                  hasOAuthConfig: true,
                  needsReconnection: true,
                  message: 'Automatic reconnection failed. Please check your credentials.',
                  error: 'AUTO_RECONNECT_FAILED',
                  details: errorText
                },
                timestamp: new Date().toISOString()
              });
            }
          } catch (reconnectError) {
            console.error(`❌ Error during automatic re-authentication:`, reconnectError);
            
            // Clear invalid connection info
            delete session.connectionInfo;
            session.currentStep = 'authentication';
            sessions.set(sessionId, session);
            
            res.json({
              success: true,
              data: { 
                connected: false,
                hasOAuthConfig: true,
                needsReconnection: true,
                message: 'Could not automatically reconnect. Please authenticate manually.',
                error: reconnectError.message
              },
              timestamp: new Date().toISOString()
            });
          }
        } else {
          // No OAuth config available for auto-reconnect
          delete session.connectionInfo;
          session.currentStep = 'authentication';
          sessions.set(sessionId, session);
          
          res.json({
            success: true,
            data: { 
              connected: false,
              message: 'Your Salesforce session has expired. Please authenticate again.',
              error: 'INVALID_SESSION_ID'
            },
            timestamp: new Date().toISOString()
          });
        }
      }
    } else if (oauthConfig && oauthConfig.clientId && oauthConfig.clientSecret) {
      // We have OAuth config but no session - automatically authenticate
      console.log(`🔄 Attempting automatic authentication for session ${sessionId} using stored credentials`);
      
      try {
        const baseUrl = oauthConfig.loginUrl || oauthConfig.instanceUrl || 'https://login.salesforce.com';
        const tokenUrl = `${baseUrl}/services/oauth2/token`;
        
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', oauthConfig.clientId);
        params.append('client_secret', oauthConfig.clientSecret);
        
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        });
        
        if (response.ok) {
          const tokenResponse = await response.json();
          console.log(`✅ Automatic authentication successful for session ${sessionId}`);
          
          // Create/update session with connection info
          const updatedSession = session || {
            id: sessionId,
            currentStep: 'discovery',
            createdAt: new Date(),
            updatedAt: new Date(),
            completed: false
          };
          
          updatedSession.connectionInfo = {
            instanceUrl: tokenResponse.instance_url,
            accessToken: tokenResponse.access_token,
            apiVersion: '59.0'
          };
          
          sessions.set(sessionId, updatedSession);
          
          // Return success
          res.json({
            success: true,
            data: {
              connected: true,
              instanceUrl: tokenResponse.instance_url,
              autoConnected: true,
              message: 'Automatically connected to Salesforce using stored credentials'
            },
            timestamp: new Date().toISOString()
          });
        } else {
          // Auto-connection failed - log the actual error
          const errorText = await response.text();
          console.error(`❌ Automatic authentication failed for session ${sessionId}`);
          console.error(`   Status: ${response.status}, Error: ${errorText}`);
          
          res.json({
            success: true,
            data: { 
              connected: false,
              hasOAuthConfig: true,
              needsReconnection: true,
              message: 'Could not connect with stored credentials. Please re-enter your credentials.',
              error: 'AUTO_CONNECT_FAILED',
              details: errorText
            },
            timestamp: new Date().toISOString()
          });
        }
      } catch (connectError) {
        console.error(`❌ Error during automatic authentication:`, connectError);
        
        res.json({
          success: true,
          data: { 
            connected: false,
            hasOAuthConfig: true,
            needsReconnection: true,
            message: 'Could not connect automatically. Please authenticate manually.',
            error: connectError.message
          },
          timestamp: new Date().toISOString()
        });
      }
    } else {
      res.json({
        success: true,
        data: { connected: false },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Auth status error:', error);
    res.json({
      success: true,
      data: { connected: false },
      timestamp: new Date().toISOString()
    });
  }
});

// Targeted field analysis for selected objects
app.post('/api/discovery/analyze-fields/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;
  const { objectNames } = req.body;
  
  if (!objectNames || !Array.isArray(objectNames)) {
    return res.status(400).json({
      success: false,
      error: 'objectNames array is required',
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({
    success: true,
    data: { started: true },
    timestamp: new Date().toISOString()
  });
  
  try {
    const session = sessions.get(sessionId);
    if (!session || !session.connectionInfo) {
      console.error(`❌ No connection info found for session: ${sessionId}`);
      return;
    }
    
    console.log(`🔬 Starting targeted field analysis for ${objectNames.length} objects in session: ${sessionId}`);
    
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    io.to(sessionId).emit('progress', {
      sessionId,
      step: 'field-analysis',
      message: `Starting field analysis for ${objectNames.length} selected objects...`,
      data: { current: 0, total: objectNames.length }
    });
    
    const analyzedObjects = {};
    let processedCount = 0;
    
    for (const objectName of objectNames) {
      try {
        io.to(sessionId).emit('progress', {
          sessionId,
          step: 'field-analysis',
          message: `Analyzing fields for ${objectName}...`,
          data: { current: processedCount, total: objectNames.length }
        });
        
        const describe = await conn.sobject(objectName).describe();
        
        // DEBUG: Log raw JSforce metadata for Account Name field to understand required field detection
        if (objectName === 'Account') {
          const nameField = describe.fields.find(f => f.name === 'Name');
          console.log(`🔍 DEBUG: Account Name field raw metadata:`, {
            name: nameField?.name,
            nillable: nameField?.nillable,
            defaultedOnCreate: nameField?.defaultedOnCreate,
            calculated: nameField?.calculated,
            createable: nameField?.createable,
            type: nameField?.type,
            computed_required: !nameField?.nillable && !nameField?.defaultedOnCreate
          });
          
          // Log all fields that would be considered "required" by our logic
          const allRequiredFields = describe.fields.filter(f => !f.nillable && !f.defaultedOnCreate);
          console.log(`🔍 DEBUG: All fields detected as required by our logic for Account:`, 
            allRequiredFields.map(f => ({ name: f.name, nillable: f.nillable, defaultedOnCreate: f.defaultedOnCreate }))
          );
        }
        
        // DEBUG: Log metadata for formula fields
        
        analyzedObjects[objectName] = {
          name: objectName,
          label: describe.label,
          fields: describe.fields.map(field => ({
            name: field.name,
            label: field.label,
            type: field.type,
            length: field.length && field.length > 0 ? field.length : null,
            required: !field.nillable && !field.defaultedOnCreate,
            referenceTo: field.referenceTo,
            relationshipName: field.relationshipName,
            custom: field.custom,
            // CRITICAL: Include formula field detection properties
            calculated: field.calculated,
            calculatedFormula: field.calculatedFormula,
            createable: field.createable,
            autoNumber: field.autoNumber,
            // Include additional metadata for completeness
            nillable: field.nillable,
            defaultedOnCreate: field.defaultedOnCreate,
            // Enhanced picklist metadata with validFor bitmap data intact
            picklistValues: field.picklistValues,
            // CRITICAL: Include controlling field relationship metadata for dependent picklists
            controllerName: field.controllerName,
            dependentPicklist: field.dependentPicklist
          })),
          fieldCount: describe.fields.length,
          relationships: describe.fields.filter(field => field.type === 'reference').map(field => ({
            field: field.name,
            referenceTo: field.referenceTo,
            relationshipName: field.relationshipName
          }))
        };
        
        processedCount++;
        
        // Emit progress every object
        io.to(sessionId).emit('progress', {
          sessionId,
          step: 'field-analysis',
          message: `Analyzed ${processedCount} of ${objectNames.length} objects...`,
          data: { current: processedCount, total: objectNames.length }
        });
        
      } catch (error) {
        console.error(`Failed to analyze fields for ${objectName}:`, error.message);
      }
    }
    
    // Save field analysis results to session
    session.fieldAnalysis = analyzedObjects;
    
    // Process state-country picklist mappings for smart address generation
    session.stateCountryMappings = await processStateCountryMappings(analyzedObjects, sessionId);
    
    session.updatedAt = new Date();
    sessions.set(sessionId, session);
    
    console.log(`✅ Field analysis completed for ${processedCount} objects`);
    
    io.to(sessionId).emit('step-complete', {
      sessionId,
      step: 'field-analysis',
      message: 'Field analysis completed successfully!',
      data: { analyzedObjects: processedCount }
    });
    
  } catch (error) {
    console.error('Field analysis error:', error);
    io.to(sessionId).emit('error', {
      sessionId,
      step: 'field-analysis',
      error: 'Field analysis failed: ' + error.message
    });
  }
});

/**
 * Process state-country picklist mappings from field analysis results
 * Identifies controlling field relationships and creates cached mappings for data generation
 */
async function processStateCountryMappings(analyzedObjects, sessionId) {
  console.log(`🌍 Processing state-country picklist mappings for ${Object.keys(analyzedObjects).length} objects`);
  
  const mappings = {};
  
  try {
    // Look for state-country field pairs in each object
    for (const [objectName, objectData] of Object.entries(analyzedObjects)) {
      const fields = objectData.fields || [];
      
      // Find potential state and country field pairs
      const addressFields = findAddressFieldPairs(fields, objectName);
      
      for (const pair of addressFields) {
        const { stateField, countryField, prefix } = pair;
        
        // Only process if both fields have picklist values and state has controlling field
        if (stateField.dependentPicklist && 
            stateField.controllerName === countryField.name &&
            stateField.picklistValues && 
            countryField.picklistValues) {
          
          console.log(`🔗 Found dependent picklist: ${objectName}.${stateField.name} -> ${countryField.name}`);
          
          // Create cached mapping using sessionId + field combination as key
          const cacheKey = `${sessionId}_${objectName}_${prefix}`;
          const mapping = getCachedMapping(cacheKey, stateField, countryField);
          
          // Store mapping for use during data generation
          mappings[`${objectName}.${prefix}`] = {
            objectName,
            stateField: stateField.name,
            countryField: countryField.name,
            prefix,
            mapping: mapping,
            cacheKey
          };
        }
      }
    }
    
    const mappingCount = Object.keys(mappings).length;
    console.log(`✅ Created ${mappingCount} state-country mappings`);
    
    return mappings;
    
  } catch (error) {
    console.error('Error processing state-country mappings:', error);
    return {}; // Return empty object on error, fallback to hardcoded values
  }
}

/**
 * Find address field pairs (state/country) in object fields
 * Recognizes common Salesforce address patterns: Billing, Shipping, Mailing, Other
 */
function findAddressFieldPairs(fields, objectName) {
  const pairs = [];
  const addressPrefixes = ['Billing', 'Shipping', 'Mailing', 'Other', '']; // Empty for base fields
  
  for (const prefix of addressPrefixes) {
    const stateFieldName = prefix ? `${prefix}StateCode` : 'StateCode';
    const countryFieldName = prefix ? `${prefix}CountryCode` : 'CountryCode';
    
    const stateField = fields.find(f => f.name === stateFieldName);
    const countryField = fields.find(f => f.name === countryFieldName);
    
    if (stateField && countryField && stateField.type === 'picklist' && countryField.type === 'picklist') {
      pairs.push({
        stateField,
        countryField,
        prefix: prefix || 'Base',
        objectName
      });
      
      console.log(`📍 Found address pair in ${objectName}: ${stateFieldName} -> ${countryFieldName}`);
    }
  }
  
  return pairs;
}

// Helper function to get field count for an object
async function getFieldCount(conn, objectName) {
  try {
    const describe = await conn.sobject(objectName).describe();
    return describe.fields ? describe.fields.length : 0;
  } catch (error) {
    console.error(`Failed to get field count for ${objectName}:`, error.message);
    return 0;
  }
}

// Helper function to decode state-country mappings from validFor bitmaps
function decodeStateCountryMappings(countries, states) {
  // Direct country-to-states mapping to avoid overwriting issues
  const countryToStates = {};
  
  states.forEach(state => {
    if (!state.validFor) return;
    
    try {
      // Decode base64 validFor to binary and check which countries are valid
      const validForBytes = Buffer.from(state.validFor, 'base64');
      
      countries.forEach((country, countryIndex) => {
        const byteIndex = Math.floor(countryIndex / 8);
        const bitIndex = countryIndex % 8;
        
        if (byteIndex < validForBytes.length) {
          const isValid = (validForBytes[byteIndex] & (128 >> bitIndex)) !== 0;
          if (isValid) {
            // Initialize country array if needed
            if (!countryToStates[country.value]) {
              countryToStates[country.value] = [];
            }
            
            // Add state if not already present
            if (!countryToStates[country.value].includes(state.value)) {
              countryToStates[country.value].push(state.value);
            }
          }
        }
      });
    } catch (error) {
      console.log(`⚠️ Error decoding validFor for state ${state.value}:`, error.message);
    }
  });
  
  // Sort states for each country
  Object.keys(countryToStates).forEach(countryCode => {
    countryToStates[countryCode].sort();
  });
  
  return countryToStates;
}

// Helper function to get country name from code
function getCountryNameFromCode(countryCode) {
  const countryNames = {
    'AU': 'Australia',
    'US': 'United States',
    'CA': 'Canada',
    'GB': 'United Kingdom',
    'NZ': 'New Zealand',
    'IE': 'Ireland',
    'FR': 'France',
    'DE': 'Germany',
    'ES': 'Spain',
    'IT': 'Italy',
    'NL': 'Netherlands',
    'BE': 'Belgium',
    'CH': 'Switzerland',
    'AT': 'Austria',
    'SE': 'Sweden',
    'NO': 'Norway',
    'DK': 'Denmark',
    'FI': 'Finland',
    'JP': 'Japan',
    'CN': 'China',
    'IN': 'India',
    'BR': 'Brazil',
    'MX': 'Mexico'
  };
  
  return countryNames[countryCode] || countryCode;
}

// Real Salesforce discovery
app.post('/api/discovery/start/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;
  
  res.json({
    success: true,
    data: { started: true },
    timestamp: new Date().toISOString()
  });
  
  // Start real discovery process
  console.log(`🔍 Starting real Salesforce discovery for session: ${sessionId}`);
  
  try {
    const session = sessions.get(sessionId);
    if (!session || !session.connectionInfo) {
      console.error(`❌ No connection info found for session: ${sessionId}`);
      io.to(sessionId).emit('error', {
        sessionId,
        step: 'discovery',
        error: 'No active Salesforce connection found'
      });
      return;
    }
    
    // Emit progress updates
    io.to(sessionId).emit('progress', {
      sessionId,
      step: 'discovery', 
      progress: 10,
      message: 'Connecting to Salesforce...',
      data: { discovered: 0, total: 0 }
    });
    
    // Use jsforce to discover objects
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    io.to(sessionId).emit('progress', {
      sessionId,
      step: 'discovery', 
      progress: 20,
      message: 'Fetching object list...',
      data: { discovered: 0, total: 0 }
    });
    
    // Get global describe to list all objects
    const describe = await conn.describeGlobal();
    const allObjects = describe.sobjects;
    
    console.log(`📊 Found ${allObjects.length} objects in org`);
    
    io.to(sessionId).emit('progress', {
      sessionId,
      step: 'discovery', 
      progress: 20,
      message: `Found ${allObjects.length} objects. Filtering to data objects...`,
      data: { discovered: 0, total: allObjects.length }
    });
    
    // Filter to data objects only (exclude metadata and system objects)
    const dataObjects = allObjects.filter(obj => {
      // Must be creatable to accept data
      if (!obj.createable) return false;
      
      // Exclude metadata objects (code, configuration, settings)
      const metadataObjects = [
        'ApexClass', 'ApexComponent', 'ApexPage', 'ApexTrigger',
        'StaticResource', 'CustomApplication', 'CustomTab',
        'Dashboard', 'Report', 'EmailTemplate', 'Document',
        'Folder', 'Flow', 'FlowDefinition', 'WorkflowRule',
        'ValidationRule', 'CustomField', 'CustomObject',
        'Profile', 'PermissionSet', 'Role', 'Group',
        'Queue', 'Territory', 'BusinessProcess', 'RecordType',
        'Layout', 'ListView', 'CustomSetting', 'RemoteSiteSetting',
        'ConnectedApplication', 'OAuthToken', 'LoginHistory',
        'SetupEntityAccess', 'ObjectPermissions', 'FieldPermissions',
        'FlowInterview', 'FlowStageRelation', 'FlowRecordRelation'
      ];
      
      if (metadataObjects.includes(obj.name)) return false;
      
      // Exclude system/tracking objects that don't hold business data
      const systemObjects = [
        'ContentVersion', 'ContentDocument', 'Attachment', 'Note',
        'LoginHistory', 'LoginIp', 'AsyncApexJob', 'CronTrigger',
        'ProcessInstance', 'ProcessInstanceHistory', 'ProcessInstanceStep',
        'ProcessInstanceWorkitem', 'DuplicateRecordSet', 'DuplicateRecordItem',
        'DataAssessmentFieldMetric', 'DataAssessmentValueMetric',
        'EmailStatus', 'EmailMessage', 'EventBusSubscriber',
        'AuthSession', 'LoginGeo', 'UserLogin', 'SessionHijackingEvent',
        'CredentialStuffingEvent', 'ReportAnomalyEvent', 'SessionPermSetActivation'
      ];
      
      if (systemObjects.includes(obj.name)) return false;
      
      // Exclude objects with specific naming patterns that indicate non-business data
      if (obj.name.endsWith('__History') || 
          obj.name.endsWith('__Share') || 
          obj.name.endsWith('__Tag') ||
          obj.name.endsWith('__Vote') ||
          obj.name.endsWith('__ViewStat') ||
          obj.name.includes('Feed') ||
          obj.name.includes('History') ||
          obj.name.includes('Event') ||
          obj.name.includes('Metric') ||
          obj.name.includes('Log') ||
          obj.name.includes('Session') ||
          obj.name.includes('Permission') ||
          obj.name.includes('Setting')) return false;
      
      // Exclude platform event and change data capture objects
      if (obj.name.endsWith('__e') || obj.name.endsWith('__ChangeEvent')) return false;
      
      // Positive patterns - definitely include common business objects
      const businessObjects = [
        'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Task', 'Event',
        'Campaign', 'Product2', 'Pricebook2', 'PricebookEntry', 'Quote', 'Order',
        'Contract', 'Asset', 'Solution', 'Idea', 'User', 'UserRole'
      ];
      
      if (businessObjects.includes(obj.name)) return true;
      
      // Include custom objects (ending with __c) as they're typically business data
      if (obj.name.endsWith('__c')) return true;
      
      // Include standard objects that don't match exclusion patterns
      // Additional check: must be queryable (indicates it holds actual data)
      return obj.queryable !== false;
    });
    
    console.log(`✅ Filtered to ${dataObjects.length} data objects (excluded ${allObjects.length - dataObjects.length} metadata/system objects)`);
    
    io.to(sessionId).emit('progress', {
      sessionId,
      step: 'discovery', 
      progress: 40,
      message: `Filtered to ${dataObjects.length} data objects. Analyzing details...`,
      data: { discovered: 0, total: dataObjects.length }
    });
    
    const discoveredObjects = [];
    let processedCount = 0;
    
    // Process objects in batches to avoid timeouts
    for (let i = 0; i < dataObjects.length; i += 10) {
      const batch = dataObjects.slice(i, i + 10);
      
      for (const obj of batch) {
        try {
          // Basic object info without field details for speed
          const objectInfo = {
            name: obj.name,
            label: obj.label,
            custom: obj.custom,
            createable: obj.createable,
            keyPrefix: obj.keyPrefix,
            // Field discovery - can be enabled/disabled for performance
            fieldCount: req.body.includeFields ? await getFieldCount(conn, obj.name) : 0
          };
          
          discoveredObjects.push(objectInfo);
          processedCount++;
          
          // Emit progress every 5 objects
          if (processedCount % 5 === 0) {
            io.to(sessionId).emit('progress', {
              sessionId,
              step: 'discovery', 
              progress: 40 + (processedCount / dataObjects.length) * 50,
              message: `Analyzed ${processedCount} of ${dataObjects.length} objects...`,
              data: { discovered: processedCount, total: dataObjects.length }
            });
          }
          
        } catch (error) {
          console.error(`❌ Error processing object ${obj.name}:`, error.message);
          // Continue with other objects
        }
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Save results to session
    session.discoveredObjects = discoveredObjects;
    sessions.set(sessionId, session);
    
    console.log(`✅ Discovery completed: ${discoveredObjects.length} objects discovered`);
    
    io.to(sessionId).emit('step-complete', {
      sessionId,
      step: 'discovery',
      data: { totalObjects: discoveredObjects.length }
    });
    
  } catch (error) {
    console.error('❌ Discovery error:', error);
    io.to(sessionId).emit('error', {
      sessionId,
      step: 'discovery',
      error: error.message || 'Discovery failed'
    });
  }
});

app.get('/api/discovery/results/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  res.json({
    success: true,
    data: session?.discoveredObjects || [],
    timestamp: new Date().toISOString()
  });
});

app.get('/api/discovery/stats/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  const objects = session?.discoveredObjects || [];
  
  res.json({
    success: true,
    data: {
      totalObjects: objects.length,
      customObjects: objects.filter(obj => obj.custom).length,
      standardObjects: objects.filter(obj => !obj.custom).length,
      creatableObjects: objects.filter(obj => obj.createable).length
    },
    timestamp: new Date().toISOString()
  });
});

// Storage information endpoint
app.get('/api/storage/info/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session || !session.connectionInfo) {
      return res.status(401).json({
        success: false,
        error: 'No active Salesforce connection found',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📊 Fetching storage information for session: ${sessionId}`);
    
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    // Query organization limits to get storage information
    const limitsQuery = await conn.request('/services/data/v59.0/limits/');
    
    // Extract storage information from limits
    const dataStorageLimit = limitsQuery.DataStorageMB;
    const fileStorageLimit = limitsQuery.FileStorageMB;
    
    // Calculate total storage (Data + File storage)
    const totalDataStorage = dataStorageLimit?.Max || 0;
    const usedDataStorage = dataStorageLimit?.Remaining ? (totalDataStorage - dataStorageLimit.Remaining) : 0;
    const availableDataStorage = dataStorageLimit?.Remaining || 0;
    
    const totalFileStorage = fileStorageLimit?.Max || 0;
    const usedFileStorage = fileStorageLimit?.Remaining ? (totalFileStorage - fileStorageLimit.Remaining) : 0;
    const availableFileStorage = fileStorageLimit?.Remaining || 0;
    
    // For data seeding, we're primarily concerned with data storage
    const storageInfo = {
      totalStorage: totalDataStorage, // In MB
      usedStorage: usedDataStorage,   // In MB
      availableStorage: availableDataStorage, // In MB
      fileStorage: {
        total: totalFileStorage,
        used: usedFileStorage,
        available: availableFileStorage
      },
      limits: {
        dataStorage: dataStorageLimit,
        fileStorage: fileStorageLimit
      }
    };
    
    console.log(`✅ Storage info retrieved - Available: ${availableDataStorage}MB of ${totalDataStorage}MB data storage`);
    
    res.json({
      success: true,
      data: storageInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Storage info error:', error);
    
    // Provide fallback storage information if API call fails
    const fallbackStorage = {
      totalStorage: 1024, // 1GB default
      usedStorage: 512,   // 512MB used
      availableStorage: 512, // 512MB available
      fileStorage: {
        total: 2048,
        used: 1024,
        available: 1024
      },
      limits: null,
      warning: 'Using estimated storage values - unable to fetch from Salesforce'
    };
    
    res.json({
      success: true,
      data: fallbackStorage,
      timestamp: new Date().toISOString(),
      warning: 'Storage information estimated due to API limitations'
    });
  }
});

// Results endpoints
app.get('/api/results/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { loadSessionId } = req.query;
    
    if (!loadSessionId) {
      return res.status(400).json({
        success: false,
        error: 'Load session ID is required',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📊 Fetching results data for session: ${sessionId}, loadSessionId: ${loadSessionId}`);
    
    // Read main log file
    const mainLogPath = path.join(__dirname, '../../logs', `${loadSessionId}.json`);
    if (!fs.existsSync(mainLogPath)) {
      return res.status(404).json({
        success: false,
        error: 'Load log file not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const mainLogData = JSON.parse(fs.readFileSync(mainLogPath, 'utf8'));
    
    // Read per-object log files
    const objectResults = {};
    const logsDir = path.join(__dirname, '../../logs');
    const logFiles = fs.readdirSync(logsDir).filter(file => 
      file.startsWith(`${loadSessionId}_`) && file.endsWith('.json')
    );
    
    for (const logFile of logFiles) {
      const objectName = logFile.replace(`${loadSessionId}_`, '').replace('.json', '');
      const objectLogPath = path.join(logsDir, logFile);
      try {
        const objectLogData = JSON.parse(fs.readFileSync(objectLogPath, 'utf8'));
        objectResults[objectName] = objectLogData;
      } catch (error) {
        console.warn(`Could not read object log for ${objectName}:`, error.message);
      }
    }
    
    // Aggregate data for charts and analysis
    const aggregatedData = {
      summary: mainLogData.summary,
      sessionInfo: mainLogData.sessionInfo,
      objectResults: mainLogData.objectResults,
      perObjectLogs: objectResults,
      chartData: {
        successRateByObject: mainLogData.objectResults.map(obj => ({
          name: obj.objectName,
          successRate: parseFloat(obj.successRate.replace('%', '')),
          attempted: obj.recordsAttempted,
          created: obj.recordsCreated,
          failed: obj.recordsFailed
        })),
        recordsDistribution: mainLogData.objectResults.map(obj => ({
          name: obj.objectName,
          value: obj.recordsCreated,
          attempted: obj.recordsAttempted
        })),
        processingTime: mainLogData.objectResults.map(obj => ({
          name: obj.objectName,
          time: parseInt(obj.timeTaken.replace('ms', ''))
        }))
      },
      errorAnalysis: {
        totalErrors: mainLogData.summary.totalRecordsAttempted - mainLogData.summary.totalRecordsCreated,
        objectsWithErrors: mainLogData.summary.objectsWithErrors,
        mostCommonErrors: mainLogData.summary.mostCommonErrors,
        errorsByObject: mainLogData.objectResults
          .filter(obj => obj.recordsFailed > 0)
          .map(obj => ({
            name: obj.objectName,
            errorCount: obj.recordsFailed,
            errors: objectResults[obj.objectName]?.summary?.errors || []
          }))
      },
      performance: {
        totalTime: mainLogData.summary.totalTimeTaken,
        averageTimePerObject: mainLogData.summary.averageTimePerObject,
        recordsPerSecond: Math.round(mainLogData.summary.totalRecordsCreated / (mainLogData.summary.totalTimeTaken / 1000)),
        throughput: mainLogData.objectResults.map(obj => ({
          name: obj.objectName,
          recordsPerSecond: Math.round(obj.recordsCreated / (parseInt(obj.timeTaken.replace('ms', '')) / 1000))
        }))
      }
    };
    
    res.json({
      success: true,
      data: aggregatedData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching results data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to aggregate results data',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Execution endpoints
app.post('/api/execution/start/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { configuration, globalSettings, fieldAnalysis } = req.body;
    
    if (!configuration || !fieldAnalysis) {
      return res.status(400).json({
        success: false,
        error: 'Configuration and field analysis are required',
        timestamp: new Date().toISOString()
      });
    }
    
    const session = sessions.get(sessionId);
    if (!session || !session.connectionInfo) {
      return res.status(401).json({
        success: false,
        error: 'No active Salesforce connection found',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🚀 Starting data generation execution for session: ${sessionId}`);
    
    // Start execution process asynchronously
    startDataGeneration(sessionId, configuration, globalSettings, fieldAnalysis, session.connectionInfo);
    
    res.json({
      success: true,
      data: { started: true },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Execution start error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Store Standard Pricebook ID for PricebookEntry creation
let standardPricebookId = null;

// Manual validation rule restoration endpoint
app.post('/api/validation-rules/restore/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session || !session.connectionInfo) {
      return res.status(401).json({
        success: false,
        error: 'No active Salesforce connection found',
        timestamp: new Date().toISOString()
      });
    }
    
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    console.log(`🔧 Manual validation rule restoration requested for session: ${sessionId}`);
    const result = await restoreValidationRules(conn, session);
    
    res.json({
      success: true,
      data: {
        restored: result.restored?.length || 0,
        failed: result.failed?.length || 0,
        details: result
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Manual validation rule restoration error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Check if validation rules need restoration
app.get('/api/validation-rules/status/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const needsRestoration = session.disabledValidationRules && session.disabledValidationRules.length > 0;
    
    res.json({
      success: true,
      data: {
        needsRestoration,
        disabledCount: session.disabledValidationRules?.length || 0,
        disabledAt: session.validationRulesDisabledAt || null,
        rules: session.disabledValidationRules || []
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Validation rule status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// EMERGENCY: Restore known disabled validation rules
app.post('/api/validation-rules/emergency-restore/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);
    
    if (!session || !session.connectionInfo) {
      return res.status(401).json({
        success: false,
        error: 'No active Salesforce connection found. Please authenticate first.',
        timestamp: new Date().toISOString()
      });
    }
    
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    // Known disabled validation rules from the logs
    const knownDisabledRules = [
      // Account rules (7)
      'Account.Fax_Incorrect_Format',
      'Account.ACN_Valid',
      'Account.Vendor_Business_Required_Fields',
      'Account.Vendor_Person_Required_Fields',
      'Account.ABN_Valid',
      'Account.SAP_Reference_Digits_Only',
      'Account.Phone_Incorrect_Format',
      
      // Contact rules (3)
      'Contact.Fax_Incorrect_Format',
      'Contact.Mobile_Incorrect_Format',
      'Contact.Phone_Incorrect_Format',
      
      // Head_Lease__c rules (12)
      'Head_Lease__c.LED_Services_Paid_Required',
      'Head_Lease__c.Monthly_Payments_Commencement_Date',
      'Head_Lease__c.Body_Corporate_Required',
      'Head_Lease__c.DoE_GEH_Commencement_Date_Required',
      'Head_Lease__c.Apportionment_Services_Required',
      'Head_Lease__c.Included_Excluded_Required',
      'Head_Lease__c.Services_Required',
      'Head_Lease__c.GEH_Commencement_Date',
      'Head_Lease__c.LED_Commencement_Date_Required',
      'Head_Lease__c.GEH_Rent_Required',
      'Head_Lease__c.Special_Conditions_Required',
      'Head_Lease__c.Lessee_Local_Rep_Required',
      
      // Contract rules (1)
      'Contract.End_Date'
    ];
    
    console.log(`🚨 EMERGENCY: Restoring ${knownDisabledRules.length} validation rules that were disabled`);
    
    const restored = [];
    const failed = [];
    conn.timeout = 120000; // 2 minutes
    
    for (const ruleName of knownDisabledRules) {
      try {
        console.log(`🔧 Restoring validation rule: ${ruleName}`);
        
        // Read current rule
        const rule = await conn.metadata.read('ValidationRule', ruleName);
        
        if (rule && !rule.active) {
          // Re-enable the rule
          await conn.metadata.update('ValidationRule', {
            ...rule,
            active: true,
            fullName: ruleName
          });
          
          restored.push(ruleName);
          console.log(`✅ Restored validation rule: ${ruleName}`);
        } else if (rule && rule.active) {
          console.log(`ℹ️ Validation rule already active: ${ruleName}`);
          restored.push(ruleName + ' (already active)');
        } else {
          console.log(`⚠️ Could not find validation rule: ${ruleName}`);
          failed.push({ rule: ruleName, error: 'Rule not found' });
        }
      } catch (error) {
        console.error(`❌ Failed to restore validation rule ${ruleName}: ${error.message}`);
        failed.push({ rule: ruleName, error: error.message });
      }
    }
    
    console.log(`🏁 Emergency restoration completed: ${restored.length} restored, ${failed.length} failed`);
    
    res.json({
      success: true,
      data: {
        totalAttempted: knownDisabledRules.length,
        restored: restored.length,
        failed: failed.length,
        restoredRules: restored,
        failedRules: failed
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Emergency validation rule restoration error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Create Standard PricebookEntry records for all products
async function createStandardPricebookEntries(productIds, standardPricebookId, fieldAnalysis, sessionId) {
  const createdIds = [];
  
  try {
    const standardEntries = productIds.map((productId, index) => ({
      Pricebook2Id: standardPricebookId,
      Product2Id: productId,
      UnitPrice: 100 + (index * 10), // Simple pricing: $100, $110, $120, etc.
      IsActive: true
    }));
    
    console.log(`📋 Creating ${standardEntries.length} Standard PricebookEntry records`);
    
    // Use the same connection logic as main execution
    const connInfo = sessions.get(sessionId)?.connectionInfo;
    if (!connInfo) {
      throw new Error('No connection info found for session');
    }
    
    const conn = new jsforce.Connection({
      instanceUrl: connInfo.instanceUrl,
      accessToken: connInfo.accessToken,
      version: connInfo.apiVersion || '59.0'
    });
    
    const results = await conn.sobject('PricebookEntry').create(standardEntries);
    const resultsArray = Array.isArray(results) ? results : [results];
    const successfulRecords = resultsArray.filter(r => r.success);
    
    if (successfulRecords.length > 0) {
      createdIds.push(...successfulRecords.map(r => r.id));
    }
    
    // Log any failures
    const failures = resultsArray.filter(r => !r.success);
    if (failures.length > 0) {
      console.warn(`⚠️  ${failures.length} Standard PricebookEntry records failed`);
      failures.slice(0, 3).forEach((failure, idx) => {
        const errorMsg = failure.errors?.map(e => e.message).join(', ') || 'Unknown error';
        console.warn(`  Standard PricebookEntry failure ${idx + 1}: ${errorMsg}`);
      });
    }
    
  } catch (error) {
    console.error('Error creating Standard PricebookEntry records:', error);
    io.to(sessionId).emit('execution-log', `Error creating Standard PricebookEntry records: ${error.message}`);
  }
  
  return createdIds;
}

// Data generation process
async function startDataGeneration(sessionId, configuration, globalSettings, fieldAnalysis, connectionInfo) {
  const startTime = new Date();
  const loadSessionId = `load_${startTime.toISOString().replace(/[:.]/g, '-')}_${Math.random().toString(36).substr(2, 6)}`;
  
  // Initialize comprehensive load log
  const loadLog = {
    sessionInfo: {
      sessionId: loadSessionId,
      webSessionId: sessionId,
      startTime: startTime.toISOString(),
      endTime: null,
      duration: null
    },
    summary: {
      successRate: 0,
      totalRecordsAttempted: 0,
      totalRecordsCreated: 0,
      totalTimeTaken: 0,
      averageTimePerObject: 0,
      objectsWithErrors: [],
      mostCommonErrors: []
    },
    objectResults: []
  };
  
  // Initialize connection variable outside try block for finally block access
  let conn = null;
  const shouldDisableValidationRules = globalSettings?.skipValidationRules || false;
  const objectNames = Object.keys(configuration).filter(name => configuration[name].enabled);
  
  try {
    // Clear previous record IDs for fresh execution
    Object.keys(generatedRecordIds).forEach(key => delete generatedRecordIds[key]);
    standardPricebookId = null;
    
    console.log(`📊 Data generation starting for ${Object.keys(configuration).length} objects`);
    console.log(`📋 Load log session: ${loadSessionId}`);
    io.to(sessionId).emit('execution-log', `Starting load session: ${loadSessionId}`);
    
    conn = new jsforce.Connection({
      instanceUrl: connectionInfo.instanceUrl,
      accessToken: connectionInfo.accessToken,
      version: connectionInfo.apiVersion || '59.0'
    });
    
    // Handle validation rule toggling if enabled
    
    if (shouldDisableValidationRules) {
      try {
        console.log(`🔧 Disabling validation rules for ${objectNames.length} objects...`);
        io.to(sessionId).emit('execution-log', `Temporarily disabling validation rules for data load...`);
        await disableValidationRules(conn, objectNames, { sessionId });
        io.to(sessionId).emit('execution-log', `✅ Validation rules disabled successfully`);
      } catch (error) {
        console.warn(`⚠️ Failed to disable validation rules: ${error.message}`);
        io.to(sessionId).emit('execution-log', `WARNING: Could not disable validation rules: ${error.message}`);
      }
    }
    
    // Query Standard Pricebook ID if we're loading PricebookEntry records
    if (configuration['PricebookEntry'] && configuration['PricebookEntry'].enabled) {
      try {
        const standardPricebook = await conn.query("SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1");
        if (standardPricebook.records && standardPricebook.records.length > 0) {
          standardPricebookId = standardPricebook.records[0].Id;
          console.log(`📋 Found Standard Pricebook: ${standardPricebookId}`);
          io.to(sessionId).emit('execution-log', `Found Standard Pricebook for PricebookEntry creation`);
        } else {
          console.warn('⚠️  No Standard Pricebook found - PricebookEntry creation may fail');
          io.to(sessionId).emit('execution-log', 'WARNING: No Standard Pricebook found');
        }
      } catch (error) {
        console.error('Error querying Standard Pricebook:', error);
        io.to(sessionId).emit('execution-log', `Error querying Standard Pricebook: ${error.message}`);
      }
    }
    
    const enabledObjects = Object.values(configuration).filter(config => config.enabled);
    const totalRecords = enabledObjects.reduce((sum, config) => sum + config.recordCount, 0);
    
    // Initialize progress tracking
    let completedObjects = 0;
    let generatedRecords = 0;
    let loadedRecords = 0;
    
    io.to(sessionId).emit('execution-log', 'Starting data generation...');
    io.to(sessionId).emit('execution-log', `Processing ${enabledObjects.length} objects with ${totalRecords} total records`);
    
    // Sort objects by dependency order (similar to preview step logic)
    const orderedObjects = sortObjectsByDependencies(enabledObjects, fieldAnalysis);
    
    for (const config of orderedObjects) {
      const objectStartTime = new Date();
      let objectResult = null;
      
      try {
        const objectName = config.name;
        const recordCount = config.recordCount;
        
        io.to(sessionId).emit('execution-log', `Generating ${recordCount} records for ${objectName}...`);
        
        // Update object progress to "generating"
        io.to(sessionId).emit('execution-progress', {
          currentObject: objectName,
          totalObjects: enabledObjects.length,
          completedObjects,
          totalRecords,
          generatedRecords,
          loadedRecords,
          objectProgress: {
            [objectName]: {
              name: objectName,
              status: 'generating',
              generated: 0,
              loaded: 0,
              total: recordCount
            }
          }
        });
        
        // Generate sample data for this object
        const records = await generateSampleRecords(objectName, recordCount, fieldAnalysis[objectName], conn, sessionId);
        
        io.to(sessionId).emit('execution-log', `Generated ${records.length} records for ${objectName}`);
        generatedRecords += records.length;
        
        // Update object progress to "loading"
        io.to(sessionId).emit('execution-progress', {
          currentObject: objectName,
          totalObjects: enabledObjects.length,
          completedObjects,
          totalRecords,
          generatedRecords,
          loadedRecords,
          objectProgress: {
            [objectName]: {
              name: objectName,
              status: 'loading',
              generated: records.length,
              loaded: 0,
              total: recordCount
            }
          }
        });
        
        // Load records into Salesforce
        let currentObjectSuccessCount = 0;
        if (records.length > 0) {
          io.to(sessionId).emit('execution-log', `Loading ${records.length} records into ${objectName}...`);
          
          // Log sample record for debugging
          io.to(sessionId).emit('execution-log', `Sample record fields: ${Object.keys(records[0]).join(', ')}`);
          
          try {
            const results = await conn.sobject(objectName).create(records);
            const resultsArray = Array.isArray(results) ? results : [results];
            const successCount = resultsArray.filter(r => r.success).length;
            const failures = resultsArray.filter(r => !r.success);
            currentObjectSuccessCount = successCount;
            
            // Prepare object result for logging
            const objectEndTime = new Date();
            objectResult = {
              objectName: objectName,
              recordsAttempted: records.length,
              recordsCreated: successCount,
              recordsFailed: failures.length,
              successRate: `${((successCount / records.length) * 100).toFixed(1)}%`,
              timeTaken: `${objectEndTime.getTime() - objectStartTime.getTime()}ms`,
              generatedData: records,
              results: {
                successful: resultsArray.filter(r => r.success).map((result, index) => ({
                  recordIndex: index + 1,
                  recordId: result.id,
                  data: records[resultsArray.indexOf(result)]
                })),
                failed: failures.map((failure, index) => ({
                  recordIndex: resultsArray.indexOf(failure) + 1,
                  data: records[resultsArray.indexOf(failure)],
                  errors: failure.errors || [{ message: 'Unknown error', statusCode: 'UNKNOWN' }]
                }))
              }
            };
            
            // Special debugging for Pricebook2, Product2, PricebookEntry, and Account
            if (objectName === 'Pricebook2' || objectName === 'Product2' || objectName === 'PricebookEntry' || objectName === 'Account') {
              console.log(`🔍 ${objectName.toUpperCase()} DEBUG - Results:`, JSON.stringify(resultsArray, null, 2));
              io.to(sessionId).emit('execution-log', `🔍 ${objectName.toUpperCase()} DEBUG: ${successCount} successful, ${failures.length} failed`);
              if (failures.length > 0) {
                failures.slice(0, 5).forEach((failure, idx) => { // Limit to first 5 failures
                  console.log(`❌ ${objectName} failure ${idx + 1}:`, JSON.stringify(failure, null, 2));
                  if (failure.errors && failure.errors.length > 0) {
                    failure.errors.forEach(error => {
                      io.to(sessionId).emit('execution-log', `❌ ${objectName} error: ${error.statusCode} - ${error.message} (fields: ${error.fields?.join(', ') || 'none'})`);
                    });
                  } else {
                    io.to(sessionId).emit('execution-log', `❌ ${objectName} failure ${idx + 1}: ${JSON.stringify(failure, null, 2)}`);
                  }
                });
                if (failures.length > 5) {
                  io.to(sessionId).emit('execution-log', `... and ${failures.length - 5} more ${objectName} failures`);
                }
              }
            }
            
            if (failures.length > 0) {
              io.to(sessionId).emit('execution-log', `Failed to create ${failures.length} records for ${objectName}:`);
              
              // Group errors by type for better debugging
              const errorGroups = {};
              failures.forEach((failure, idx) => {
                if (failure.errors && failure.errors.length > 0) {
                  failure.errors.forEach(error => {
                    const key = `${error.statusCode}: ${error.message}`;
                    if (!errorGroups[key]) {
                      errorGroups[key] = { count: 0, fields: new Set(), records: [] };
                    }
                    errorGroups[key].count++;
                    if (error.fields) {
                      error.fields.forEach(field => errorGroups[key].fields.add(field));
                    }
                    if (errorGroups[key].records.length < 2) {
                      errorGroups[key].records.push(idx);
                    }
                  });
                } else {
                  const key = 'Unknown error';
                  if (!errorGroups[key]) {
                    errorGroups[key] = { count: 0, fields: new Set(), records: [] };
                  }
                  errorGroups[key].count++;
                }
              });
              
              // Log grouped errors
              Object.entries(errorGroups).forEach(([errorKey, data]) => {
                io.to(sessionId).emit('execution-log', `  ${errorKey} (${data.count} times)`);
                if (data.fields.size > 0) {
                  io.to(sessionId).emit('execution-log', `    Affected fields: ${Array.from(data.fields).join(', ')}`);
                }
                if (data.records.length > 0 && records[data.records[0]]) {
                  const exampleRecord = records[data.records[0]];
                  const relevantFields = data.fields.size > 0 ? 
                    Object.fromEntries(Object.entries(exampleRecord).filter(([key]) => data.fields.has(key))) :
                    exampleRecord;
                  io.to(sessionId).emit('execution-log', `    Example data: ${JSON.stringify(relevantFields, null, 2)}`);
                }
              });
            }
            
            if (successCount > 0) {
              io.to(sessionId).emit('execution-log', `Successfully loaded ${successCount} of ${records.length} records for ${objectName}`);
              
              // Store successful record IDs for reference lookups
              const successfulRecords = resultsArray.filter(r => r.success);
              if (successfulRecords.length > 0) {
                generatedRecordIds[objectName] = successfulRecords.map(r => r.id);
                console.log(`📝 Stored ${successfulRecords.length} ${objectName} IDs for reference lookups`);
              }
            } else {
              io.to(sessionId).emit('execution-log', `Failed to load any records for ${objectName} - all ${records.length} records failed`);
              
              // If all records failed, check for common issues
              if (records[0]) {
                const providedFields = Object.keys(records[0]);
                const analysis = fieldAnalysis[objectName];
                if (analysis && analysis.fields) {
                  const requiredFields = analysis.fields.filter(f => f.required && !f.defaultedOnCreate);
                  const missingRequiredFields = requiredFields.filter(f => !providedFields.includes(f.name));
                  
                  if (missingRequiredFields.length > 0) {
                    io.to(sessionId).emit('execution-log', `  Possible missing required fields: ${missingRequiredFields.map(f => f.name).join(', ')}`);
                  }
                }
              }
            }
            
            loadedRecords += successCount;
          } catch (bulkError) {
            io.to(sessionId).emit('execution-log', `ERROR during bulk insert for ${objectName}: ${bulkError.message}`);
            console.error(`Bulk insert error for ${objectName}:`, bulkError);
            
            if (bulkError.message.includes('INVALID_FIELD')) {
              io.to(sessionId).emit('execution-log', `  Check field names and permissions for ${objectName}`);
            }
            
            // Create object result for bulk error case
            const objectEndTime = new Date();
            objectResult = {
              objectName: objectName,
              recordsAttempted: records.length,
              recordsCreated: 0,
              recordsFailed: records.length,
              successRate: "0.0%",
              timeTaken: `${objectEndTime.getTime() - objectStartTime.getTime()}ms`,
              generatedData: records,
              results: {
                successful: [],
                failed: records.map((record, index) => ({
                  recordIndex: index + 1,
                  data: record,
                  errors: [{ message: bulkError.message, statusCode: 'BULK_ERROR' }]
                }))
              }
            };
          }
        } else {
          // No records to load - create minimal object result
          const objectEndTime = new Date();
          objectResult = {
            objectName: objectName,
            recordsAttempted: 0,
            recordsCreated: 0,
            recordsFailed: 0,
            successRate: "N/A",
            timeTaken: `${objectEndTime.getTime() - objectStartTime.getTime()}ms`,
            generatedData: [],
            results: {
              successful: [],
              failed: []
            }
          };
        }
        
        // Add object result to load log
        if (objectResult) {
          loadLog.objectResults.push(objectResult);
          loadLog.summary.totalRecordsAttempted += objectResult.recordsAttempted;
          loadLog.summary.totalRecordsCreated += objectResult.recordsCreated;
          if (objectResult.recordsFailed > 0) {
            loadLog.summary.objectsWithErrors.push(objectName);
          }
          
          // Write individual object log file
          try {
            const objectLogPath = path.join(__dirname, '../../logs', `${loadSessionId}_${objectName}.json`);
            const logsDir = path.dirname(objectLogPath);
            if (!fs.existsSync(logsDir)) {
              fs.mkdirSync(logsDir, { recursive: true });
            }
            
            // Create object-specific log with session info and single object result
            const objectSpecificLog = {
              sessionInfo: loadLog.sessionInfo,
              summary: {
                objectName,
                recordsAttempted: objectResult.recordsAttempted,
                recordsCreated: objectResult.recordsCreated,
                recordsFailed: objectResult.recordsFailed,
                successRate: objectResult.successRate,
                timeTaken: objectResult.timeTaken,
                errors: objectResult.results.failed.map(f => f.errors).flat()
              },
              objectResult
            };
            
            fs.writeFileSync(objectLogPath, JSON.stringify(objectSpecificLog, null, 2));
            console.log(`📋 Object log written: ${objectLogPath}`);
          } catch (logError) {
            console.error(`Error writing object log for ${objectName}:`, logError);
          }
        }
        
        completedObjects++;
        
        // Update object progress to "completed" with actual loaded count
        io.to(sessionId).emit('execution-progress', {
          currentObject: completedObjects < enabledObjects.length ? orderedObjects[completedObjects].name : null,
          totalObjects: enabledObjects.length,
          completedObjects,
          totalRecords,
          generatedRecords,
          loadedRecords,
          objectProgress: {
            [objectName]: {
              name: objectName,
              status: 'completed',
              generated: records.length,
              loaded: currentObjectSuccessCount,
              total: recordCount
            }
          }
        });
        
        // Brief pause between objects
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error processing ${config.name}:`, error);
        io.to(sessionId).emit('execution-log', `ERROR processing ${config.name}: ${error.message}`);
        
        // Create error object result
        const objectEndTime = new Date();
        objectResult = {
          objectName: config.name,
          recordsAttempted: config.recordCount,
          recordsCreated: 0,
          recordsFailed: config.recordCount,
          successRate: "0.0%",
          timeTaken: `${objectEndTime.getTime() - objectStartTime.getTime()}ms`,
          generatedData: [],
          results: {
            successful: [],
            failed: [{ 
              recordIndex: 0,
              data: {},
              errors: [{ message: error.message, statusCode: 'PROCESSING_ERROR' }]
            }]
          }
        };
        
        // Add to load log
        loadLog.objectResults.push(objectResult);
        loadLog.summary.totalRecordsAttempted += config.recordCount;
        loadLog.summary.objectsWithErrors.push(config.name);
        
        // Write individual error object log file
        try {
          const objectLogPath = path.join(__dirname, '../../logs', `${loadSessionId}_${config.name}.json`);
          const logsDir = path.dirname(objectLogPath);
          if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
          }
          
          // Create error object-specific log
          const objectSpecificLog = {
            sessionInfo: loadLog.sessionInfo,
            summary: {
              objectName: config.name,
              recordsAttempted: config.recordCount,
              recordsCreated: 0,
              recordsFailed: config.recordCount,
              successRate: "0.0%",
              timeTaken: objectResult.timeTaken,
              errors: [{ message: error.message, statusCode: 'PROCESSING_ERROR' }]
            },
            objectResult
          };
          
          fs.writeFileSync(objectLogPath, JSON.stringify(objectSpecificLog, null, 2));
          console.log(`📋 Error object log written: ${objectLogPath}`);
        } catch (logError) {
          console.error(`Error writing error object log for ${config.name}:`, logError);
        }
        
        io.to(sessionId).emit('execution-progress', {
          objectProgress: {
            [config.name]: {
              name: config.name,
              status: 'error',
              generated: 0,
              loaded: 0,
              total: config.recordCount,
              error: error.message
            }
          }
        });
      }
    }
    
    // Finalize load log
    const endTime = new Date();
    loadLog.sessionInfo.endTime = endTime.toISOString();
    loadLog.sessionInfo.duration = `${endTime.getTime() - startTime.getTime()}ms`;
    loadLog.summary.totalTimeTaken = endTime.getTime() - startTime.getTime();
    loadLog.summary.averageTimePerObject = loadLog.objectResults.length > 0 ? 
      loadLog.summary.totalTimeTaken / loadLog.objectResults.length : 0;
    loadLog.summary.successRate = loadLog.summary.totalRecordsAttempted > 0 ? 
      Math.round((loadLog.summary.totalRecordsCreated / loadLog.summary.totalRecordsAttempted) * 100) : 0;
    
    // Calculate most common errors
    const errorCounts = {};
    loadLog.objectResults.forEach(objectResult => {
      if (objectResult.results && objectResult.results.failed && Array.isArray(objectResult.results.failed)) {
        objectResult.results.failed.forEach(failure => {
          if (failure.errors && Array.isArray(failure.errors)) {
            failure.errors.forEach(error => {
              const errorKey = `${error.statusCode}: ${error.message}`;
              errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
            });
          }
        });
      }
    });
    loadLog.summary.mostCommonErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([error, count]) => ({ error, count }));
    
    // Write log file to logs directory
    const logPath = path.join(__dirname, '../../logs', `${loadSessionId}.json`);
    try {
      // Ensure logs directory exists
      const logsDir = path.dirname(logPath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      fs.writeFileSync(logPath, JSON.stringify(loadLog, null, 2));
      console.log(`📋 Load log written to: ${logPath}`);
      console.log(`📋 Per-object logs written to: logs/${loadSessionId}_[ObjectName].json`);
      io.to(sessionId).emit('execution-log', `Load logs saved: ${loadSessionId}.json (summary) + per-object logs`);
    } catch (logError) {
      console.error('Error writing load log:', logError);
      io.to(sessionId).emit('execution-log', `Warning: Could not save load log: ${logError.message}`);
    }
    
    // Execution completed
    io.to(sessionId).emit('execution-log', `Data generation completed! Generated and loaded ${loadedRecords} total records`);
    io.to(sessionId).emit('execution-complete', {
      totalObjects: enabledObjects.length,
      completedObjects,
      totalRecords,
      generatedRecords,
      loadedRecords,
      loadLogFile: `${loadSessionId}.json`,
      loadSessionId: loadSessionId
    });
    
  } catch (error) {
    console.error('Data generation error:', error);
    io.to(sessionId).emit('execution-log', `FATAL ERROR: ${error.message}`);
    io.to(sessionId).emit('execution-error', { message: error.message });
    
    // Still try to write the log file even with fatal error
    try {
      const endTime = new Date();
      loadLog.sessionInfo.endTime = endTime.toISOString();
      loadLog.sessionInfo.duration = `${endTime.getTime() - startTime.getTime()}ms`;
      loadLog.sessionInfo.fatalError = error.message;
      loadLog.summary.totalTimeTaken = endTime.getTime() - startTime.getTime();
      loadLog.summary.successRate = 0;
      
      const logPath = path.join(__dirname, '../../logs', `${loadSessionId}.json`);
      const logsDir = path.dirname(logPath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      fs.writeFileSync(logPath, JSON.stringify(loadLog, null, 2));
      console.log(`📋 Error log written to: ${logPath}`);
    } catch (logError) {
      console.error('Error writing error log:', logError);
    }
  } finally {
    // Always restore validation rules if they were disabled
    if (shouldDisableValidationRules && conn) {
      try {
        console.log(`🔧 Restoring validation rules...`);
        io.to(sessionId).emit('execution-log', `Restoring validation rules...`);
        const session = sessions.get(sessionId);
        await restoreValidationRules(conn, session);
        io.to(sessionId).emit('execution-log', `✅ Validation rules restored successfully`);
        console.log(`✅ Validation rules restored for session ${sessionId}`);
      } catch (restoreError) {
        console.error(`⚠️ Failed to restore validation rules: ${restoreError.message}`);
        io.to(sessionId).emit('execution-log', `WARNING: Could not restore validation rules: ${restoreError.message}`);
      }
    }
  }
}

// Helper function to sort objects by dependencies
function sortObjectsByDependencies(enabledObjects, fieldAnalysis) {
  const ordered = [];
  const remaining = [...enabledObjects];
  const processed = new Set();
  
  // Simple dependency sorting - add objects with no dependencies first
  let maxIterations = enabledObjects.length * 2;
  while (remaining.length > 0 && maxIterations > 0) {
    const nextBatch = [];
    
    for (let i = remaining.length - 1; i >= 0; i--) {
      const config = remaining[i];
      const analysis = fieldAnalysis[config.name];
      
      const dependencies = analysis?.relationships?.map(rel => rel.referenceTo).flat() || [];
      const relevantDeps = dependencies.filter(dep => enabledObjects.some(obj => obj.name === dep));
      const canProcess = relevantDeps.every(dep => processed.has(dep));
      
      if (canProcess) {
        nextBatch.push(config);
        remaining.splice(i, 1);
        processed.add(config.name);
      }
    }
    
    if (nextBatch.length === 0 && remaining.length > 0) {
      // Circular dependency - add remaining objects anyway
      nextBatch.push(...remaining);
      remaining.length = 0;
    }
    
    ordered.push(...nextBatch);
    maxIterations--;
  }
  
  return ordered;
}

// Store generated record IDs for reference lookups
const generatedRecordIds = {};

// Generate sample records for an object
async function generateSampleRecords(objectName, recordCount, fieldAnalysis, conn, sessionId) {
  const records = [];
  
  if (!fieldAnalysis?.fields) {
    console.warn(`No field analysis found for ${objectName}`);
    return records;
  }
  
  console.log(`🔍 Generating records for ${objectName} with ${fieldAnalysis.fields.length} total fields`);
  
  // Special handling for PricebookEntry - create Standard entries first
  if (objectName === 'PricebookEntry' && standardPricebookId && generatedRecordIds['Product2']) {
    console.log(`📋 Creating Standard PricebookEntry records first`);
    io.to(sessionId).emit('execution-log', `Creating Standard PricebookEntry records for ${generatedRecordIds['Product2'].length} products`);
    
    // Create Standard PricebookEntry records for all products
    const standardEntries = await createStandardPricebookEntries(generatedRecordIds['Product2'], standardPricebookId, fieldAnalysis, sessionId);
    
    if (standardEntries.length > 0) {
      console.log(`✅ Created ${standardEntries.length} Standard PricebookEntry records`);
      io.to(sessionId).emit('execution-log', `Successfully created ${standardEntries.length} Standard PricebookEntry records`);
      
      // Store Standard PricebookEntry IDs
      if (!generatedRecordIds['PricebookEntry']) {
        generatedRecordIds['PricebookEntry'] = [];
      }
      generatedRecordIds['PricebookEntry'].push(...standardEntries);
    }
  }
  
  // Filter to writable fields only
  // IMPORTANT: Exclude formula fields (calculated: true or calculatedFormula property)
  const writableFields = fieldAnalysis.fields.filter(field => {
    // PRIORITY 1: Exclude formula fields first (most specific check)
    if (field.calculated || field.calculatedFormula) {
      console.log(`⚠️ Skipping formula field: ${field.name} (calculated: ${field.calculated}, formula: ${!!field.calculatedFormula})`);
      return false;
    }
    
    // PRIORITY 2: Exclude non-createable fields
    if (field.createable === false) {
      return false;
    }
    
    // PRIORITY 3: Exclude Person Account fields for Business Account creation
    // Person Account fields cause "Business Account may not use Person Account field" errors
    if (objectName === 'Account' && field.name && field.name.startsWith('Person')) {
      console.log(`⚠️ Skipping Person Account field for Business Account: ${field.name}`);
      return false;
    }
    
    // PRIORITY 4: Exclude system fields and other read-only types
    return !isSystemField(field.name) && 
      field.type !== 'calculated' &&
      field.type !== 'summary' &&
      !field.autoNumber;
  });
  
  
  const requiredFields = writableFields.filter(f => f.required && !f.defaultedOnCreate);

  // DEBUG: Check Name field specifically for Account to understand why it's not detected as required
  if (objectName === 'Account') {
    const nameField = writableFields.find(f => f.name === 'Name');
    console.log(`🔍 DEBUG: Account Name field in writableFields after analysis:`, {
      name: nameField?.name,
      required: nameField?.required,
      defaultedOnCreate: nameField?.defaultedOnCreate,
      type: nameField?.type,
      createable: nameField?.createable,
      nillable: nameField?.nillable
    });
    
    console.log(`🔍 DEBUG: Total writableFields: ${writableFields.length}, requiredFields: ${requiredFields.length}`);
    if (requiredFields.length > 0) {
      console.log(`🔍 DEBUG: Required field names: ${requiredFields.map(f => f.name).join(', ')}`);
    }
  }
  
  // Validate that we can generate values for all required fields
  const problematicRequiredFields = requiredFields.filter(field => {
    if (field.type === 'reference' && (!field.referenceTo || field.referenceTo.length === 0)) {
      return true; // Reference field without target
    }
    return false;
  });
  
  if (problematicRequiredFields.length > 0) {
    console.warn(`⚠️  ${objectName} has problematic required fields: ${problematicRequiredFields.map(f => f.name).join(', ')}`);
    io.to(sessionId).emit('execution-log', `Warning: ${objectName} has required reference fields that may cause validation errors`);
  }
  
  console.log(`📝 Found ${writableFields.length} writable fields, ${requiredFields.length} required fields for ${objectName}`);
  
  for (let i = 0; i < recordCount; i++) {
    const record = {};
    
    // Create record context for tracking field relationships (e.g., country-state alignment)
    const recordContext = { recordIndex: i, selectedCountries: {} };
    
    // Sort required fields to ensure CountryCode fields are processed before StateCode fields
    const sortedRequiredFields = [...requiredFields].sort((a, b) => {
      const aIsCountryCode = a.name.toLowerCase().includes('countrycode') || a.name.toLowerCase().includes('country');
      const bIsCountryCode = b.name.toLowerCase().includes('countrycode') || b.name.toLowerCase().includes('country');
      const aIsStateCode = a.name.toLowerCase().includes('statecode') || a.name.toLowerCase().includes('state');
      const bIsStateCode = b.name.toLowerCase().includes('statecode') || b.name.toLowerCase().includes('state');
      
      // Process CountryCode fields before StateCode fields
      if (aIsCountryCode && bIsStateCode) return -1;
      if (aIsStateCode && bIsCountryCode) return 1;
      return 0; // Keep original order for other fields
    });
    
    // Always populate required fields first (in sorted order)
    sortedRequiredFields.forEach(field => {
      const value = generateFieldValueWithContext(field, i, objectName, sessionId, recordContext);
      if (value !== null && value !== undefined) {
        record[field.name] = value;
      }
    });
    
    // Sort optional fields to ensure CountryCode fields are processed before StateCode fields
    const optionalFields = writableFields.filter(f => !f.required || f.defaultedOnCreate);
    const sortedOptionalFields = [...optionalFields].sort((a, b) => {
      const aIsCountryCode = a.name.toLowerCase().includes('countrycode') || a.name.toLowerCase().includes('country');
      const bIsCountryCode = b.name.toLowerCase().includes('countrycode') || b.name.toLowerCase().includes('country');
      const aIsStateCode = a.name.toLowerCase().includes('statecode') || a.name.toLowerCase().includes('state');
      const bIsStateCode = b.name.toLowerCase().includes('statecode') || b.name.toLowerCase().includes('state');
      
      // Process CountryCode fields before StateCode fields
      if (aIsCountryCode && bIsStateCode) return -1;
      if (aIsStateCode && bIsCountryCode) return 1;
      return 0; // Keep original order for other fields
    });
    
    // Track which address fields have been selected to ensure pairs are handled together
    const selectedFields = new Set();
    
    // Populate some optional fields (in sorted order)
    sortedOptionalFields.forEach(field => {
      // Always populate key reference fields and address fields for realistic data
      const isAddressField = field.name.toLowerCase().includes('billing') || 
                             field.name.toLowerCase().includes('shipping') || 
                             field.name.toLowerCase().includes('mailing');
      
      // CRITICAL FIX: Include fields that are required by validation even if metadata shows nillable=true
      const isKnownRequiredField = (
        (objectName === 'Account' && field.name === 'Name') ||
        (objectName === 'Contact' && field.name === 'LastName') ||
        (objectName === 'Lead' && field.name === 'LastName') ||
        (objectName === 'Lead' && field.name === 'Company') ||
        (field.required && !field.defaultedOnCreate)  // Include metadata-detected required fields
      );

      const alwaysPopulate = (
        (objectName === 'Opportunity' && field.name === 'AccountId') ||
        (objectName === 'Contact' && field.name === 'AccountId') ||
        (objectName === 'Asset' && field.name === 'AccountId') ||
        (objectName === 'Opportunity' && field.name === 'ContactId') ||
        field.type === 'reference' && field.name.includes('OwnerId') ||
        isAddressField ||  // CRITICAL FIX: Always populate all address fields to avoid broken pairs
        isKnownRequiredField  // CRITICAL FIX: Always populate required fields (metadata + known exceptions)
      );
      
      // DEBUG: Log when Name field is being processed to verify fix
      if (objectName === 'Account' && field.name === 'Name') {
        console.log(`🔧 FIXED: Account Name field - isKnownRequiredField: ${isKnownRequiredField}, alwaysPopulate: ${alwaysPopulate}`);
      }

      // CRITICAL FIX: Ensure address field pairs are handled together
      let shouldPopulate = alwaysPopulate || Math.random() > 0.5;
      
      // Special logic for address fields to ensure country/state coordination
      const isStateField = field.name.toLowerCase().includes('statecode') || field.name.toLowerCase().includes('state');
      const isCountryField = field.name.toLowerCase().includes('countrycode') || field.name.toLowerCase().includes('country');
      
      if (isStateField) {
        // If this is a state field, ensure its corresponding country field is also selected
        const addressPrefix = field.name.replace(/State.*$/i, '').replace(/.*State/i, '');
        const possibleCountryFields = [
          `${addressPrefix}CountryCode`,
          `${addressPrefix}Country`,
          field.name.replace(/State.*$/i, 'CountryCode'),
          field.name.replace(/State.*$/i, 'Country')
        ];
        
        // Find the corresponding country field
        const countryField = sortedOptionalFields.find(f => 
          possibleCountryFields.some(possible => f.name === possible)
        );
        
        if (countryField && shouldPopulate) {
          // Ensure the country field is processed first if state field is selected
          if (!selectedFields.has(countryField.name)) {
            const countryValue = generateFieldValueWithContext(countryField, i, objectName, sessionId, recordContext);
            if (countryValue !== null && countryValue !== undefined) {
              record[countryField.name] = countryValue;
              selectedFields.add(countryField.name);
              console.log(`🔗 Auto-selected country field ${countryField.name} for state field ${field.name}`);
            }
          }
        }
      }
      
      if (shouldPopulate && !selectedFields.has(field.name)) {
        const value = generateFieldValueWithContext(field, i, objectName, sessionId, recordContext);
        if (value !== null && value !== undefined) {
          record[field.name] = value;
          selectedFields.add(field.name);
        }
      }
    });
    
    records.push(record);
  }
  
  // Enhanced data generation with validation engine (if available)
  if (ValidationEngine && EnhancedDiscoveryService && records.length > 0) {
    try {
      const sessionServices = await initializeSessionValidationEngine(sessionId, conn);
      if (sessionServices) {
        console.log(`🔍 Applying validation engine to ${records.length} ${objectName} records...`);
        io.to(sessionId).emit('execution-log', `🧠 Analyzing validation rules for ${objectName}...`);
        
        // Pre-validate and enhance records using validation engine
        const validationRequest = {
          objectName,
          data: records,
          skipAIAnalysis: records.length > 50, // Skip AI for large batches to avoid rate limits
          includeWarnings: true,
          validationLevel: 'standard'
        };

        const validationResult = await sessionServices.validationEngine.validateData(validationRequest);
        
        if (validationResult.invalidRecords > 0) {
          console.log(`⚠️ Validation found ${validationResult.invalidRecords} invalid records, attempting fixes...`);
          io.to(sessionId).emit('execution-log', `🔧 Fixing ${validationResult.invalidRecords} validation issues...`);
          
          // Apply suggested fixes to invalid records
          const fixedRecords = [];
          for (let i = 0; i < records.length; i++) {
            const recordResult = validationResult.results[i];
            let fixedRecord = { ...records[i] };
            
            if (!recordResult.isValid && recordResult.suggestedFixes.length > 0) {
              // Apply fixes with high confidence
              recordResult.suggestedFixes
                .filter(fix => fix.confidence >= 0.7)
                .forEach(fix => {
                  if (fix.suggestedValue !== null && fix.suggestedValue !== undefined) {
                    fixedRecord[fix.field] = fix.suggestedValue;
                    console.log(`🔧 Fixed ${objectName}[${i}].${fix.field}: ${fix.reason}`);
                  }
                });
            }
            
            fixedRecords.push(fixedRecord);
          }
          
          // Update records with fixes
          records.splice(0, records.length, ...fixedRecords);
          
          // Report validation results
          const successRate = ((validationResult.validRecords / validationResult.totalRecords) * 100).toFixed(1);
          io.to(sessionId).emit('execution-log', `✅ Validation complete: ${successRate}% success rate (${validationResult.validRecords}/${validationResult.totalRecords})`);
          
          if (validationResult.recommendations.length > 0) {
            io.to(sessionId).emit('execution-log', `💡 Recommendations: ${validationResult.recommendations.join(', ')}`);
          }
        } else {
          console.log(`✅ All ${records.length} ${objectName} records passed validation`);
          io.to(sessionId).emit('execution-log', `✅ All ${objectName} records passed validation checks`);
        }
        
        // Clean up validation engine resources
        sessionServices.validationEngine.destroy();
        sessionServices.enhancedDiscovery.destroy();
        
      } else {
        console.log(`⚠️ Validation engine not available for session ${sessionId}`);
      }
    } catch (validationError) {
      console.warn(`⚠️ Validation engine failed for ${objectName}:`, validationError.message);
      io.to(sessionId).emit('execution-log', `⚠️ Validation analysis failed: ${validationError.message}`);
      // Continue without validation enhancement
    }
  }
  
  console.log(`✅ Generated ${records.length} records for ${objectName}. Sample record:`, JSON.stringify(records[0], null, 2));
  
  return records;
}

// Check if field is a system field that cannot be written
function isSystemField(fieldName) {
  // Use the standard rules dictionary
  if (STANDARD_FIELD_RULES.systemFields.includes(fieldName)) {
    return true;
  }
  
  if (STANDARD_FIELD_RULES.calculatedFields.includes(fieldName)) {
    return true;
  }
  
  // System field patterns
  const systemPatterns = [
    '__pc', // Person Contact fields
    '__History', // History tracking
    '__Share', // Sharing
    '__Tag', // Tag fields
    '__Feed', // Feed fields
  ];
  
  return systemPatterns.some(pattern => fieldName.includes(pattern));
}

// Standard Salesforce field validation rules and defaults
const STANDARD_FIELD_RULES = {
  // System fields that should never be set
  systemFields: [
    'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
    'SystemModstamp', 'LastActivityDate', 'LastViewedDate', 'LastReferencedDate',
    'IsDeleted', 'MasterRecordId'
  ],
  
  // Fields that are auto-calculated and shouldn't be set
  calculatedFields: [
    'HasOpportunityLineItem', 'HasOverdueTask', 'IsConverted', 
    'ConvertedAccountId', 'ConvertedContactId', 'ConvertedOpportunityId',
    'ForecastCategory', 'ForecastCategoryName', 'HasSelfServiceUsers',
    'Jigsaw', 'JigsawCompanyId', 'CleanStatus', 'EmailBouncedReason',
    'EmailBouncedDate', 'IsEmailBounced', 'RecordTypeId', 'OwnerId',
    'IsArchived', // System-managed archival field
    'IsStandard', // System-managed standard designation (only one per org)
    'PhotoUrl', // Often read-only due to security restrictions
    // Coordinate fields - let Salesforce auto-geocode from addresses
    'BillingLatitude', 'BillingLongitude',
    'ShippingLatitude', 'ShippingLongitude', 
    'MailingLatitude', 'MailingLongitude',
    'OtherLatitude', 'OtherLongitude',
    'Latitude', 'Longitude', // Generic coordinate fields
    // Person Account coordinate fields (previously missing!)
    'PersonMailingLatitude', 'PersonMailingLongitude',
    'PersonOtherLatitude', 'PersonOtherLongitude',
    // Person Account read-only fields
    'IsPersonAccount', 'PersonLastCUUpdateDate', 'PersonLastCURequestDate',
    // Person Account fields that shouldn't be on Business Accounts  
    'FirstName', 'MiddleName', 'LastName', 'Salutation', 'Suffix',
    // State/Country dependent picklist fields (complex validation)
    'PersonOtherState', 'PersonMailingState', 'BillingState', 'ShippingState',
    // Contact read-only system fields
    'LastCURequestDate', 'LastCUUpdateDate', 'JigsawContactId', 'Membership_Likelihood__c',
    // Lead read-only system fields
    'ConvertedDate', // Set by system when Lead is converted
    // Opportunity read-only system fields
    'PushCount', 'IsClosed', 'IsWon', 'LastStageChangeDate', 'HasOpenActivity', 'ExpectedRevenue',
    'Fiscal', 'FiscalQuarter', 'FiscalYear', // Fiscal fields are auto-calculated from CloseDate
    // Asset read-only calculated fields
    'CurrentQuantity', 'CurrentLifecycleEndDate', 'CurrentAmount', 'LifecycleEndDate', 'CurrentMrr',
    'AssetLevel', 'HasLifecycleManagement', 'TotalLifecycleAmount', 'ProductCode', 'StockKeepingUnit',
    'LifecycleStartDate',
    // Additional system fields found from errors
    'IsDirect', 'User_Is_Active__c', 'Maintenance_Contact__c'
    // Temporarily removing Latitude__c, Longitude__c to debug metadata
    // 'Latitude__c', 'Longitude__c'
  ],
  
  // Special field handling rules
  specialFields: {
    // Account fields
    'Type': { object: 'Account', values: ['Customer - Direct', 'Customer - Channel', 'Partner', 'Prospect'] },
    'Industry': { object: 'Account', values: ['Agriculture', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Other', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities'] },
    'Rating': { object: 'Account', values: ['Hot', 'Warm', 'Cold'] },
    
    // Name field handling - auto-generated from FirstName + LastName for Contact and Lead
    'Name': { objects: ['Contact', 'Lead'], skip: true },
    
    // Geocode accuracy fields (common picklist values)
    'GeocodeAccuracy': { values: ['Address', 'NearAddress', 'Block', 'Street', 'ExtendedZip', 'Zip', 'Neighborhood', 'City', 'County', 'State', 'Unknown'] },
    'Ownership': { object: 'Account', values: ['Public', 'Private', 'Subsidiary', 'Other'] },
    'AccountSource': { object: 'Account', values: ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'] },
    
    // Geocode accuracy fields (common across objects)
    'BillingGeocodeAccuracy': { values: ['Address', 'NearAddress', 'Block', 'Street', 'ExtendedZip', 'Zip', 'Neighborhood', 'City', 'County', 'State', 'Unknown'] },
    'ShippingGeocodeAccuracy': { values: ['Address', 'NearAddress', 'Block', 'Street', 'ExtendedZip', 'Zip', 'Neighborhood', 'City', 'County', 'State', 'Unknown'] },
    'MailingGeocodeAccuracy': { values: ['Address', 'NearAddress', 'Block', 'Street', 'ExtendedZip', 'Zip', 'Neighborhood', 'City', 'County', 'State', 'Unknown'] },
    'OtherGeocodeAccuracy': { values: ['Address', 'NearAddress', 'Block', 'Street', 'ExtendedZip', 'Zip', 'Neighborhood', 'City', 'County', 'State', 'Unknown'] },
    
    // Contact fields
    'Salutation': { object: 'Contact', values: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'] },
    'LeadSource': { object: 'Contact', values: ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'] },
    
    // Lead fields
    'Status': { object: 'Lead', values: ['Open - Not Contacted', 'Working - Contacted', 'Closed - Converted', 'Closed - Not Converted'] },
    'Rating': { object: 'Lead', values: ['Hot', 'Warm', 'Cold'] },
    'Industry': { object: 'Lead', values: ['Agriculture', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Other', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities'] },
    
    // Opportunity fields
    'StageName': { object: 'Opportunity', values: ['Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition', 'Id. Decision Makers', 'Perception Analysis', 'Proposal/Price Quote', 'Negotiation/Review'] },
    'Type': { object: 'Opportunity', values: ['Existing Customer - Upgrade', 'Existing Customer - Replacement', 'Existing Customer - Downgrade', 'New Customer'] },
    'LeadSource': { object: 'Opportunity', values: ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'] },
    'ForecastCategoryName': { skip: true }, // Auto-calculated
    'IsClosed': { object: 'Opportunity', defaultValue: false }, // Don't create closed opportunities
    'IsWon': { object: 'Opportunity', defaultValue: false }, // Don't create won opportunities
    
    // Case fields
    'Status': { object: 'Case', values: ['New', 'Working', 'Escalated', 'Closed'] },
    'Priority': { object: 'Case', values: ['High', 'Medium', 'Low'] },
    'Origin': { object: 'Case', values: ['Phone', 'Email', 'Web'] },
    'Type': { object: 'Case', values: ['Feature Request', 'Question', 'Problem'] },
    'Reason': { object: 'Case', values: ['Installation', 'Equipment Complexity', 'Performance', 'Breakdown'] },
    
    // Product2 fields
    'Family': { object: 'Product2', values: ['Hardware', 'Software', 'Services'] },
    'QuantityUnitOfMeasure': { object: 'Product2', values: ['Each', 'Case', 'Dozen', 'Hour', 'Pound', 'Square Foot'] },
    
    // PricebookEntry fields - special handling needed
    'UseStandardPrice': { object: 'PricebookEntry', defaultValue: false },
    'Name': { object: 'PricebookEntry', skip: true }, // Auto-calculated from Product
    'ProductCode': { object: 'PricebookEntry', skip: true }, // Auto-calculated from Product
    
    // Common checkbox/boolean field defaults - default to true for usable test data
    'IsActive': { defaultValue: true }, // Active records across all objects
    'IsPublic': { defaultValue: true }, // Public visibility
    'IsVisible': { defaultValue: true }, // Visible records
    'IsEnabled': { defaultValue: true }, // Enabled functionality
    'IsDefault': { defaultValue: false }, // Usually don't want multiple defaults
    'IsDeleted': { defaultValue: false }, // Never create deleted records
    'IsClosed': { defaultValue: false }, // Keep opportunities/cases open
    'IsWon': { defaultValue: false }, // Don't pre-close opportunities as won
    'IsPrivate': { defaultValue: false }, // Make records accessible
    'HasOptedOutOfEmail': { defaultValue: false }, // Allow email marketing
    'DoNotCall': { defaultValue: false }, // Allow calls
    'HasOptedOutOfFax': { defaultValue: false }, // Allow fax
    'EmailBouncedReason': { skip: true }, // System field
    'IsEmailBounced': { skip: true }, // System field
    
    // User fields (usually not creatable in most orgs)
    'IsActive': { object: 'User', skip: true },
    'ProfileId': { object: 'User', skip: true }
  },
  
  // Common validation patterns
  patterns: {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    phone: /^\+?[1-9]\d{1,14}$/,
    website: /^https?:\/\/.+\..+/
  }
};

// Cache for StandardValueSet metadata
const standardValueSetCache = new Map();

// ============================================
// VALIDATION RULE MANAGEMENT
// ============================================

/**
 * Disable all active validation rules for specified objects
 * @param {Connection} conn - Salesforce connection
 * @param {string[]} objectNames - Array of object names
 * @param {Object} session - Session object to store disabled rules
 * @returns {Array} List of disabled validation rules
 */
async function disableValidationRules(conn, objectNames, session) {
  console.log(`🔧 Starting to disable validation rules for objects: ${objectNames.join(', ')}`);
  const disabledRules = [];
  
  // Set longer timeout for metadata operations
  conn.timeout = 120000; // 2 minutes
  
  try {
    // First, get ALL validation rules in the org
    console.log(`🔍 Querying all validation rules in org...`);
    const allValidationRules = await conn.metadata.list([
      { type: 'ValidationRule', folder: null }
    ]);
  
  console.log(`🔍 Found ${allValidationRules?.length || 0} total validation rules in org`);
  
  if (allValidationRules && allValidationRules.length > 0) {
    console.log(`🔍 Sample validation rules:`, allValidationRules.slice(0, 5).map(r => r.fullName));
  }
  
  for (const objectName of objectNames) {
    try {
      // Filter rules for this specific object
      const rulesList = allValidationRules?.filter(rule => 
        rule.fullName.startsWith(`${objectName}.`)
      ) || [];
      
      if (rulesList.length === 0) {
        console.log(`ℹ️ No validation rules found for ${objectName}`);
        continue;
      }
      
      console.log(`🔍 Found ${rulesList.length} validation rules for ${objectName}:`, rulesList.map(r => r.fullName));
      
      // Process each rule
      for (const ruleInfo of rulesList) {
        const fullName = ruleInfo.fullName; // Already in format "ObjectName.RuleName"
        
        try {
          // Read the full rule metadata
          const rule = await conn.metadata.read('ValidationRule', fullName);
          
          if (rule && rule.active) {
            // Store original state
            const ruleName = fullName.split('.')[1]; // Extract rule name from "ObjectName.RuleName"
            disabledRules.push({
              fullName: fullName,
              objectName: objectName,
              ruleName: ruleName,
              originalActive: true,
              errorMessage: rule.errorMessage || ''
            });
            
            // Disable the rule
            await conn.metadata.update('ValidationRule', {
              ...rule,
              active: false
            });
            
            console.log(`✅ Disabled validation rule: ${fullName}`);
          }
        } catch (ruleError) {
          console.error(`⚠️ Error processing rule ${fullName}:`, ruleError.message);
        }
      }
    } catch (error) {
      console.error(`⚠️ Error listing validation rules for ${objectName}:`, error.message);
    }
  }
  
  // Store in session for later restoration
  const storedSession = sessions.get(session.sessionId);
  if (storedSession) {
    storedSession.disabledValidationRules = disabledRules;
    storedSession.validationRulesDisabledAt = new Date().toISOString();
    sessions.set(session.sessionId, storedSession);
  }
  
    console.log(`✅ Disabled ${disabledRules.length} validation rules total`);
    return disabledRules;
  } catch (error) {
    console.error(`❌ Fatal error in disableValidationRules: ${error.message}`);
    // Still store any rules we managed to disable before the error
    if (disabledRules.length > 0) {
      const storedSession = sessions.get(session.sessionId);
      if (storedSession) {
        storedSession.disabledValidationRules = disabledRules;
        storedSession.validationRulesDisabledAt = new Date().toISOString();
        sessions.set(session.sessionId, storedSession);
      }
      console.log(`⚠️ Partial success: ${disabledRules.length} rules disabled before error`);
    }
    throw error;
  }
}

/**
 * Restore previously disabled validation rules
 * @param {Connection} conn - Salesforce connection
 * @param {Object} session - Session object containing disabled rules
 * @returns {Object} Object with restored and failed rule lists
 */
async function restoreValidationRules(conn, session) {
  const rules = session.disabledValidationRules || [];
  
  if (rules.length === 0) {
    console.log('ℹ️ No validation rules to restore');
    return { restored: [], failed: [] };
  }
  
  // Set longer timeout for metadata operations
  conn.timeout = 120000; // 2 minutes
  
  console.log(`🔧 Starting to restore ${rules.length} validation rules`);
  const restored = [];
  const failed = [];
  
  for (const ruleInfo of rules) {
    try {
      // Read current state of the rule
      const rule = await conn.metadata.read('ValidationRule', ruleInfo.fullName);
      
      if (rule) {
        // Restore to active state
        await conn.metadata.update('ValidationRule', {
          ...rule,
          active: true
        });
        
        restored.push(ruleInfo.fullName);
        console.log(`✅ Restored validation rule: ${ruleInfo.fullName}`);
      }
    } catch (error) {
      failed.push({
        fullName: ruleInfo.fullName,
        error: error.message
      });
      console.error(`❌ Failed to restore rule ${ruleInfo.fullName}:`, error.message);
    }
  }
  
  // Clear from session
  delete session.disabledValidationRules;
  delete session.validationRulesDisabledAt;
  sessions.set(session.sessionId, session);
  
  console.log(`✅ Restoration complete: ${restored.length} restored, ${failed.length} failed`);
  return { restored, failed };
}

// Fetch StandardValueSet metadata for restricted picklists
async function getStandardValueSetValues(conn, valueSetName) {
  if (standardValueSetCache.has(valueSetName)) {
    return standardValueSetCache.get(valueSetName);
  }
  
  try {
    console.log(`🔍 Fetching StandardValueSet metadata for: ${valueSetName}`);
    const result = await conn.metadata.read('StandardValueSet', [valueSetName]);
    
    if (result && result.standardValue) {
      const values = result.standardValue
        .filter(sv => sv.isActive !== false) // Include active values
        .map(sv => sv.fullName || sv.label);
      
      console.log(`✅ Found ${values.length} values for ${valueSetName}:`, values.slice(0, 5));
      standardValueSetCache.set(valueSetName, values);
      return values;
    }
  } catch (error) {
    console.log(`⚠️ Could not fetch StandardValueSet ${valueSetName}:`, error.message);
  }
  
  standardValueSetCache.set(valueSetName, []);
  return [];
}

// OLD VERSION - Kept for reference
function generateFieldValueOld(field, index, objectName = '', sessionId = null) {
  const { v4: uuidv4 } = require('uuid'); // Single UUID import for the entire function
  const fieldName = field.name.toLowerCase();
  const maxLength = field.length || 255;
  
  // Check if field is in calculated fields list
  if (STANDARD_FIELD_RULES.calculatedFields.includes(field.name)) {
    return null;
  }
  
  // Check special field rules
  const specialRule = STANDARD_FIELD_RULES.specialFields[field.name];
  if (specialRule) {
    // Check if rule applies to this object
    const appliesToObject = !specialRule.object && !specialRule.objects || // No specific object restriction
                           specialRule.object === objectName || // Single object match
                           (specialRule.objects && specialRule.objects.includes(objectName)); // Multiple objects match
    
    if (appliesToObject) {
      if (specialRule.skip) {
        return null;
      }
      if (specialRule.values) {
        return specialRule.values[index % specialRule.values.length];
      } else if (specialRule.defaultValue !== undefined) {
        return specialRule.defaultValue;
      }
    }
    // If rule is for different object, ignore it and continue with default logic
  }
  
  // Handle specific problematic fields - Skip auto-generated Name fields
  if (fieldName === 'name' && (objectName === 'Contact' || objectName === 'Lead')) {
    // Skip Contact and Lead Name fields - they're auto-generated from FirstName + LastName
    return null;
  }
  
  if (fieldName === 'name' && field.type === 'string' && field.required && !field.autoNumber) {
    // Generate unique name values to avoid duplicate detection
    if (objectName === 'Account') {
      // Use faker.js for realistic company names with UUID to guarantee uniqueness
      const uniqueId = uuidv4().split('-')[0]; // Use first segment of UUID (8 chars)
      const companyName = faker.company.name();
      
      return `${companyName} ${uniqueId}`;
    } else if (objectName === 'Asset') {
      // Generate realistic Asset names like equipment/device names
      const assetTypes = [
        'Server', 'Laptop', 'Desktop', 'Printer', 'Scanner', 'Router', 'Switch', 
        'Tablet', 'Monitor', 'Projector', 'Phone System', 'Security Camera',
        'Manufacturing Equipment', 'Heavy Machinery', 'Vehicle', 'Generator',
        'HVAC Unit', 'Solar Panel', 'Network Storage', 'Database Server'
      ];
      const assetType = assetTypes[index % assetTypes.length];
      const brands = ['Dell', 'HP', 'Lenovo', 'Cisco', 'Apple', 'Microsoft', 'Samsung', 'Canon', 'Epson'];
      const brand = brands[index % brands.length];
      const modelNumber = Math.floor(1000 + (index * 7) % 9000); // 4-digit model numbers
      
      return `${brand} ${assetType} ${modelNumber}`;
    }
    return `Sample ${objectName} ${index + 1}`;
  } else if (fieldName === 'name' && field.calculated) {
    // Skip calculated name fields
    return null;
  }
  
  if (fieldName.includes('dunsumber') || fieldName.includes('duns')) {
    // DUNS numbers should be 9-digit strings
    return String(100000000 + (index % 900000000)).substring(0, 9);
  }
  
  if (fieldName.includes('yearstarted') || fieldName.includes('year')) {
    // Years should be 4-digit years
    return 2000 + (index % 24); // 2000-2023
  }
  
  if (fieldName.includes('isstandard') && field.type?.toLowerCase() === 'boolean') {
    // IsStandard should usually be false for created records
    return false;
  }
  
  // Handle unique fields that cannot have duplicates
  if (fieldName.includes('stockkeeping') || fieldName.includes('sku') || fieldName === 'productcode') {
    // Generate unique SKU/product codes with timestamp to avoid duplicates
    const timestamp = Date.now();
    return `SKU-${timestamp}-${index}`;
  }
  
  // Handle SerialNumber fields - should be realistic long alphanumeric serial numbers
  if (fieldName.includes('serial') && fieldName.includes('number')) {
    const fieldMaxLength = field.length || maxLength;
    
    if (fieldMaxLength <= 10) {
      // Short serial numbers for small fields (like SLASerialNumber__c with max 10 chars)
      // Format: SN + 6 digits = 8 chars total, or just digits if even shorter
      if (fieldMaxLength <= 8) {
        return String(100000 + (index * 7) % 899999); // 6-digit number
      } else {
        return `SN${String(10000 + (index * 7) % 89999)}`; // SN + 5 digits = 7-8 chars
      }
    } else {
      // Long serial numbers for larger fields - original format
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const serialBase = String(1000000 + (index * 13) % 8999999).padStart(9, '0'); // 9-digit unique number
      return `SN${year}${month}-${serialBase}`;
    }
  }
  
  switch (field.type?.toLowerCase()) {
    case 'string':
    case 'textarea':
      let value;
      if (fieldName.includes('name')) {
        // Generate realistic names based on field context
        if (fieldName.includes('first') || fieldName.includes('fname')) {
          value = faker.person.firstName();
        } else if (fieldName.includes('last') || fieldName.includes('lname')) {
          value = faker.person.lastName();
        } else if (fieldName.includes('company') || fieldName.includes('account')) {
          value = faker.company.name();
        } else if (fieldName.includes('assistant')) {
          value = faker.person.fullName();
        } else if (objectName === 'Opportunity' && fieldName === 'name') {
          // Generate business opportunity names
          const opportunityTypes = ['Partnership', 'Expansion', 'Upgrade', 'Implementation', 'Consulting', 'License', 'Service'];
          const companyName = faker.company.name();
          const oppType = opportunityTypes[index % opportunityTypes.length];
          value = `${companyName} - ${oppType}`;
        } else if (fieldName.includes('product')) {
          value = `${faker.commerce.productName()} ${faker.commerce.productAdjective()}`;
        } else {
          // For other name fields, use appropriate faker data
          value = faker.person.fullName();
        }
      } else if (fieldName.includes('description') || fieldName.includes('notes') || fieldName.includes('comment')) {
        // Generate realistic business descriptions
        value = faker.lorem.paragraph();
      } else if (fieldName.includes('email')) {
        // Generate realistic email addresses (faker.internet.email() is naturally unique)
        return faker.internet.email();
      } else if (fieldName.includes('phone') || fieldName.includes('fax')) {
        // Generate realistic phone/fax numbers
        return faker.phone.number();
      } else if (fieldName.includes('url') || fieldName.includes('website')) {
        // Generate realistic URLs
        return faker.internet.url();
      } else if (fieldName.includes('street') || fieldName.includes('address')) {
        // Generate realistic street addresses
        return faker.location.streetAddress();
      } else if (fieldName.includes('city')) {
        // Generate realistic city names
        return faker.location.city();
      } else if (fieldName.includes('state') || fieldName.includes('province')) {
        // Generate realistic state/province data
        return faker.location.state({ abbreviated: true });
      } else if (fieldName.includes('postalcode') || fieldName.includes('zipcode') || fieldName.includes('zip')) {
        // Generate realistic postal/zip codes
        return faker.location.zipCode();
      } else if (fieldName.includes('title') && !fieldName.includes('name')) {
        // Job titles and positions
        value = faker.person.jobTitle();
      } else if (fieldName.includes('department')) {
        // Department names
        const departments = ['Sales', 'Marketing', 'Engineering', 'Support', 'Finance', 'HR', 'Operations'];
        value = departments[index % departments.length];
      } else if (fieldName.includes('industry')) {
        // Industry categories
        const industries = ['Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing', 'Retail', 'Consulting'];
        value = industries[index % industries.length];
      } else if (fieldName.includes('country')) {
        // Country names
        value = faker.location.country();
      } else {
        // General text content
        value = faker.lorem.words(3);
      }
      // Ensure proper length truncation - minimum of 10 chars or field length
      if (maxLength > 0 && maxLength < 255) {
        const minLength = Math.min(10, maxLength);
        return value.length > maxLength ? value.substring(0, maxLength) : value.padEnd(minLength, ' ').substring(0, maxLength);
      }
      return value;
      
    case 'email':
      // Generate realistic email addresses
      return faker.internet.email();
      
    case 'phone':
      // Generate realistic phone numbers
      return faker.phone.number();
      
    case 'url':
      // Generate realistic URLs
      return faker.internet.url();
      
    case 'boolean':
      // For boolean fields, prefer meaningful defaults based on field name
      if (fieldName.includes('active') || fieldName.includes('enabled') || fieldName.includes('visible')) {
        return true; // Active/enabled fields should default to true
      } else if (fieldName.includes('deleted') || fieldName.includes('bounced') || fieldName.includes('opted') || fieldName.includes('donotcall')) {
        return false; // Negative fields should default to false
      } else if (fieldName.includes('closed') || fieldName.includes('won') || fieldName.includes('converted')) {
        return false; // Status fields should default to open/active state
      }
      // For other boolean fields, use random but bias toward true (more realistic)
      return Math.random() > 0.3; // 70% chance of true
      
    case 'date':
      // Generate realistic business dates - most recent activity within last 2 years
      if (fieldName.includes('birth') || fieldName.includes('dob')) {
        // Birth dates should be realistic adult ages (25-65 years old)
        return faker.date.birthdate({ min: 25, max: 65, mode: 'age' }).toISOString().split('T')[0];
      } else if (fieldName.includes('close') || fieldName.includes('end') || fieldName.includes('expir')) {
        // Future dates for close dates, end dates, expiration dates
        return faker.date.future({ years: 1 }).toISOString().split('T')[0];
      } else {
        // Most other dates should be recent business activity
        return faker.date.between({ from: '2023-01-01', to: new Date() }).toISOString().split('T')[0];
      }
      
    case 'datetime':
      // Generate realistic business datetimes
      if (fieldName.includes('close') || fieldName.includes('end') || fieldName.includes('expir')) {
        // Future datetimes for close dates, end dates, expiration dates
        return faker.date.future({ years: 1 }).toISOString();
      } else {
        // Most other datetimes should be recent business activity
        return faker.date.between({ from: '2023-01-01', to: new Date() }).toISOString();
      }
      
    case 'currency':
    case 'double':
      // Note: Coordinate fields are now skipped via calculatedFields
      if (fieldName.includes('numberoflocations') || fieldName.includes('locations')) {
        // Number of locations should be a small integer (1-50 locations)
        return Math.floor(1 + (index % 50));
      } else if (fieldName.includes('numberof') || fieldName.includes('count')) {
        // Other count fields should be integers
        return Math.floor(1 + (index % 100));
      } else if (fieldName.includes('amount') || fieldName.includes('revenue') || fieldName.includes('value')) {
        // Business amounts should be realistic ranges
        return faker.number.float({ min: 1000, max: 1000000, multipleOf: 0.01 });
      } else if (fieldName.includes('salary') || fieldName.includes('income')) {
        // Salary ranges
        return faker.number.float({ min: 35000, max: 250000, multipleOf: 1000 });
      } else if (fieldName.includes('price') || fieldName.includes('cost')) {
        // Product pricing
        return faker.number.float({ min: 10, max: 10000, multipleOf: 0.01 });
      }
      return faker.number.float({ min: 100, max: 10000, multipleOf: 0.01 });
      
    case 'int':
      if (fieldName.includes('quantity') || fieldName.includes('qty')) {
        // Quantities should be reasonable business numbers
        return faker.number.int({ min: 1, max: 500 });
      } else if (fieldName.includes('year')) {
        // Years should be realistic business years
        return faker.number.int({ min: 2020, max: 2025 });
      }
      return faker.number.int({ min: 1, max: 1000 });
      
    case 'percent':
      return Math.min(100, 10 + (index * 5) % 90);
      
    case 'picklist':
      if (field.picklistValues && field.picklistValues.length > 0) {
        const validOptions = field.picklistValues.filter(pv => pv.active);
        if (validOptions.length > 0) {
          return validOptions[index % validOptions.length].value;
        }
      }
      // For restricted picklists, try to get values from StandardValueSet if available
      if (field.valueSetName) {
        console.log(`⚠️ Restricted picklist ${field.name} uses StandardValueSet: ${field.valueSetName} - skipping until metadata fetch implemented`);
        return null;
      }
      
      // Skip other picklist fields without metadata to avoid INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST errors
      console.log(`⚠️ Skipping picklist field ${field.name} - no valid picklistValues found`);
      return null;
      
    case 'multipicklist':
      if (field.picklistValues && field.picklistValues.length > 0) {
        const validOptions = field.picklistValues.filter(pv => pv.active);
        if (validOptions.length > 0) {
          const selectedCount = Math.min(validOptions.length, (index % 3) + 1);
          return validOptions.slice(0, selectedCount).map(pv => pv.value).join(';');
        }
      }
      // For restricted multipicklists, try to get values from StandardValueSet if available  
      if (field.valueSetName) {
        console.log(`⚠️ Restricted multipicklist ${field.name} uses StandardValueSet: ${field.valueSetName} - skipping until metadata fetch implemented`);
        return null;
      }
      
      // Skip other multipicklist fields without metadata to avoid INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST errors
      console.log(`⚠️ Skipping multipicklist field ${field.name} - no valid picklistValues found`);
      return null;
      
    case 'reference':
      // Handle reference fields by looking up existing records or using generated ones
      if (field.referenceTo && field.referenceTo.length > 0) {
        const referenceObject = field.referenceTo[0]; // Use first reference target
        
        // Check if we have generated records for this reference object
        if (generatedRecordIds[referenceObject] && generatedRecordIds[referenceObject].length > 0) {
          const availableIds = generatedRecordIds[referenceObject];
          return availableIds[index % availableIds.length];
        }
        
        // For required fields, we need to handle this differently
        if (field.required && !field.defaultedOnCreate) {
          console.warn(`Missing reference data for required field ${field.name} -> ${referenceObject}`);
          io.to(sessionId).emit('execution-log', `Warning: ${objectName}.${field.name} requires ${referenceObject} records that don't exist yet`);
        }
      }
      return null;
      
    case 'location':
    case 'address':
      // Skip complex field types
      return null;
      
    default:
      const defaultValue = `Value ${index + 1}`;
      return maxLength > 0 ? defaultValue.substring(0, maxLength) : defaultValue;
  }
}

/**
 * NEW METADATA-DRIVEN FIELD VALUE GENERATION
 * Uses field type metadata instead of hardcoded field names
 * Properly handles coordinate fields and other special types
 */
function generateFieldValue(field, index, objectName = '', sessionId = null) {
  // First check if field should be skipped based on system rules
  // IMPORTANT: Skip formula fields (calculated: true or calculatedFormula property)
  if (field.createable === false || 
      field.calculated || 
      field.calculatedFormula || 
      field.autoNumber ||
      field.type === 'calculated' ||
      field.type === 'summary') {
    return null;
  }
  
  // Check if field is in calculated fields list (for backward compatibility)
  if (STANDARD_FIELD_RULES.calculatedFields.includes(field.name)) {
    return null;
  }
  
  // Check special field rules (for backward compatibility)
  const specialRule = STANDARD_FIELD_RULES.specialFields[field.name];
  if (specialRule) {
    const appliesToObject = !specialRule.object && !specialRule.objects ||
                           specialRule.object === objectName ||
                           (specialRule.objects && specialRule.objects.includes(objectName));
    
    if (appliesToObject) {
      if (specialRule.skip) {
        return null;
      }
      if (specialRule.values) {
        return specialRule.values[index % specialRule.values.length];
      } else if (specialRule.defaultValue !== undefined) {
        return specialRule.defaultValue;
      }
    }
  }
  
  // Handle special cases for Name fields
  const fieldName = field.name.toLowerCase();
  if (fieldName === 'name') {
    if (objectName === 'Contact' || objectName === 'Lead') {
      // Skip - auto-generated from FirstName + LastName
      return null;
    }
    if (objectName === 'Account' && field.type === 'string') {
      // Generate unique account names
      const uniqueId = uuidv4().split('-')[0];
      const companyName = faker.company.name();
      return `${companyName} ${uniqueId}`;
    }
  }
  
  // Get session data for smart generation features
  const session = sessions.get(sessionId);
  const stateCountryMappings = session?.stateCountryMappings || {};
  
  // Note: This function is kept for backward compatibility
  // Use generateFieldValueWithContext for new implementations
  
  // Use the new metadata-driven generator (without record context for backward compatibility)
  const value = FieldDataGenerator.generateValue(field, index, objectName, {
    referenceId: null, // Will be handled by relationship logic
    stateCountryMappings: stateCountryMappings
  }, {});
  
  // If generator returns a value, ensure it meets field constraints
  if (value !== null && value !== undefined) {
    // Handle string length constraints
    if ((field.type === 'string' || field.type === 'textarea') && field.length) {
      if (typeof value === 'string' && value.length > field.length) {
        return value.substring(0, field.length);
      }
    }
  }
  
  return value;
}

/**
 * Enhanced field value generation with record context support
 * Supports relationship tracking for country-state alignment
 */
function generateFieldValueWithContext(field, index, objectName = '', sessionId = null, recordContext = {}) {
  // First check if field should be skipped based on system rules
  if (field.createable === false || 
      field.calculated || 
      field.calculatedFormula || 
      field.autoNumber ||
      field.type === 'calculated' ||
      field.type === 'summary') {
    return null;
  }
  
  // Check if field is in calculated fields list (for backward compatibility)
  if (STANDARD_FIELD_RULES.calculatedFields.includes(field.name)) {
    return null;
  }
  
  // Check special field rules (for backward compatibility)
  const specialRule = STANDARD_FIELD_RULES.specialFields[field.name];
  if (specialRule) {
    if (specialRule.action === 'skip') {
      return null;
    } else if (specialRule.action === 'set') {
      return specialRule.value;
    }
  }

  // Handle special cases for Name fields
  const fieldName = field.name.toLowerCase();
  if (fieldName === 'name') {
    if (objectName === 'Contact' || objectName === 'Lead') {
      // Skip - auto-generated from FirstName + LastName
      return null;
    }
    if (objectName === 'Account' && field.type === 'string') {
      // Generate unique account names
      const uniqueId = uuidv4().split('-')[0];
      const companyName = faker.company.name();
      return `${companyName} ${uniqueId}`;
    }
  }
  
  // Get session data for smart generation features
  const session = sessions.get(sessionId);
  const stateCountryMappings = session?.stateCountryMappings || {};
  const preferences = session?.dataGenerationPreferences || null;
  
  // Use the new metadata-driven generator with smart mappings, record context, and user preferences
  const value = FieldDataGenerator.generateValue(field, index, objectName, {
    referenceId: null, // Will be handled by relationship logic
    stateCountryMappings: stateCountryMappings,
    preferences: preferences // Pass user preferences for org-specific generation
  }, recordContext);
  
  // If generator returns a value, ensure it meets field constraints
  if (value !== null && value !== undefined) {
    // Handle string length constraints
    if ((field.type === 'string' || field.type === 'textarea') && field.length) {
      if (typeof value === 'string' && value.length > field.length) {
        return value.substring(0, field.length);
      }
    }
  }
  
  return value;
}

/**
 * Enhanced field value generation with optional AI suggestions
 * Integrates the suggestion engine for context-aware data generation
 */
async function generateFieldValueWithSuggestions(field, index, objectName = '', sessionId = null, recordContext = {}, useSuggestions = false, businessContext = null) {
  // If suggestions are disabled or not available, use standard generation
  if (!useSuggestions || !suggestionEngine) {
    return generateFieldValueWithContext(field, index, objectName, sessionId, recordContext);
  }

  try {
    // Get session for additional context
    const session = sessions.get(sessionId);
    
    // Prepare context for AI suggestions
    const suggestionRequest = {
      objectName,
      fieldName: field.name,
      fieldType: field.type,
      fieldMetadata: {
        length: field.length,
        precision: field.precision,
        scale: field.scale,
        picklistValues: field.picklistValues
      },
      businessContext: businessContext || session?.businessContext,
      relationshipContext: {
        parentRecords: recordContext.parentRecords || [],
        relatedFields: Object.entries(recordContext).map(([fieldName, value]) => ({
          fieldName,
          value
        }))
      },
      validationRules: session?.fieldAnalysis?.[objectName]?.validationRules || [],
      recordIndex: index
    };

    // Get AI suggestions
    const suggestions = await suggestionEngine.generateFieldSuggestions(suggestionRequest);
    
    // Use the highest confidence suggestion if available
    if (suggestions && suggestions.length > 0) {
      const bestSuggestion = suggestions[0]; // Already sorted by confidence
      
      // Log suggestion usage for debugging and metrics
      console.log(`🤖 AI suggestion for ${objectName}.${field.name}: ${bestSuggestion.value} (confidence: ${bestSuggestion.confidence})`);
      
      return bestSuggestion.value;
    }
    
    // Fallback to standard generation if no suggestions
    return generateFieldValueWithContext(field, index, objectName, sessionId, recordContext);
    
  } catch (error) {
    console.warn(`AI suggestion failed for ${objectName}.${field.name}, using fallback:`, error.message);
    
    // Fallback to standard generation on error
    return generateFieldValueWithContext(field, index, objectName, sessionId, recordContext);
  }
}

// Test query endpoint for debugging
app.post('/api/test/query/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { query } = req.body;
    
    const session = sessions.get(sessionId);
    if (!session || !session.connectionInfo) {
      return res.json({ success: false, error: 'Session not found or not authenticated' });
    }
    
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken
    });
    
    const result = await conn.query(query);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Query error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Test bulk record generation for debugging  
app.post('/api/test/generate-bulk/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { objectName, count = 3 } = req.body;
    
    const session = sessions.get(sessionId);
    if (!session || !session.connectionInfo) {
      return res.json({ success: false, error: 'Session not found or not authenticated' });
    }

    // Get object metadata
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken
    });

    const objectMetadata = await conn.sobject(objectName).describe();
    const writableFields = objectMetadata.fields.filter(field => 
      field.createable && !field.calculated && !field.calculatedFormula && !field.autoNumber
    );

    const requiredFields = writableFields.filter(f => f.required && !f.defaultedOnCreate);
    console.log(`\n🧪 BULK TEST: Generating ${count} ${objectName} records with full logic simulation`);
    console.log(`📋 Required fields: ${requiredFields.map(f => f.name).join(', ')}`);
    
    const generationResults = [];
    
    for (let i = 0; i < count; i++) {
      console.log(`\n--- Record ${i + 1} ---`);
      const record = {};
      const recordContext = { recordIndex: i, selectedCountries: {} };
      
      // Sort required fields (mimicking production logic)
      const sortedRequiredFields = [...requiredFields].sort((a, b) => {
        const aIsCountryCode = a.name.toLowerCase().includes('countrycode');
        const bIsCountryCode = b.name.toLowerCase().includes('countrycode');
        const aIsStateCode = a.name.toLowerCase().includes('statecode');
        const bIsStateCode = b.name.toLowerCase().includes('statecode');
        
        if (aIsCountryCode && bIsStateCode) return -1;
        if (aIsStateCode && bIsCountryCode) return 1;
        return 0;
      });

      // Generate required fields
      sortedRequiredFields.forEach(field => {
        const value = generateFieldValueWithContext(field, i, objectName, sessionId, recordContext);
        if (value !== null && value !== undefined) {
          record[field.name] = value;
          console.log(`✅ Required ${field.name}: ${value}`);
        }
      });

      // Check if billing address fields are in optional fields
      const optionalFields = writableFields.filter(f => !f.required || f.defaultedOnCreate);
      const billingFields = optionalFields.filter(f => 
        f.name === 'BillingCountryCode' || f.name === 'BillingStateCode'
      );
      
      // Sort billing fields to ensure country before state (using production logic)
      const sortedBillingFields = [...billingFields].sort((a, b) => {
        const aIsCountryCode = a.name.toLowerCase().includes('countrycode') || a.name.toLowerCase().includes('country');
        const bIsCountryCode = b.name.toLowerCase().includes('countrycode') || b.name.toLowerCase().includes('country');
        const aIsStateCode = a.name.toLowerCase().includes('statecode') || a.name.toLowerCase().includes('state');
        const bIsStateCode = b.name.toLowerCase().includes('statecode') || b.name.toLowerCase().includes('state');
        
        if (aIsCountryCode && bIsStateCode) return -1;
        if (aIsStateCode && bIsCountryCode) return 1;
        return 0;
      });
      
      console.log(`🔍 Billing fields before sort: ${billingFields.map(f => f.name).join(', ')}`);
      console.log(`🔍 Billing fields after sort: ${sortedBillingFields.map(f => f.name).join(', ')}`);
      
      // Process billing fields specifically 
      sortedBillingFields.forEach(field => {
        const value = generateFieldValueWithContext(field, i, objectName, sessionId, recordContext);
        if (value !== null && value !== undefined) {
          record[field.name] = value;
          console.log(`✅ Optional ${field.name}: ${value}`);
        }
      });

      console.log(`🎯 Record context: ${JSON.stringify(recordContext.selectedCountries)}`);
      console.log(`📄 Final record: ${JSON.stringify(record)}`);
      
      generationResults.push({ record, recordContext: recordContext.selectedCountries });
    }

    res.json({ success: true, data: generationResults });

  } catch (error) {
    console.error('Bulk generation test error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Test single record generation for debugging
app.post('/api/test/generate-one/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { objectName } = req.body;
    
    const session = sessions.get(sessionId);
    if (!session || !session.connectionInfo) {
      return res.json({ success: false, error: 'Session not found or not authenticated' });
    }

    // Get object metadata
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken
    });

    const objectMetadata = await conn.sobject(objectName).describe();
    const writableFields = objectMetadata.fields.filter(field => 
      field.createable && !field.calculated && !field.calculatedFormula && !field.autoNumber
    );

    console.log(`\n🧪 TEST: Generating single ${objectName} record with detailed logging`);
    
    // Generate one test record with detailed logging
    const record = {};
    const recordContext = { recordIndex: 0, selectedCountries: {} };
    
    // Find address fields
    const billingCountryField = writableFields.find(f => f.name === 'BillingCountryCode');
    const billingStateField = writableFields.find(f => f.name === 'BillingStateCode');
    
    console.log('🔍 Address field analysis:');
    if (billingCountryField) {
      console.log(`- BillingCountryCode: required=${billingCountryField.required}, type=${billingCountryField.type}`);
    }
    if (billingStateField) {
      console.log(`- BillingStateCode: required=${billingStateField.required}, type=${billingStateField.type}`);
    }

    // Generate required fields first
    const nameField = writableFields.find(f => f.name === 'Name');
    if (nameField) {
      const nameValue = generateFieldValueWithContext(nameField, 0, objectName, sessionId, recordContext);
      record[nameField.name] = nameValue;
      console.log(`✅ Generated Name: ${nameValue}`);
    }

    // Generate fields with detailed logging
    let countryValue = null;
    let stateValue = null;
    
    if (billingCountryField) {
      countryValue = generateFieldValueWithContext(billingCountryField, 0, objectName, sessionId, recordContext);
      record[billingCountryField.name] = countryValue;
      console.log(`✅ Generated BillingCountryCode: ${countryValue}`);
    }
    
    if (billingStateField) {
      stateValue = generateFieldValueWithContext(billingStateField, 0, objectName, sessionId, recordContext);
      record[billingStateField.name] = stateValue;
      console.log(`✅ Generated BillingStateCode: ${stateValue}`);
    }

    console.log(`🎯 Record context after generation:`, recordContext);
    console.log(`📄 Final record:`, record);

    // Try to create the record
    try {
      const result = await conn.sobject(objectName).create(record);
      console.log(`✅ SUCCESS: Created record with ID ${result.id}`);
      res.json({ success: true, data: { record, result } });
    } catch (createError) {
      console.log(`❌ CREATION FAILED:`, createError);
      res.json({ success: false, error: createError.message, record, createError });
    }

  } catch (error) {
    console.error('Generation test error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} joined session: ${sessionId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Simple rate limiting for AI chat
const chatRateLimit = new Map();

// AI Chat API Endpoints
app.post('/api/ai-chat/stream/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, context } = req.body;
    
    // Check if we're in demo mode - if so, bypass rate limiting
    const DEMO_MODE = process.env.AI_DEMO_MODE === 'true';
    
    if (!DEMO_MODE) {
      // More lenient rate limiting - 1 request per 10 seconds per session
      // This helps avoid triggering acceleration limits while still preventing abuse
      const now = Date.now();
      const lastRequest = chatRateLimit.get(sessionId);
      if (lastRequest && (now - lastRequest) < 10000) {
        const waitTime = Math.ceil((10000 - (now - lastRequest)) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${waitTime} seconds between AI chat messages to avoid rate limits.`,
          retryAfter: waitTime
        });
      }
      chatRateLimit.set(sessionId, now);
    }
    
    // Get global AI service instance
    let aiServiceInstance = aiService;
    
    if (!aiServiceInstance || !aiServiceInstance.initialized) {
      return res.status(503).json({
        success: false,
        error: 'AI service not available. Please configure ANTHROPIC_API_KEY.'
      });
    }
    
    // Get session for context
    const session = sessions.get(sessionId);
    const currentStep = session?.currentStep || 'unknown';
    
    // Create context-aware prompt
    const contextPrompt = `You are an AI assistant helping with Salesforce Sandbox Data Seeder.
Current wizard step: ${currentStep}
Session context: ${JSON.stringify(context || {})}
User message: ${message}

Provide helpful guidance for data generation, validation rules, and Salesforce best practices.`;
    
    // Get AI response
    const response = await aiServiceInstance.chat(contextPrompt, sessionId);
    
    if (response.success) {
      // Send response via WebSocket room (all clients in this session)
      io.to(sessionId).emit('chat-message', {
        id: require('uuid').v4(),
        sessionId: sessionId,
        content: response.response,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        metadata: {
          tokens: response.usage,
          responseTime: response.responseTime
        }
      });
      
      res.json({
        success: true,
        message: response.response,
        metadata: {
          tokens: response.usage,
          responseTime: response.responseTime
        }
      });
    } else {
      // For rate limit and other AI service errors, send the user-friendly message
      const statusCode = response.error === 'rate_limit' ? 429 : 500;
      res.status(statusCode).json({
        success: false,
        error: response.response || response.error || 'Failed to get AI response',
        retryAfter: response.retryAfter
      });
    }
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// AI Health Check
app.get('/api/ai/health', async (req, res) => {
  try {
    if (!aiService) {
      return res.json({
        status: 'unavailable',
        error: 'AI service not initialized'
      });
    }
    
    const health = await aiService.getHealthStatus();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// AI Usage Stats
app.get('/api/ai/stats', async (req, res) => {
  try {
    if (!aiService) {
      return res.json({
        error: 'AI service not available'
      });
    }
    
    const stats = await aiService.getUsageStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// AI Rate Limit Monitor
app.get('/api/ai/rate-limits', async (req, res) => {
  try {
    if (!aiService) {
      return res.json({
        error: 'AI service not available',
        initialized: false
      });
    }
    
    const rateLimitInfo = aiService.getRateLimitInfo();
    res.json({
      success: true,
      ...rateLimitInfo,
      serverRateLimit: {
        secondsBetweenRequests: 10,
        description: 'Server-side rate limiting to prevent acceleration limit errors'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// AI Suggestion API Endpoints
app.post('/api/suggestions/field/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { 
      objectName, 
      fieldName, 
      fieldType, 
      fieldMetadata,
      businessContext,
      relationshipContext,
      validationRules,
      recordIndex = 0
    } = req.body;

    if (!objectName || !fieldName || !fieldType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: objectName, fieldName, fieldType'
      });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const suggestions = await suggestionEngine.generateFieldSuggestions({
      objectName,
      fieldName,
      fieldType,
      fieldMetadata,
      businessContext,
      relationshipContext,
      validationRules,
      recordIndex
    });

    res.json({
      success: true,
      suggestions,
      metadata: {
        sessionId,
        objectName,
        fieldName,
        suggestionsCount: suggestions.length
      }
    });

  } catch (error) {
    console.error('Field suggestion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate field suggestions'
    });
  }
});

app.get('/api/suggestions/business-scenarios', (req, res) => {
  try {
    const scenarios = suggestionEngine.getBusinessScenarios();
    res.json({
      success: true,
      scenarios
    });
  } catch (error) {
    console.error('Business scenarios error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch business scenarios'
    });
  }
});

app.post('/api/suggestions/record-interaction', (req, res) => {
  try {
    const { suggestionId, action, modifiedValue } = req.body;

    if (!suggestionId || !action) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: suggestionId, action'
      });
    }

    if (!['accepted', 'rejected', 'modified'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Must be: accepted, rejected, or modified'
      });
    }

    suggestionEngine.recordSuggestionInteraction(suggestionId, action, modifiedValue);

    res.json({
      success: true,
      message: 'Interaction recorded successfully'
    });

  } catch (error) {
    console.error('Suggestion interaction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record suggestion interaction'
    });
  }
});

app.get('/api/suggestions/metrics', (req, res) => {
  try {
    const metrics = suggestionEngine.getMetrics();
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    console.error('Suggestion metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch suggestion metrics'
    });
  }
});

// A/B Testing API Endpoints
app.post('/api/ab-testing/assign/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { experimentId, demographics } = req.body;

    if (!experimentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: experimentId'
      });
    }

    const participant = abTestingService.assignToExperiment(sessionId, experimentId, demographics);

    if (!participant) {
      return res.status(404).json({
        success: false,
        error: 'Experiment not found or not running'
      });
    }

    res.json({
      success: true,
      participant,
      config: abTestingService.getExperimentConfig(sessionId, experimentId)
    });

  } catch (error) {
    console.error('A/B testing assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign to experiment'
    });
  }
});

app.get('/api/ab-testing/config/:sessionId/:experimentId', (req, res) => {
  try {
    const { sessionId, experimentId } = req.params;

    const config = abTestingService.getExperimentConfig(sessionId, experimentId);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'No experiment configuration found for session'
      });
    }

    res.json({
      success: true,
      config
    });

  } catch (error) {
    console.error('A/B testing config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get experiment configuration'
    });
  }
});

app.post('/api/ab-testing/metric/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { metricName, value, metadata } = req.body;

    if (!metricName || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: metricName, value'
      });
    }

    abTestingService.recordMetric(sessionId, metricName, value, metadata);

    res.json({
      success: true,
      message: 'Metric recorded successfully'
    });

  } catch (error) {
    console.error('A/B testing metric error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record metric'
    });
  }
});

app.post('/api/ab-testing/interaction', (req, res) => {
  try {
    const interaction = req.body;

    if (!interaction.sessionId || !interaction.suggestionId || !interaction.action) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: sessionId, suggestionId, action'
      });
    }

    abTestingService.recordSuggestionInteraction(interaction);

    res.json({
      success: true,
      message: 'Interaction recorded successfully'
    });

  } catch (error) {
    console.error('A/B testing interaction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record interaction'
    });
  }
});

app.get('/api/ab-testing/results/:experimentId', (req, res) => {
  try {
    const { experimentId } = req.params;

    const results = abTestingService.getExperimentResults(experimentId);

    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('A/B testing results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get experiment results'
    });
  }
});

app.get('/api/ab-testing/experiments', (req, res) => {
  try {
    const experiments = abTestingService.getRunningExperiments();

    res.json({
      success: true,
      experiments
    });

  } catch (error) {
    console.error('A/B testing experiments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get experiments'
    });
  }
});

app.get('/api/ab-testing/analytics', (req, res) => {
  try {
    const analytics = abTestingService.getSuggestionAnalytics();

    res.json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error('A/B testing analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get suggestion analytics'
    });
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    error: { message: 'Internal Server Error' }
  });
});

// Validation Engine API Endpoints

// Analyze validation rules for an object
app.post('/api/validation/analyze/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { objectName } = req.body;
    
    if (!objectName) {
      return res.status(400).json({
        success: false,
        error: 'Object name is required'
      });
    }
    
    const session = sessions.get(sessionId);
    if (!session?.connectionInfo?.accessToken) {
      return res.status(401).json({
        success: false,
        error: 'No active Salesforce connection'
      });
    }
    
    if (!ValidationEngine || !EnhancedDiscoveryService) {
      return res.status(503).json({
        success: false,
        error: 'Validation engine not available'
      });
    }
    
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    const sessionServices = await initializeSessionValidationEngine(sessionId, conn);
    if (!sessionServices) {
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize validation engine'
      });
    }
    
    const analysis = await sessionServices.validationEngine.analyzeValidationRules(objectName);
    
    // Clean up
    sessionServices.validationEngine.destroy();
    sessionServices.enhancedDiscovery.destroy();
    
    res.json({
      success: true,
      data: analysis
    });
    
  } catch (error) {
    console.error('Validation analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Pre-validate data generation pattern
app.post('/api/validation/pre-validate/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { objectName, generationConfig } = req.body;
    
    if (!objectName || !generationConfig) {
      return res.status(400).json({
        success: false,
        error: 'Object name and generation config are required'
      });
    }
    
    const session = sessions.get(sessionId);
    if (!session?.connectionInfo?.accessToken) {
      return res.status(401).json({
        success: false,
        error: 'No active Salesforce connection'
      });
    }
    
    if (!ValidationEngine || !EnhancedDiscoveryService) {
      return res.status(503).json({
        success: false,
        error: 'Validation engine not available'
      });
    }
    
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    const sessionServices = await initializeSessionValidationEngine(sessionId, conn);
    if (!sessionServices) {
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize validation engine'
      });
    }
    
    const validationResult = await sessionServices.validationEngine.preValidateGenerationPattern(
      objectName,
      generationConfig
    );
    
    // Clean up
    sessionServices.validationEngine.destroy();
    sessionServices.enhancedDiscovery.destroy();
    
    res.json({
      success: true,
      data: validationResult
    });
    
  } catch (error) {
    console.error('Pre-validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate constraint-compliant records
app.post('/api/validation/generate-compliant/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { objectName, recordCount = 5, existingValues = {} } = req.body;
    
    if (!objectName) {
      return res.status(400).json({
        success: false,
        error: 'Object name is required'
      });
    }
    
    const session = sessions.get(sessionId);
    if (!session?.connectionInfo?.accessToken) {
      return res.status(401).json({
        success: false,
        error: 'No active Salesforce connection'
      });
    }
    
    if (!ValidationEngine || !EnhancedDiscoveryService) {
      // Fallback to standard generation
      return res.status(503).json({
        success: false,
        error: 'Validation engine not available - use standard generation'
      });
    }
    
    const conn = new jsforce.Connection({
      instanceUrl: session.connectionInfo.instanceUrl,
      accessToken: session.connectionInfo.accessToken,
      version: session.connectionInfo.apiVersion || '59.0'
    });
    
    const sessionServices = await initializeSessionValidationEngine(sessionId, conn);
    if (!sessionServices) {
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize validation engine'
      });
    }
    
    // Get object schema with validation rules
    const enhancedObject = await sessionServices.enhancedDiscovery.getEnhancedObject(objectName, {
      includeValidationRules: true,
      includeSchemaAnalysis: true
    });
    
    // Initialize constraint solver
    const constraintSolver = new ConstraintSolver({
      seedValue: Date.now(),
      useRealisticData: true,
      maxAttempts: 10
    });
    
    // Extract validation context
    const validationRules = enhancedObject.validationRules || [];
    const fieldConstraints = enhancedObject.schemaAnalysis?.fieldConstraints || [];
    const fieldDependencies = enhancedObject.schemaAnalysis?.fieldDependencies || [];
    
    // Generate compliant records
    const records = await constraintSolver.generateCompliantRecords(
      recordCount,
      enhancedObject,
      validationRules,
      fieldConstraints,
      fieldDependencies
    );
    
    // Validate the generated records
    const validationRequest = {
      objectName,
      data: records,
      skipAIAnalysis: false,
      includeWarnings: true,
      validationLevel: 'comprehensive'
    };
    
    const validationResult = await sessionServices.validationEngine.validateData(validationRequest);
    
    // Clean up
    sessionServices.validationEngine.destroy();
    sessionServices.enhancedDiscovery.destroy();
    
    res.json({
      success: true,
      data: {
        records,
        validation: {
          totalRecords: validationResult.totalRecords,
          validRecords: validationResult.validRecords,
          invalidRecords: validationResult.invalidRecords,
          successRate: ((validationResult.validRecords / validationResult.totalRecords) * 100).toFixed(1) + '%',
          riskScore: validationResult.overallRiskScore,
          recommendations: validationResult.recommendations
        },
        performance: validationResult.enginePerformance
      }
    });
    
  } catch (error) {
    console.error('Compliant generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get validation engine performance metrics
app.get('/api/validation/metrics/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    if (!aiService) {
      return res.json({
        success: true,
        data: {
          aiService: null,
          validationEngine: 'not_available'
        }
      });
    }
    
    const metrics = aiService.getUsageStats();
    const health = aiService.getHealthStatus();
    
    res.json({
      success: true,
      data: {
        aiService: {
          usage: metrics,
          health: health
        },
        validationEngine: 'available'
      }
    });
    
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: { message: 'API endpoint not found' }
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Demo Server running on port ${PORT}`);
  console.log(`📊 Environment: development`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log(`🌐 Client URL: http://localhost:3000`);
  console.log('');
  console.log('⚠️  DEMO MODE: Configure Salesforce OAuth in .env for full functionality');
});

module.exports = app;