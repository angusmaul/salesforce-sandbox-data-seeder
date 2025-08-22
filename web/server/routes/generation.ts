import express from 'express';
import { DataGenerationService } from '../../../src/generators/data-generator';
import { SalesforceService } from '../../../src/services/salesforce';
import { SandboxService } from '../../../src/sandbox/sandbox-detector';
import { APIResponse } from '../../shared/types/api';

const router = express.Router();

/**
 * Create generation plan based on selected objects
 */
router.post('/plan/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { selectedObjects, recordsPerObject = 10, useExactCounts = false } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.connectionInfo || !session.discoveredObjects) {
      return res.status(404).json({
        success: false,
        error: 'Session not found, not authenticated, or discovery not completed',
        timestamp: new Date().toISOString()
      });
    }
    
    // Update session with selected objects
    req.sessionManager.updateSession(sessionId, {
      selectedObjects
    });
    
    // Initialize services
    const salesforceService = new SalesforceService();
    await salesforceService.setAccessToken(
      session.connectionInfo.accessToken,
      session.connectionInfo.instanceUrl
    );
    
    const sandboxService = new SandboxService(salesforceService);
    const sandboxInfo = await sandboxService.detectSandboxInfo();
    
    const generationService = new DataGenerationService();
    
    // Create generation plan
    const plan = await generationService.createGenerationPlan(
      selectedObjects,
      recordsPerObject,
      sandboxInfo,
      session.discoveredObjects,
      useExactCounts
    );
    
    // Update session with generation plan
    req.sessionManager.updateSession(sessionId, {
      generationPlan: plan
    });
    
    const response: APIResponse = {
      success: true,
      data: {
        plan,
        sandboxInfo,
        estimatedRecords: plan.reduce((sum, p) => sum + p.recordCount, 0)
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create generation plan',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Generate preview data for selected objects
 */
router.post('/preview/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { objectName, sampleSize = 3 } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.discoveredObjects) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or discovery not completed',
        timestamp: new Date().toISOString()
      });
    }
    
    const objectMeta = session.discoveredObjects.find(obj => obj.name === objectName);
    if (!objectMeta) {
      return res.status(404).json({
        success: false,
        error: `Object ${objectName} not found in discovered objects`,
        timestamp: new Date().toISOString()
      });
    }
    
    const generationService = new DataGenerationService();
    const sampleRecords = generationService.generateRecords(objectMeta, sampleSize);
    
    // Send real-time preview to client
    req.socketService.sendDataPreview(sessionId, objectName, sampleRecords);
    
    const response: APIResponse = {
      success: true,
      data: {
        objectName,
        sampleRecords,
        fieldCount: objectMeta.fields.length,
        populatedFields: Object.keys(sampleRecords[0] || {}).length
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate preview data',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get field generation statistics
 */
router.get('/field-stats/:sessionId/:objectName', async (req, res) => {
  try {
    const { sessionId, objectName } = req.params;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.discoveredObjects) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or discovery not completed',
        timestamp: new Date().toISOString()
      });
    }
    
    const objectMeta = session.discoveredObjects.find(obj => obj.name === objectName);
    if (!objectMeta) {
      return res.status(404).json({
        success: false,
        error: `Object ${objectName} not found`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Analyze field generation capabilities
    const fieldStats = analyzeFieldGeneration(objectMeta);
    
    const response: APIResponse = {
      success: true,
      data: fieldStats,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get field statistics',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Validate generation plan
 */
router.post('/validate/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.generationPlan || !session.connectionInfo) {
      return res.status(404).json({
        success: false,
        error: 'Session not found, no generation plan, or not authenticated',
        timestamp: new Date().toISOString()
      });
    }
    
    // Initialize Salesforce service for storage validation
    const salesforceService = new SalesforceService();
    await salesforceService.setAccessToken(
      session.connectionInfo.accessToken,
      session.connectionInfo.instanceUrl
    );
    
    const sandboxService = new SandboxService(salesforceService);
    const sandboxInfo = await sandboxService.detectSandboxInfo();
    
    // Validate the plan
    const validation = validateGenerationPlan(session.generationPlan, sandboxInfo);
    
    // Send storage update to client
    req.socketService.sendStorageUpdate(sessionId, {
      current: sandboxInfo.currentDataUsage,
      limit: sandboxInfo.dataStorageLimit,
      estimated: validation.estimatedStorageUsage,
      available: sandboxInfo.dataStorageLimit - (sandboxInfo.currentDataUsage || 0)
    });
    
    const response: APIResponse = {
      success: true,
      data: validation,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate generation plan',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Update generation plan
 */
router.put('/plan/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { planUpdates } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.generationPlan) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or no generation plan exists',
        timestamp: new Date().toISOString()
      });
    }
    
    // Update plan with new record counts
    const updatedPlan = session.generationPlan.map(planItem => {
      const update = planUpdates.find((u: any) => u.objectName === planItem.objectName);
      return update ? { ...planItem, recordCount: update.recordCount } : planItem;
    });
    
    // Update session with modified plan
    req.sessionManager.updateSession(sessionId, {
      generationPlan: updatedPlan
    });
    
    const response: APIResponse = {
      success: true,
      data: { plan: updatedPlan },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update generation plan',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Analyze field generation capabilities for an object
 */
function analyzeFieldGeneration(objectMeta: any) {
  const fields = objectMeta.fields;
  
  const stats = {
    total: fields.length,
    creatable: fields.filter((f: any) => f.createable !== false).length,
    required: fields.filter((f: any) => f.required).length,
    byType: {} as { [key: string]: number },
    skipped: {
      system: fields.filter((f: any) => isSystemField(f.name)).length,
      calculated: fields.filter((f: any) => f.calculated).length,
      autoNumber: fields.filter((f: any) => f.autoNumber).length,
      nonCreatable: fields.filter((f: any) => f.createable === false).length
    },
    withDefaults: fields.filter((f: any) => f.defaultValue).length,
    references: fields.filter((f: any) => f.type === 'reference').length,
    picklists: fields.filter((f: any) => f.picklistValues && f.picklistValues.length > 0).length
  };
  
  // Count by field type
  fields.forEach((field: any) => {
    stats.byType[field.type] = (stats.byType[field.type] || 0) + 1;
  });
  
  return stats;
}

/**
 * Check if field is a system field
 */
function isSystemField(fieldName: string): boolean {
  const systemFields = [
    'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
    'SystemModstamp', 'IsDeleted', 'LastActivityDate', 'LastViewedDate',
    'LastReferencedDate', 'OwnerId'
  ];
  return systemFields.includes(fieldName);
}

/**
 * Validate generation plan against storage and other constraints
 */
function validateGenerationPlan(plan: any[], sandboxInfo: any) {
  const totalRecords = plan.reduce((sum, p) => sum + p.recordCount, 0);
  const estimatedStorageKB = totalRecords * 2; // 2KB per record estimate
  const estimatedStorageMB = estimatedStorageKB / 1024;
  
  const currentUsageMB = sandboxInfo.currentDataUsage || 0;
  const totalLimitMB = sandboxInfo.dataStorageLimit;
  const availableMB = totalLimitMB - currentUsageMB;
  const usageAfterLoad = currentUsageMB + estimatedStorageMB;
  const usagePercentage = (usageAfterLoad / totalLimitMB) * 100;
  
  const warnings = [];
  const errors = [];
  
  if (usagePercentage > 80) {
    warnings.push(`Storage usage will exceed 80% (${usagePercentage.toFixed(1)}%)`);
  }
  
  if (usagePercentage > 95) {
    errors.push(`Storage usage will exceed 95% (${usagePercentage.toFixed(1)}%)`);
  }
  
  if (estimatedStorageMB > availableMB) {
    errors.push(`Estimated storage (${estimatedStorageMB.toFixed(1)}MB) exceeds available space (${availableMB.toFixed(1)}MB)`);
  }
  
  return {
    valid: errors.length === 0,
    totalRecords,
    estimatedStorageUsage: estimatedStorageMB,
    availableStorage: availableMB,
    usagePercentage,
    warnings,
    errors,
    recommendations: generateRecommendations(plan, sandboxInfo)
  };
}

/**
 * Generate recommendations for the plan
 */
function generateRecommendations(plan: any[], sandboxInfo: any) {
  const recommendations = [];
  const totalRecords = plan.reduce((sum, p) => sum + p.recordCount, 0);
  
  if (totalRecords > 1000) {
    recommendations.push('Consider reducing record counts for faster execution');
  }
  
  if (plan.length > 10) {
    recommendations.push('Large number of objects selected - consider focusing on core objects first');
  }
  
  const hasComplexObjects = plan.some(p => 
    p.dependencies && p.dependencies.length > 3
  );
  
  if (hasComplexObjects) {
    recommendations.push('Complex object dependencies detected - generation will follow dependency order');
  }
  
  return recommendations;
}

export default router;