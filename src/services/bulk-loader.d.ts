import { SalesforceService } from './salesforce';
import { GenerationPlan } from '../generators/data-generator';
import { SeedResult } from '../models/salesforce';
export declare class DataLoadService {
    private salesforceService;
    private generationService;
    private discoveryService;
    private logger;
    constructor(salesforceService: SalesforceService, logDirectory?: string);
    executeGenerationPlan(plans: GenerationPlan[]): Promise<SeedResult[]>;
    private restInsert;
    validateRecords(objectName: string, records: any[]): Promise<{
        valid: any[];
        invalid: any[];
        warnings: string[];
    }>;
    estimateDataSize(records: any[]): Promise<{
        totalSizeKB: number;
        avgRecordSizeKB: number;
        estimatedStorageMB: number;
    }>;
}
//# sourceMappingURL=bulk-loader.d.ts.map