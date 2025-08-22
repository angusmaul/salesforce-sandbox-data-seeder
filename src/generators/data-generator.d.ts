import { SalesforceField, SalesforceObject, SandboxInfo } from '../models/salesforce';
export interface GenerationPlan {
    objectName: string;
    recordCount: number;
    fields: SalesforceField[];
    dependencies: string[];
}
export declare class DataGenerationService {
    private referenceStore;
    constructor(locale?: string, seed?: number);
    createGenerationPlan(selectedObjects: string[], recordsPerObject: number, sandboxInfo: SandboxInfo, objects?: SalesforceObject[], useExactCounts?: boolean): Promise<GenerationPlan[]>;
    generateRecords(salesforceObject: SalesforceObject, count: number): any[];
    private generateFieldValue;
    private generateByFieldType;
    private generateStringValue;
    private generateTextAreaValue;
    private generateDoubleValue;
    private generateCurrencyValue;
    private generatePercentValue;
    private generateDateValue;
    private generateDateTimeValue;
    private generateTimeValue;
    private generatePicklistValue;
    private generateMultiPicklistValue;
    private generateComboboxValue;
    private generateEncryptedStringValue;
    private generateJsonValue;
    private generateIntegerValue;
    private generateDecimalValue;
    private generateReferenceValue;
    private generatePicklistFallback;
    private generateContextualValue;
    private generateSalesforceId;
    private shouldSkipField;
    private isAddressComponentField;
    private getSkipReason;
    private findDependencies;
    private sortPlanByDependencies;
    private createExactCounts;
    private calculateRecordCounts;
    private calculateStorageLimits;
    clearReferenceStore(): void;
    updateReferenceStoreWithSalesforceIds(objectName: string, successfulRecords: any[]): void;
    updateReferenceFields(records: any[], objectMeta: SalesforceObject, objectName: string): void;
    private isFakeSalesforceId;
    private isSystemField;
    private isCircularReference;
}
//# sourceMappingURL=data-generator.d.ts.map