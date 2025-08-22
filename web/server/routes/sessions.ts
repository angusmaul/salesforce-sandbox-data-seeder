import express from 'express';
import { APIResponse } from '../../shared/types/api';

const router = express.Router();

/**
 * Create a new wizard session
 */
router.post('/create', async (req, res) => {
  try {
    const { userId } = req.body;
    const sessionId = req.sessionManager.createSession(userId);
    
    const response: APIResponse = {
      success: true,
      data: { sessionId },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create session',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get session details
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = req.sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const response: APIResponse = {
      success: true,
      data: session,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Update session
 */
router.put('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const updates = req.body;
    
    const updatedSession = req.sessionManager.updateSession(sessionId, updates);
    
    if (!updatedSession) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const response: APIResponse = {
      success: true,
      data: updatedSession,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update session',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Delete session
 */
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const deleted = req.sessionManager.clearSession(sessionId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const response: APIResponse = {
      success: true,
      data: { deleted: true },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete session',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * List all sessions (optional filtering by user)
 */
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    const sessions = req.sessionManager.getAllSessions(userId as string);
    
    const response: APIResponse = {
      success: true,
      data: { sessions },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list sessions',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

export default router;