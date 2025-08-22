import * as fs from 'fs/promises';
import * as path from 'path';
import { SeedResult } from '../models/salesforce';
import { GenerationPlan } from '../generators/data-generator';

export interface LoadSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  totalObjects: number;
  totalRecordsAttempted: number;
  totalRecordsCreated: number;
  totalRecordsFailed: number;
  objectResults: ObjectLoadResult[];
  summary: LoadSummary;
}

export interface ObjectLoadResult {
  objectName: string;
  recordsAttempted: number;
  recordsCreated: number;
  recordsFailed: number;
  timeTaken: number;
  generatedData: any[];
  successfulRecords: LoadRecord[];
  failedRecords: LoadRecord[];
}

export interface LoadRecord {
  recordIndex: number;
  recordData: any;
  result: 'success' | 'failure';
  recordId?: string;
  error?: string;
}

export interface LoadSummary {
  successRate: number;
  totalTimeTaken: number;
  averageTimePerObject: number;
  objectsWithErrors: string[];
  mostCommonErrors: { error: string; count: number }[];
}

export class LoadLoggerService {
  private logDirectory: string;
  private currentSession: LoadSession | null = null;

  constructor(logDirectory: string = './logs') {
    this.logDirectory = logDirectory;
  }

  async startSession(plans: GenerationPlan[]): Promise<string> {
    const sessionId = this.generateSessionId();
    const totalRecordsAttempted = plans.reduce((sum, plan) => sum + plan.recordCount, 0);

    this.currentSession = {
      sessionId,
      startTime: new Date(),
      totalObjects: plans.length,
      totalRecordsAttempted,
      totalRecordsCreated: 0,
      totalRecordsFailed: 0,
      objectResults: [],
      summary: {
        successRate: 0,
        totalTimeTaken: 0,
        averageTimePerObject: 0,
        objectsWithErrors: [],
        mostCommonErrors: []
      }
    };

    // Ensure log directory exists
    await this.ensureLogDirectory();

    return sessionId;
  }

  async logObjectResult(
    objectName: string,
    recordsAttempted: number,
    generatedData: any[],
    successfulRecords: LoadRecord[],
    failedRecords: LoadRecord[],
    timeTaken: number
  ): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active logging session');
    }

    const objectResult: ObjectLoadResult = {
      objectName,
      recordsAttempted,
      recordsCreated: successfulRecords.length,
      recordsFailed: failedRecords.length,
      timeTaken,
      generatedData,
      successfulRecords,
      failedRecords
    };

    this.currentSession.objectResults.push(objectResult);
    this.currentSession.totalRecordsCreated += successfulRecords.length;
    this.currentSession.totalRecordsFailed += failedRecords.length;
  }

  async endSession(): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active logging session to end');
    }

    this.currentSession.endTime = new Date();
    this.currentSession.summary = this.calculateSummary();

    const logFilePath = await this.writeLogFile();
    this.currentSession = null;

    return logFilePath;
  }

  private generateSessionId(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
    const random = Math.random().toString(36).substring(2, 8);
    return `load_${timestamp}_${random}`;
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.access(this.logDirectory);
    } catch {
      await fs.mkdir(this.logDirectory, { recursive: true });
    }
  }

  private calculateSummary(): LoadSummary {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const session = this.currentSession;
    const successRate = session.totalRecordsAttempted > 0 
      ? (session.totalRecordsCreated / session.totalRecordsAttempted) * 100 
      : 0;

    const totalTimeTaken = session.endTime && session.startTime 
      ? session.endTime.getTime() - session.startTime.getTime()
      : 0;

    const averageTimePerObject = session.objectResults.length > 0
      ? session.objectResults.reduce((sum, obj) => sum + obj.timeTaken, 0) / session.objectResults.length
      : 0;

    const objectsWithErrors = session.objectResults
      .filter(obj => obj.recordsFailed > 0)
      .map(obj => obj.objectName);

    // Count most common errors
    const errorCounts: { [error: string]: number } = {};
    session.objectResults.forEach(objResult => {
      objResult.failedRecords.forEach(record => {
        if (record.error) {
          errorCounts[record.error] = (errorCounts[record.error] || 0) + 1;
        }
      });
    });

    const mostCommonErrors = Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      successRate,
      totalTimeTaken,
      averageTimePerObject,
      objectsWithErrors,
      mostCommonErrors
    };
  }

  private async writeLogFile(): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session to log');
    }

    const logFileName = `${this.currentSession.sessionId}.json`;
    const logFilePath = path.join(this.logDirectory, logFileName);

    // Create a clean log structure
    const logContent = {
      sessionInfo: {
        sessionId: this.currentSession.sessionId,
        startTime: this.currentSession.startTime.toISOString(),
        endTime: this.currentSession.endTime?.toISOString(),
        duration: this.currentSession.summary.totalTimeTaken + 'ms'
      },
      summary: this.currentSession.summary,
      objectResults: this.currentSession.objectResults.map(objResult => ({
        objectName: objResult.objectName,
        recordsAttempted: objResult.recordsAttempted,
        recordsCreated: objResult.recordsCreated,
        recordsFailed: objResult.recordsFailed,
        successRate: objResult.recordsAttempted > 0 ? (objResult.recordsCreated / objResult.recordsAttempted * 100).toFixed(1) + '%' : '0%',
        timeTaken: objResult.timeTaken + 'ms',
        generatedData: objResult.generatedData,
        results: {
          successful: objResult.successfulRecords.map(record => ({
            recordIndex: record.recordIndex,
            recordId: record.recordId,
            data: record.recordData
          })),
          failed: objResult.failedRecords.map(record => ({
            recordIndex: record.recordIndex,
            error: record.error,
            data: record.recordData
          }))
        }
      }))
    };

    await fs.writeFile(logFilePath, JSON.stringify(logContent, null, 2));
    
    return logFilePath;
  }
}