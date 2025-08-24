import { useState, useEffect, useCallback } from 'react';
import { WizardSession, ConfigurationUpdate, WizardStep } from '../shared/types/api';

export function useSession(sessionId: string | undefined) {
  const [session, setSession] = useState<WizardSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  
  const findExistingAuthenticatedSession = useCallback(async () => {
    try {
      // Try to find an existing authenticated session
      const response = await fetch('/api/sessions/list');
      const result = await response.json();
      
      if (result.success && result.data) {
        // Find a session that has connectionInfo (is authenticated)
        const authenticatedSession = result.data.find((session: any) => 
          session.connectionInfo && session.connectionInfo.accessToken
        );
        
        if (authenticatedSession) {
          console.log('Found existing authenticated session:', authenticatedSession.id);
          return authenticatedSession.id;
        }
      }
    } catch (err) {
      console.warn('Failed to check for existing sessions:', err);
    }
    return null;
  }, []);

  const createSession = useCallback(async () => {
    try {
      // First try to find an existing authenticated session
      const existingSessionId = await findExistingAuthenticatedSession();
      if (existingSessionId) {
        setCreatedSessionId(existingSessionId);
        // Update URL to use existing session
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('session', existingSessionId);
          window.history.replaceState({}, '', url.toString());
        }
        return existingSessionId;
      }

      // No existing session found, create new one
      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setCreatedSessionId(result.data.sessionId);
        // Update URL to include session ID
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('session', result.data.sessionId);
          window.history.replaceState({}, '', url.toString());
        }
        return result.data.sessionId;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      return null;
    }
  }, [findExistingAuthenticatedSession]);
  
  const fetchSession = useCallback(async (id?: string) => {
    const targetSessionId = id || sessionId;
    
    if (!targetSessionId) {
      // No session ID provided, create a new session
      const newSessionId = await createSession();
      if (newSessionId) {
        // Fetch the newly created session
        return fetchSession(newSessionId);
      } else {
        setLoading(false);
        return;
      }
    }
    
    try {
      setLoading(true);
      const response = await fetch(`/api/sessions/${targetSessionId}`);
      const result = await response.json();
      
      if (result.success) {
        setSession(result.data);
        setError(null);
      } else {
        setError(result.error);
        setSession(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch session');
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId, createSession]);
  
  const updateSession = useCallback(async (updates: Partial<WizardSession>) => {
    const targetSessionId = sessionId || createdSessionId;
    if (!targetSessionId) return null;
    
    try {
      const response = await fetch(`/api/sessions/${targetSessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSession(result.data);
        return result.data;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update session');
      return null;
    }
  }, [sessionId, createdSessionId]);
  
  const refreshSession = useCallback(() => {
    fetchSession();
  }, [fetchSession]);
  
  // Enhanced configuration update for conversational interface
  const updateConfiguration = useCallback(async (configUpdate: ConfigurationUpdate) => {
    const targetSessionId = sessionId || createdSessionId;
    if (!targetSessionId) return false;

    try {
      // Build update payload from configuration update
      const updates: Partial<WizardSession> = {};
      
      if (configUpdate.selectedObjects !== undefined) {
        updates.selectedObjects = configUpdate.selectedObjects;
      }
      
      if (configUpdate.configuration !== undefined) {
        updates.configuration = {
          ...session?.configuration,
          ...configUpdate.configuration
        };
      }
      
      if (configUpdate.globalSettings !== undefined) {
        updates.globalSettings = {
          ...session?.globalSettings,
          ...configUpdate.globalSettings
        };
      }
      
      if (configUpdate.currentStep !== undefined) {
        updates.currentStep = configUpdate.currentStep;
      }

      const result = await updateSession(updates);
      return !!result;
    } catch (err) {
      console.error('Configuration update failed:', err);
      return false;
    }
  }, [sessionId, createdSessionId, session, updateSession]);

  // Navigate to step with validation
  const navigateToStep = useCallback(async (step: WizardStep) => {
    if (!session) return false;

    // Validate step navigation
    const stepOrder: WizardStep[] = [
      'authentication', 'discovery', 'selection', 'configuration', 'preview', 'execution', 'results'
    ];
    
    const currentIndex = stepOrder.indexOf(session.currentStep);
    const targetIndex = stepOrder.indexOf(step);
    
    // Check if step is reachable
    if (targetIndex > currentIndex + 1) {
      // Can't skip steps - check requirements
      switch (step) {
        case 'discovery':
          if (!session.connectionInfo) return false;
          break;
        case 'selection':
          if (!session.connectionInfo || !session.discoveredObjects?.length) return false;
          break;
        case 'configuration':
          if (!session.selectedObjects?.length) return false;
          break;
        case 'preview':
          if (!session.configuration || !Object.keys(session.configuration).length) return false;
          break;
        case 'execution':
          if (!session.configuration || !session.selectedObjects?.length) return false;
          break;
        case 'results':
          if (!session.executionResults) return false;
          break;
      }
    }

    // Navigate
    const result = await updateSession({ currentStep: step });
    return !!result;
  }, [session, updateSession]);

  // Bulk configuration update for complex changes
  const applyBulkConfiguration = useCallback(async (changes: Partial<WizardSession>) => {
    const targetSessionId = sessionId || createdSessionId;
    if (!targetSessionId) return false;

    try {
      const result = await updateSession(changes);
      return !!result;
    } catch (err) {
      console.error('Bulk configuration update failed:', err);
      return false;
    }
  }, [sessionId, createdSessionId, updateSession]);

  // Get configuration summary for AI context
  const getConfigurationSummary = useCallback(() => {
    if (!session) return null;

    return {
      currentStep: session.currentStep,
      hasConnection: !!session.connectionInfo,
      objectCount: session.discoveredObjects?.length || 0,
      selectedCount: session.selectedObjects?.length || 0,
      configuredObjects: session.configuration ? Object.keys(session.configuration) : [],
      totalConfiguredRecords: session.configuration ? 
        Object.values(session.configuration).reduce((total, config: any) => {
          return total + (config?.recordCount || 0);
        }, 0) : 0
    };
  }, [session]);
  
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);
  
  return {
    session,
    loading,
    error,
    updateSession,
    refreshSession,
    updateConfiguration,
    navigateToStep,
    applyBulkConfiguration,
    getConfigurationSummary,
    sessionId: sessionId || createdSessionId
  };
}