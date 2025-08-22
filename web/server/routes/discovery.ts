import express from 'express';
import { SalesforceService } from '../../../src/services/salesforce';
import { ObjectDiscoveryService } from '../../../src/services/object-discovery';
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

export default router;