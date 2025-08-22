import { SalesforceService } from '../services/salesforce';
import { SandboxInfo } from '../models/salesforce';
export declare class SandboxService {
    private salesforceService;
    constructor(salesforceService: SalesforceService);
    detectSandboxInfo(): Promise<SandboxInfo>;
    private determineSandboxType;
    calculateAvailableStorage(sandboxInfo: SandboxInfo): Promise<{
        availableDataMB: number;
        availableFileMB: number;
        usagePercentage: number;
    }>;
    estimateRecordCapacity(sandboxInfo: SandboxInfo, avgRecordSizeKB?: number): Promise<{
        maxRecords: number;
        recommendedRecords: number;
        warningThreshold: number;
    }>;
    validateStorageBeforeGeneration(sandboxInfo: SandboxInfo, estimatedRecords: number, avgRecordSizeKB?: number): Promise<{
        canProceed: boolean;
        warnings: string[];
        errors: string[];
    }>;
    getRecommendedObjectCounts(sandboxInfo: SandboxInfo, objectCount: number): {
        [key: string]: number;
    };
    private getBaseRecordsPerObject;
}
//# sourceMappingURL=sandbox-detector.d.ts.map