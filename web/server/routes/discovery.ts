import express from 'express';
import { SalesforceService } from '../../../src/services/salesforce';
import { ObjectDiscoveryService } from '../../../src/services/object-discovery';
import { EnhancedDiscoveryService } from '../services/enhanced-discovery';
import { APIResponse } from '../../shared/types/api';
import { SalesforceObject } from '../../../src/models/salesforce';

const router = express.Router();

/**
 * Start object discovery process
 */
router.post('/start/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { includeCustomOnly = false, objectFilter } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.connectionInfo) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not authenticated',
        timestamp: new Date().toISOString()
      });
    }
    
    // Update session step
    req.sessionManager.updateSessionStep(sessionId, 'discovery');
    
    // Initialize Salesforce service
    const salesforceService = new SalesforceService();
    await salesforceService.setAccessToken(
      session.connectionInfo.accessToken,
      session.connectionInfo.instanceUrl
    );
    
    const discoveryService = new ObjectDiscoveryService(salesforceService);
    
    // Send initial progress
    req.socketService.sendProgress(sessionId, 'discovery', 0, 'Starting object discovery...');
    
    // Start discovery process
    setImmediate(async () => {
      try {
        const objects = await discoveryService.discoverObjects(true);
        
        // Update session with discovered objects
        req.sessionManager.updateSession(sessionId, {
          discoveredObjects: objects
        });
        
        req.socketService.sendStepComplete(sessionId, 'discovery', {
          totalObjects: objects.length,
          customObjects: objects.filter(obj => obj.custom).length,
          standardObjects: objects.filter(obj => !obj.custom).length
        });
        
      } catch (error) {
        console.error('Discovery error:', error);
        req.socketService.sendError(
          sessionId,
          error instanceof Error ? error.message : 'Discovery failed',
          'discovery'
        );
      }
    });
    
    const response: APIResponse = {
      success: true,
      data: { started: true },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start discovery',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get discovery results
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
    
    const response: APIResponse<SalesforceObject[]> = {
      success: true,
      data: session.discoveredObjects || [],
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get discovery results',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get detailed object information
 */
router.get('/object/:sessionId/:objectName', async (req, res) => {
  try {
    const { sessionId, objectName } = req.params;
    const session = req.sessionManager.getSession(sessionId);
    
    if (!session || !session.connectionInfo) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not authenticated',
        timestamp: new Date().toISOString()
      });
    }
    
    // Initialize Salesforce service
    const salesforceService = new SalesforceService();
    await salesforceService.setAccessToken(
      session.connectionInfo.accessToken,
      session.connectionInfo.instanceUrl
    );
    
    const discoveryService = new ObjectDiscoveryService(salesforceService);
    const objectDetails = await discoveryService.describeObject(objectName, true);
    
    const response: APIResponse<SalesforceObject> = {
      success: true,
      data: objectDetails,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get object details',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Analyze object relationships
 */
router.get('/relationships/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = req.sessionManager.getSession(sessionId);
    
    if (!session || !session.discoveredObjects) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or discovery not completed',
        timestamp: new Date().toISOString()
      });
    }
    
    // Analyze relationships between discovered objects
    const relationships = analyzeObjectRelationships(session.discoveredObjects);
    
    const response: APIResponse = {
      success: true,
      data: relationships,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze relationships',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get discovery statistics
 */
router.get('/stats/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = req.sessionManager.getSession(sessionId);
    
    if (!session || !session.discoveredObjects) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or discovery not completed',
        timestamp: new Date().toISOString()
      });
    }
    
    const objects = session.discoveredObjects;
    const stats = {
      totalObjects: objects.length,
      standardObjects: objects.filter(obj => !obj.custom).length,
      customObjects: objects.filter(obj => obj.custom).length,
      creatableObjects: objects.filter(obj => obj.createable).length,
      queryableObjects: objects.filter(obj => obj.queryable).length,
      fieldStats: {
        totalFields: objects.reduce((sum, obj) => sum + obj.fields.length, 0),
        customFields: objects.reduce((sum, obj) => 
          sum + obj.fields.filter(field => field.name.endsWith('__c')).length, 0),
        referenceFields: objects.reduce((sum, obj) => 
          sum + obj.fields.filter(field => field.type === 'reference').length, 0),
        requiredFields: objects.reduce((sum, obj) => 
          sum + obj.fields.filter(field => field.required).length, 0)
      },
      objectsByCategory: categorizeObjects(objects)
    };
    
    const response: APIResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get discovery stats',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Analyze relationships between objects
 */
function analyzeObjectRelationships(objects: SalesforceObject[]) {
  const relationships: any[] = [];
  const objectNames = new Set(objects.map(obj => obj.name));
  
  objects.forEach(obj => {
    obj.fields.forEach(field => {
      if (field.type === 'reference' && field.referenceTo) {
        field.referenceTo.forEach(targetObject => {
          if (objectNames.has(targetObject)) {
            relationships.push({
              from: obj.name,
              to: targetObject,
              field: field.name,
              type: 'reference',
              required: field.required
            });
          }
        });
      }
    });
    
    obj.childRelationships.forEach(childRel => {
      if (objectNames.has(childRel.childSObject)) {
        relationships.push({
          from: obj.name,
          to: childRel.childSObject,
          field: childRel.field,
          type: 'child',
          relationshipName: childRel.relationshipName
        });
      }
    });
  });
  
  return relationships;
}

/**
 * Categorize objects by type
 */
function categorizeObjects(objects: SalesforceObject[]) {
  const categories: { [key: string]: string[] } = {
    core: [],
    sales: [],
    service: [],
    marketing: [],
    custom: [],
    system: []
  };
  
  const coreObjects = ['Account', 'Contact', 'Lead', 'User', 'Organization'];
  const salesObjects = ['Opportunity', 'OpportunityLineItem', 'Product2', 'Pricebook2', 'PricebookEntry', 'Quote'];
  const serviceObjects = ['Case', 'CaseComment', 'Solution', 'KnowledgeArticle'];
  const marketingObjects = ['Campaign', 'CampaignMember'];
  
  objects.forEach(obj => {
    if (obj.custom) {
      categories.custom.push(obj.name);
    } else if (coreObjects.includes(obj.name)) {
      categories.core.push(obj.name);
    } else if (salesObjects.includes(obj.name)) {
      categories.sales.push(obj.name);
    } else if (serviceObjects.includes(obj.name)) {
      categories.service.push(obj.name);
    } else if (marketingObjects.includes(obj.name)) {
      categories.marketing.push(obj.name);
    } else {
      categories.system.push(obj.name);
    }
  });
  
  return categories;
}

/**
 * Start enhanced discovery with validation rules
 */
router.post('/enhanced/start/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { 
      includeValidationRules = true,
      includeSchemaAnalysis = true,
      anonymizeForAI = false,
      cacheResults = true 
    } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.connectionInfo) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not authenticated',
        timestamp: new Date().toISOString()
      });
    }
    
    // Update session step
    req.sessionManager.updateSessionStep(sessionId, 'discovery');
    
    // Initialize Enhanced Discovery service
    const salesforceService = new SalesforceService();
    await salesforceService.setAccessToken(
      session.connectionInfo.accessToken,
      session.connectionInfo.instanceUrl
    );
    
    const enhancedDiscoveryService = new EnhancedDiscoveryService(salesforceService);
    
    // Send initial progress
    req.socketService.sendProgress(sessionId, 'discovery', 0, 'Starting enhanced object discovery with validation rules...');
    
    // Start enhanced discovery process
    setImmediate(async () => {
      try {
        const objects = await enhancedDiscoveryService.discoverObjectsWithValidation({
          includeValidationRules,
          includeSchemaAnalysis,
          anonymizeForAI,
          cacheResults
        });
        
        // Update session with enhanced discovered objects
        req.sessionManager.updateSession(sessionId, {
          discoveredObjects: objects,
          enhancedDiscovery: true
        });
        
        req.socketService.sendStepComplete(sessionId, 'discovery', {
          totalObjects: objects.length,
          customObjects: objects.filter(obj => obj.custom).length,
          standardObjects: objects.filter(obj => !obj.custom).length,
          objectsWithValidationRules: objects.filter(obj => obj.validationRules && obj.validationRules.length > 0).length,
          totalValidationRules: objects.reduce((sum, obj) => sum + (obj.validationRules?.length || 0), 0)
        });
        
      } catch (error) {
        console.error('Enhanced discovery error:', error);
        req.socketService.sendError(
          sessionId,
          error instanceof Error ? error.message : 'Enhanced discovery failed',
          'discovery'
        );
      }
    });
    
    const response: APIResponse = {
      success: true,
      data: { started: true, enhanced: true },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start enhanced discovery',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get enhanced object details with validation rules
 */
router.get('/enhanced/object/:sessionId/:objectName', async (req, res) => {
  try {
    const { sessionId, objectName } = req.params;
    const { 
      includeValidationRules = true,
      includeSchemaAnalysis = true,
      anonymizeForAI = false 
    } = req.query;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.connectionInfo) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not authenticated',
        timestamp: new Date().toISOString()
      });
    }
    
    // Initialize Enhanced Discovery service
    const salesforceService = new SalesforceService();
    await salesforceService.setAccessToken(
      session.connectionInfo.accessToken,
      session.connectionInfo.instanceUrl
    );
    
    const enhancedDiscoveryService = new EnhancedDiscoveryService(salesforceService);
    const objectDetails = await enhancedDiscoveryService.getEnhancedObject(objectName, {
      includeValidationRules: includeValidationRules === 'true',
      includeSchemaAnalysis: includeSchemaAnalysis === 'true',
      anonymizeForAI: anonymizeForAI === 'true'
    });
    
    const response: APIResponse<SalesforceObject> = {
      success: true,
      data: objectDetails,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get enhanced object details',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Create anonymized schema summary for AI analysis
 */
router.post('/enhanced/ai-summary/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { objectNames } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.discoveredObjects) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or discovery not completed',
        timestamp: new Date().toISOString()
      });
    }
    
    // Filter objects if specific ones are requested
    let objectsToSummarize = session.discoveredObjects;
    if (objectNames && Array.isArray(objectNames)) {
      objectsToSummarize = session.discoveredObjects.filter(obj => 
        objectNames.includes(obj.name)
      );
    }
    
    // Initialize Enhanced Discovery service
    const salesforceService = new SalesforceService();
    await salesforceService.setAccessToken(
      session.connectionInfo.accessToken,
      session.connectionInfo.instanceUrl
    );
    
    const enhancedDiscoveryService = new EnhancedDiscoveryService(salesforceService);
    const { summary, anonymizationMap } = await enhancedDiscoveryService.createAISchemaSummary(objectsToSummarize);
    
    // Store anonymization map in session for reference
    req.sessionManager.updateSession(sessionId, {
      aiSchemaSummary: summary,
      anonymizationMap: Object.fromEntries(anonymizationMap)
    });
    
    const response: APIResponse = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create AI schema summary',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get validation rules analysis for specific objects
 */
router.get('/enhanced/validation-analysis/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { objectNames } = req.query;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session || !session.discoveredObjects) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or discovery not completed',
        timestamp: new Date().toISOString()
      });
    }
    
    let objectsToAnalyze = session.discoveredObjects;
    if (objectNames) {
      const names = typeof objectNames === 'string' ? objectNames.split(',') : 
                   Array.isArray(objectNames) ? objectNames.map(String) : [String(objectNames)];
      objectsToAnalyze = session.discoveredObjects.filter(obj => 
        names.includes(obj.name)
      );
    }
    
    // Extract validation analysis
    const validationAnalysis = objectsToAnalyze.map(obj => ({
      objectName: obj.name,
      validationRuleCount: obj.validationRules?.length || 0,
      schemaAnalysis: obj.schemaAnalysis ? {
        complexityScore: obj.schemaAnalysis.complexityScore,
        riskFactors: obj.schemaAnalysis.riskFactors,
        recommendations: obj.schemaAnalysis.recommendations,
        fieldDependencyCount: obj.schemaAnalysis.fieldDependencies.length,
        constraintCount: obj.schemaAnalysis.fieldConstraints.length
      } : null
    }));
    
    const response: APIResponse = {
      success: true,
      data: {
        totalObjectsAnalyzed: objectsToAnalyze.length,
        objectsWithValidationRules: objectsToAnalyze.filter(obj => 
          obj.validationRules && obj.validationRules.length > 0
        ).length,
        totalValidationRules: objectsToAnalyze.reduce((sum, obj) => 
          sum + (obj.validationRules?.length || 0), 0
        ),
        analysis: validationAnalysis
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get validation analysis',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

export default router;