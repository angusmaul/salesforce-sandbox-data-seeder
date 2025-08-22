"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoadLoggerService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
class LoadLoggerService {
    constructor(logDirectory = './logs') {
        this.currentSession = null;
        this.logDirectory = logDirectory;
    }
    async startSession(plans) {
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
    async logObjectResult(objectName, recordsAttempted, generatedData, successfulRecords, failedRecords, timeTaken) {
        if (!this.currentSession) {
            throw new Error('No active logging session');
        }
        const objectResult = {
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
    async endSession() {
        if (!this.currentSession) {
            throw new Error('No active logging session to end');
        }
        this.currentSession.endTime = new Date();
        this.currentSession.summary = this.calculateSummary();
        const logFilePath = await this.writeLogFile();
        this.currentSession = null;
        return logFilePath;
    }
    generateSessionId() {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
        const random = Math.random().toString(36).substring(2, 8);
        return `load_${timestamp}_${random}`;
    }
    async ensureLogDirectory() {
        try {
            await fs.access(this.logDirectory);
        }
        catch {
            await fs.mkdir(this.logDirectory, { recursive: true });
        }
    }
    calculateSummary() {
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
        const errorCounts = {};
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
    async writeLogFile() {
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
exports.LoadLoggerService = LoadLoggerService;
//# sourceMappingURL=load-logger.js.map