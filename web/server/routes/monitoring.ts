import express from 'express';
import { APIResponse } from '../../shared/types/api';

const router = express.Router();

/**
 * Get system monitoring information
 */
router.get('/system', async (req, res) => {
  try {
    const systemInfo = {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform
      },
      websocket: req.socketService.getConnectionStats(),
      sessions: req.sessionManager.getSessionStats()
    };
    
    const response: APIResponse = {
      success: true,
      data: systemInfo,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get system information',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get session analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    const sessions = req.sessionManager.getAllSessions();
    const now = new Date();
    let cutoff: Date;
    
    switch (timeframe) {
      case '1h':
        cutoff = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    const recentSessions = sessions.filter(s => s.createdAt >= cutoff);
    
    const analytics = {
      timeframe,
      totalSessions: recentSessions.length,
      completedSessions: recentSessions.filter(s => s.completed).length,
      activeSessions: recentSessions.filter(s => !s.completed && s.updatedAt >= new Date(now.getTime() - 60 * 60 * 1000)).length,
      averageSessionDuration: calculateAverageSessionDuration(recentSessions.filter(s => s.completed)),
      stepDistribution: calculateStepDistribution(recentSessions),
      successRate: calculateSuccessRate(recentSessions),
      objectPopularity: calculateObjectPopularity(recentSessions),
      errorFrequency: calculateErrorFrequency(recentSessions)
    };
    
    const response: APIResponse = {
      success: true,
      data: analytics,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get analytics',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get performance metrics
 */
router.get('/performance', async (req, res) => {
  try {
    const sessions = req.sessionManager.getAllSessions();
    const completedSessions = sessions.filter(s => s.completed && s.executionResults);
    
    const performanceMetrics = {
      averageRecordsPerSecond: calculateAverageRecordsPerSecond(completedSessions),
      averageObjectProcessingTime: calculateAverageObjectProcessingTime(completedSessions),
      successRateByObject: calculateSuccessRateByObject(completedSessions),
      performanceTrends: calculatePerformanceTrends(completedSessions),
      bottlenecks: identifyBottlenecks(completedSessions)
    };
    
    const response: APIResponse = {
      success: true,
      data: performanceMetrics,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get performance metrics',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get health check information
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      checks: {
        memory: checkMemoryUsage(),
        diskSpace: await checkDiskSpace(),
        websocket: checkWebSocketHealth(req.socketService),
        sessionManager: checkSessionManagerHealth(req.sessionManager)
      },
      timestamp: new Date().toISOString()
    };
    
    const overallHealth = Object.values(health.checks).every(check => check.status === 'healthy');
    health.status = overallHealth ? 'healthy' : 'degraded';
    
    const response: APIResponse = {
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    };
    
    res.status(overallHealth ? 200 : 503).json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString()
    };
    
    res.status(503).json(response);
  }
});

// Helper functions for analytics calculations

function calculateAverageSessionDuration(completedSessions: any[]): number {
  if (completedSessions.length === 0) return 0;
  
  const totalDuration = completedSessions.reduce((sum, session) => {
    return sum + (session.updatedAt.getTime() - session.createdAt.getTime());
  }, 0);
  
  return totalDuration / completedSessions.length / 1000; // Return in seconds
}

function calculateStepDistribution(sessions: any[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  
  sessions.forEach(session => {
    distribution[session.currentStep] = (distribution[session.currentStep] || 0) + 1;
  });
  
  return distribution;
}

function calculateSuccessRate(sessions: any[]): number {
  const completedSessions = sessions.filter(s => s.completed);
  if (completedSessions.length === 0) return 0;
  
  const successfulSessions = completedSessions.filter(s => 
    s.executionResults && s.executionResults.every((r: any) => r.recordsCreated > 0)
  );
  
  return (successfulSessions.length / completedSessions.length) * 100;
}

function calculateObjectPopularity(sessions: any[]): Record<string, number> {
  const popularity: Record<string, number> = {};
  
  sessions.forEach(session => {
    if (session.selectedObjects) {
      session.selectedObjects.forEach((obj: string) => {
        popularity[obj] = (popularity[obj] || 0) + 1;
      });
    }
  });
  
  return popularity;
}

function calculateErrorFrequency(sessions: any[]): Record<string, number> {
  const errors: Record<string, number> = {};
  
  sessions.forEach(session => {
    if (session.executionResults) {
      session.executionResults.forEach((result: any) => {
        result.errors.forEach((error: string) => {
          errors[error] = (errors[error] || 0) + 1;
        });
      });
    }
  });
  
  return errors;
}

function calculateAverageRecordsPerSecond(completedSessions: any[]): number {
  if (completedSessions.length === 0) return 0;
  
  const totalRecordsPerSecond = completedSessions.map(session => {
    if (!session.executionResults) return 0;
    
    const totalRecords = session.executionResults.reduce((sum: number, r: any) => sum + r.recordsCreated, 0);
    const totalTime = session.executionResults.reduce((sum: number, r: any) => sum + r.timeTaken, 0);
    
    return totalTime > 0 ? totalRecords / (totalTime / 1000) : 0;
  });
  
  return totalRecordsPerSecond.reduce((sum, rate) => sum + rate, 0) / totalRecordsPerSecond.length;
}

function calculateAverageObjectProcessingTime(completedSessions: any[]): Record<string, number> {
  const objectTimes: Record<string, number[]> = {};
  
  completedSessions.forEach(session => {
    if (session.executionResults) {
      session.executionResults.forEach((result: any) => {
        if (!objectTimes[result.objectName]) {
          objectTimes[result.objectName] = [];
        }
        objectTimes[result.objectName].push(result.timeTaken);
      });
    }
  });
  
  const averageTimes: Record<string, number> = {};
  Object.entries(objectTimes).forEach(([objectName, times]) => {
    averageTimes[objectName] = times.reduce((sum, time) => sum + time, 0) / times.length;
  });
  
  return averageTimes;
}

function calculateSuccessRateByObject(completedSessions: any[]): Record<string, number> {
  const objectStats: Record<string, { total: number; successful: number }> = {};
  
  completedSessions.forEach(session => {
    if (session.executionResults) {
      session.executionResults.forEach((result: any) => {
        if (!objectStats[result.objectName]) {
          objectStats[result.objectName] = { total: 0, successful: 0 };
        }
        objectStats[result.objectName].total++;
        if (result.recordsCreated > 0) {
          objectStats[result.objectName].successful++;
        }
      });
    }
  });
  
  const successRates: Record<string, number> = {};
  Object.entries(objectStats).forEach(([objectName, stats]) => {
    successRates[objectName] = (stats.successful / stats.total) * 100;
  });
  
  return successRates;
}

function calculatePerformanceTrends(completedSessions: any[]): any[] {
  // Group sessions by day and calculate daily performance metrics
  const dailyMetrics: Record<string, any> = {};
  
  completedSessions.forEach(session => {
    const date = session.createdAt.toISOString().split('T')[0];
    
    if (!dailyMetrics[date]) {
      dailyMetrics[date] = {
        date,
        sessions: 0,
        totalRecords: 0,
        averageTime: 0,
        successRate: 0
      };
    }
    
    dailyMetrics[date].sessions++;
    
    if (session.executionResults) {
      const totalRecords = session.executionResults.reduce((sum: number, r: any) => sum + r.recordsCreated, 0);
      const totalTime = session.executionResults.reduce((sum: number, r: any) => sum + r.timeTaken, 0);
      
      dailyMetrics[date].totalRecords += totalRecords;
      dailyMetrics[date].averageTime += totalTime;
    }
  });
  
  return Object.values(dailyMetrics);
}

function identifyBottlenecks(completedSessions: any[]): string[] {
  const bottlenecks: string[] = [];
  
  const averageObjectTimes = calculateAverageObjectProcessingTime(completedSessions);
  const slowObjects = Object.entries(averageObjectTimes)
    .filter(([_, time]) => time > 10000) // Objects taking more than 10 seconds
    .map(([objectName, _]) => objectName);
  
  if (slowObjects.length > 0) {
    bottlenecks.push(`Slow processing objects: ${slowObjects.join(', ')}`);
  }
  
  const successRates = calculateSuccessRateByObject(completedSessions);
  const problematicObjects = Object.entries(successRates)
    .filter(([_, rate]) => rate < 80) // Objects with less than 80% success rate
    .map(([objectName, _]) => objectName);
  
  if (problematicObjects.length > 0) {
    bottlenecks.push(`Objects with high failure rates: ${problematicObjects.join(', ')}`);
  }
  
  return bottlenecks;
}

// Health check functions

function checkMemoryUsage(): { status: string; usage: any } {
  const memUsage = process.memoryUsage();
  const maxHeapSize = memUsage.heapTotal;
  const usedHeap = memUsage.heapUsed;
  const usagePercentage = (usedHeap / maxHeapSize) * 100;
  
  return {
    status: usagePercentage > 90 ? 'critical' : usagePercentage > 70 ? 'warning' : 'healthy',
    usage: {
      ...memUsage,
      usagePercentage: Math.round(usagePercentage)
    }
  };
}

async function checkDiskSpace(): Promise<{ status: string; info: string }> {
  // Simplified disk space check - in production, use a proper disk space library
  try {
    const { execSync } = require('child_process');
    const output = execSync('df -h /', { encoding: 'utf8' });
    return {
      status: 'healthy',
      info: 'Disk space check completed'
    };
  } catch (error) {
    return {
      status: 'unknown',
      info: 'Unable to check disk space'
    };
  }
}

function checkWebSocketHealth(socketService: any): { status: string; connections: number } {
  const stats = socketService.getConnectionStats();
  return {
    status: 'healthy',
    connections: stats.totalConnections
  };
}

function checkSessionManagerHealth(sessionManager: any): { status: string; sessions: any } {
  const stats = sessionManager.getSessionStats();
  return {
    status: 'healthy',
    sessions: stats
  };
}

export default router;