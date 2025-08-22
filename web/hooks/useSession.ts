import { useState, useEffect, useCallback } from 'react';
import { WizardSession } from '../shared/types/api';

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
  
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);
  
  return {
    session,
    loading,
    error,
    updateSession,
    refreshSession,
    sessionId: sessionId || createdSessionId
  };
}