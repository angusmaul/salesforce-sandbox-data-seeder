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
    mostCommonErrors: {
        error: string;
        count: number;
    }[];
}
export declare class LoadLoggerService {
    private logDirectory;
    private currentSession;
    constructor(logDirectory?: string);
    startSession(plans: GenerationPlan[]): Promise<string>;
    logObjectResult(objectName: string, recordsAttempted: number, generatedData: any[], successfulRecords: LoadRecord[], failedRecords: LoadRecord[], timeTaken: number): Promise<void>;
    endSession(): Promise<string>;
    private generateSessionId;
    private ensureLogDirectory;
    private calculateSummary;
    private writeLogFile;
}
//# sourceMappingURL=load-logger.d.ts.map