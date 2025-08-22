import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  ShieldCheckIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import { WizardSession, WizardStep, ConnectionStatus } from '../../../shared/types/api';
import { Socket } from 'socket.io-client';

interface AuthenticationStepProps {
  session: WizardSession;
  onNext: (step: WizardStep) => void;
  onPrevious?: (step: WizardStep) => void;
  socket?: Socket | null;
}

export default function AuthenticationStep({ 
  session, 
  onNext, 
  socket 
}: AuthenticationStepProps) {
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [instanceUrl, setInstanceUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showCredentialsForm, setShowCredentialsForm] = useState(true);
  
  useEffect(() => {
    // Check if already connected
    checkConnectionStatus();
  }, [session.id]);
  
  const checkConnectionStatus = async () => {
    try {
      if (!session.id) {
        // No session ID yet, show credentials form
        setShowCredentialsForm(true);
        return;
      }

      const response = await fetch(`/api/auth/status/${session.id}`);
      const result = await response.json();
      
      if (result.success) {
        setConnectionStatus(result.data);
        
        if (result.data.connected) {
          if (result.data.autoReconnected) {
            toast.success('Automatically reconnected to Salesforce!');
          } else if (result.data.autoConnected) {
            toast.success('Automatically connected using stored credentials!');
          } else {
            toast.success('Already connected to Salesforce!');
          }
        } else if (result.data.hasOAuthConfig && result.data.error === 'AUTO_CONNECT_FAILED') {
          // Auto-connection failed, show credentials form
          setShowCredentialsForm(true);
          toast.error('Stored credentials are invalid. Please re-enter them.');
        } else if (result.data.needsReconnection) {
          // Show credentials form for manual reconnection
          setShowCredentialsForm(true);
        }
      }
    } catch (error) {
      console.error('Failed to check connection status:', error);
      // Show credentials form as fallback
      setShowCredentialsForm(true);
    }
  };
  
  const handleAuthenticate = async () => {
    try {
      setLoading(true);
      
      // Validate credentials
      if (!clientId.trim() || !clientSecret.trim()) {
        toast.error('Please provide both Client ID and Client Secret');
        return;
      }
      
      // Validate instance URL
      const effectiveLoginUrl = instanceUrl.trim() || 'https://test.salesforce.com';
      if (!effectiveLoginUrl.startsWith('https://')) {
        toast.error('Please provide a valid HTTPS URL for your Salesforce instance');
        return;
      }
      
      // First save the OAuth config for this session
      const configResponse = await fetch('/api/auth/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          instanceUrl: effectiveLoginUrl,
          sessionId: session.id
        }),
      });
      
      const configResult = await configResponse.json();
      if (!configResult.success) {
        toast.error('Failed to save OAuth configuration');
        return;
      }
      
      // Use Client Credentials Flow (like CLI)
      const response = await fetch('/api/auth/client-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          sessionId: session.id,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          loginUrl: effectiveLoginUrl 
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Authentication successful
        setConnectionStatus({
          connected: true,
          instanceUrl: result.data.instanceUrl
        });
        toast.success('Successfully connected to Salesforce!');
      } else {
        toast.error(result.error || 'Failed to authenticate');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      toast.error('Failed to start authentication process');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDisconnect = async () => {
    try {
      const response = await fetch(`/api/auth/disconnect/${session.id}`, {
        method: 'POST',
      });
      
      const result = await response.json();
      
      if (result.success) {
        setConnectionStatus({ connected: false });
        toast.success('Disconnected successfully');
      } else {
        toast.error(result.error || 'Failed to disconnect');
      }
    } catch (error) {
      console.error('Disconnect error:', error);
      toast.error('Failed to disconnect');
    }
  };
  
  const handleContinue = () => {
    console.log('handleContinue clicked', { 
      connectionStatus, 
      session, 
      connected: connectionStatus?.connected,
      onNext: typeof onNext
    });
    if (connectionStatus?.connected) {
      console.log('Calling onNext with discovery');
      try {
        onNext('discovery');
        console.log('onNext call completed successfully');
      } catch (error) {
        console.error('Error calling onNext:', error);
      }
    } else {
      console.log('Connection status not connected', connectionStatus);
    }
  };
  
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <ShieldCheckIcon className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">
            Connect to Salesforce
          </h1>
        </div>
        <p className="text-gray-600">
          Authenticate with your Salesforce sandbox to begin the data generation process.
          We use secure OAuth 2.0 authentication and only connect to sandbox environments.
        </p>
      </div>
      
      {/* Connection Status */}
      {connectionStatus && (
        <div className={`mb-6 p-4 rounded-lg ${
          connectionStatus.connected 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-start">
            {connectionStatus.connected ? (
              <CheckCircleIcon className="h-5 w-5 text-green-500 mt-0.5 mr-3" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
            )}
            
            <div className="flex-1">
              <h3 className={`font-medium ${
                connectionStatus.connected ? 'text-green-800' : 'text-gray-800'
              }`}>
                {connectionStatus.connected ? 'Connected' : 'Not Connected'}
              </h3>
              
              {connectionStatus.connected && (
                <div className="mt-2 text-sm text-green-700">
                  <p><strong>Instance:</strong> {connectionStatus.instanceUrl}</p>
                  <p><strong>Organization:</strong> {connectionStatus.organizationName}</p>
                  <p><strong>Sandbox:</strong> {connectionStatus.isSandbox ? 'Yes' : 'No'}</p>
                  {connectionStatus.sandboxInfo && (
                    <div className="mt-2">
                      <p><strong>Type:</strong> {connectionStatus.sandboxInfo.type}</p>
                      <p><strong>Storage Limit:</strong> {connectionStatus.sandboxInfo.dataStorageLimit}MB</p>
                      <p><strong>Current Usage:</strong> {connectionStatus.sandboxInfo.currentDataUsage || 0}MB</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {connectionStatus.connected && (
              <button
                onClick={handleDisconnect}
                className="btn-outline text-sm"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Setup Instructions */}
      {connectionStatus?.setupRequired && (
        <div className="mb-6 p-6 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start">
            <ExclamationTriangleIcon className="h-6 w-6 text-amber-500 mt-0.5 mr-3" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-800 mb-3">
                Salesforce External Client App Setup Required
              </h3>
              <div className="text-sm text-amber-700 whitespace-pre-line">
                {connectionStatus.setupInstructions}
              </div>
              <div className="mt-4 p-4 bg-amber-100 rounded border border-amber-300">
                <h4 className="font-medium text-amber-800 mb-2">Quick Setup Guide:</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-amber-700">
                  <li>Log into your Salesforce org as Administrator</li>
                  <li>Go to Setup → Apps → External Client Apps</li>
                  <li>Click "New External Client App"</li>
                  <li>Fill in basic info (name, description, etc.)</li>
                  <li>Enable OAuth Settings</li>
                  <li>Enable Client Credentials Flow</li>
                  <li>Select scopes: "Access and manage your data (api)"</li>
                  <li>Choose an Integration User (service account)</li>
                  <li>Save and copy the Consumer Key and Consumer Secret</li>
                  <li>Enter them in the form above</li>
                </ol>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => setConnectionStatus(null)}
                  className="btn-primary text-sm"
                >
                  I've configured OAuth - Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OAuth Credentials Form */}
      {showCredentialsForm && !connectionStatus?.connected && !connectionStatus?.setupRequired && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 mb-2">Salesforce External Client App Credentials</h3>
            <p className="text-sm text-blue-700 mb-4">
              Enter your Salesforce External Client App credentials to continue. You can find these in your Salesforce org under Setup → Apps → External Client Apps.
            </p>
          </div>

          {/* Client ID */}
          <div>
            <label className="label">
              Consumer Key (Client ID) *
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="3MVG9pRzvMtpID..."
              className="input"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              The Consumer Key from your External Client App settings.
            </p>
          </div>

          {/* Client Secret */}
          <div>
            <label className="label">
              Consumer Secret (Client Secret) *
            </label>
            <div className="relative">
              <input
                type={showClientSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="A1B2C3D4E5F6..."
                className="input pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowClientSecret(!showClientSecret)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showClientSecret ? (
                  <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                ) : (
                  <EyeIcon className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              The Consumer Secret from your External Client App settings.
            </p>
          </div>

          {/* Salesforce Instance URL */}
          <div>
            <label className="label">
              Salesforce Instance URL *
            </label>
            <input
              type="url"
              value={instanceUrl || 'https://test.salesforce.com'}
              onChange={(e) => setInstanceUrl(e.target.value)}
              placeholder="https://your-domain.my.salesforce.com"
              className="input"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Enter your Salesforce org URL. For sandboxes, typically https://test.salesforce.com or your custom domain.
            </p>
          </div>

          {/* External Client App Setup Instructions */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="font-medium text-amber-800 mb-2">Need to create an External Client App?</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-amber-700">
              <li>Log into your Salesforce org as an Administrator</li>
              <li>Go to Setup → Apps → External Client Apps</li>
              <li>Click "New External Client App"</li>
              <li>Fill in basic info (name, description, etc.)</li>
              <li>Under OAuth Settings:</li>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>Enable OAuth</li>
                <li>Enable Client Credentials Flow</li>
                <li>Select scopes: "Access and manage your data (api)"</li>
                <li>Choose an Integration User (service account)</li>
              </ul>
              <li>Save and copy the Consumer Key and Consumer Secret</li>
              <li>Ensure "Enable Client Credentials Flow" is checked globally under Setup → OAuth Settings</li>
            </ol>
            <div className="mt-3 p-2 bg-amber-100 rounded">
              <p className="text-xs text-amber-800">
                <strong>Note:</strong> External Client Apps are the modern replacement for Connected Apps in Salesforce. They use Client Credentials Flow for secure server-to-server authentication.
              </p>
            </div>
          </div>
        </div>
      )}

      
      {/* Action Buttons */}
      <div className="mt-8 flex justify-between">
        <div>
          {/* Previous button (disabled for first step) */}
        </div>
        
        <div className="flex space-x-3">
          {!connectionStatus?.connected ? (
            <>
              <button
                onClick={handleAuthenticate}
                disabled={loading || !clientId.trim() || !clientSecret.trim()}
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Connecting...
                  </>
                ) : (
                  'Connect to Salesforce'
                )}
              </button>
            </>
          ) : (
            <button
              onClick={handleContinue}
              className="btn-primary"
            >
              Continue to Discovery
            </button>
          )}
        </div>
      </div>
    </div>
  );
}