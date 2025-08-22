import express from 'express';
import { SalesforceService } from '../../../src/services/salesforce';
import { DataLoadService } from '../../../src/services/bulk-loader';
import { APIResponse } from '../../shared/types/api';

const router = express.Router();

/**
 * Start data generation and loading process
 */
router.post('/start/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = req.sessionManager.getSession(sessionId);
    
    if (!session || !session.connectionInfo || !session.generationPlan) {
      return res.status(404).json({
        success: false,
        error: 'Session not found, not authenticated, or no generation plan',
        timestamp: new Date().toISOString()
      });
    }
    
    // Update session step
    req.sessionManager.updateSessionStep(sessionId, 'execution');
    
    const response: APIResponse = {
      success: true,
      data: { started: true },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
    // Start execution asynchronously
    setImmediate(async () => {
      try {
        await executeDataLoad(sessionId, session, req.socketService, req.sessionManager);
      } catch (error) {
        console.error('Execution error:', error);
        req.socketService.sendError(
          sessionId,
          error instanceof Error ? error.message : 'Execution failed',
          'execution'
        );
      }
    });
    
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start execution',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get execution status
 */
router.get('/status/:sessionId', async (req, res) => {
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
    
    const status = {
      currentStep: session.currentStep,
      completed: session.completed,
      results: session.executionResults || [],
      totalObjects: session.generationPlan?.length || 0,
      completedObjects: session.executionResults?.length || 0
    };
    
    const response: APIResponse = {
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get execution status',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get execution results
 */
router.get('/results/:sessionId', async (req, res) => {
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
    
    const results = session.executionResults || [];
    const summary = {
      totalObjects: results.length,
      totalRecordsCreated: results.reduce((sum, r) => sum + r.recordsCreated, 0),
      totalRecordsFailed: results.reduce((sum, r) => sum + r.recordsFailed, 0),
      totalTime: results.reduce((sum, r) => sum + r.timeTaken, 0),
      successRate: results.length > 0 
        ? (results.reduce((sum, r) => sum + r.recordsCreated, 0) / 
           results.reduce((sum, r) => sum + r.recordsCreated + r.recordsFailed, 0)) * 100
        : 0,
      objectsWithErrors: results.filter(r => r.errors.length > 0).length
    };
    
    const response: APIResponse = {
      success: true,
      data: {
        results,
        summary
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get execution results',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Cancel execution
 */
router.post('/cancel/:sessionId', async (req, res) => {
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
    
    // Mark session as cancelled (implementation would need cancellation logic)
    req.sessionManager.updateSession(sessionId, {
      currentStep: 'results'
    });
    
    req.socketService.sendLog(sessionId, 'warn', 'Execution cancelled by user');
    
    const response: APIResponse = {
      success: true,
      data: { cancelled: true },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel execution',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Execute the data loading process
 */
async function executeDataLoad(
  sessionId: string, 
  session: any, 
  socketService: any, 
  sessionManager: any
) {
  try {
    socketService.sendProgress(sessionId, 'execution', 0, 'Initializing data load...');
    
    // Initialize Salesforce service
    const salesforceService = new SalesforceService();
    await salesforceService.setAccessToken(
      session.connectionInfo.accessToken,
      session.connectionInfo.instanceUrl
    );
    
    // Create data load service with logging to a session-specific directory
    const logDirectory = `logs/sessions/${sessionId}`;
    const dataLoadService = new DataLoadService(salesforceService, logDirectory);
    
    socketService.sendProgress(sessionId, 'execution', 5, 'Starting data generation and loading...');
    
    // Execute the generation plan with progress tracking
    const results = await dataLoadService.executeGenerationPlan(session.generationPlan);
    
    // Update session with results
    sessionManager.updateSession(sessionId, {
      executionResults: results,
      currentStep: 'results',
      completed: true
    });
    
    // Send completion notification
    const totalRecordsCreated = results.reduce((sum: number, r: any) => sum + r.recordsCreated, 0);
    const totalRecordsFailed = results.reduce((sum: number, r: any) => sum + r.recordsFailed, 0);
    
    socketService.sendStepComplete(sessionId, 'execution', {
      totalRecordsCreated,
      totalRecordsFailed,
      totalObjects: results.length,
      successRate: totalRecordsCreated / (totalRecordsCreated + totalRecordsFailed) * 100
    });
    
    socketService.sendLog(sessionId, 'success', 
      `Data load completed: ${totalRecordsCreated} records created, ${totalRecordsFailed} failed`);
    
  } catch (error) {
    console.error('Data load execution error:', error);
    
    sessionManager.updateSession(sessionId, {
      currentStep: 'results',
      completed: false
    });
    
    socketService.sendError(
      sessionId,
      error instanceof Error ? error.message : 'Data load execution failed',
      'execution'
    );
  }
}

export default router;