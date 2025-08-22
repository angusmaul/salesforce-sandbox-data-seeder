"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxService = void 0;
class SandboxService {
    constructor(salesforceService) {
        this.salesforceService = salesforceService;
    }
    async detectSandboxInfo() {
        try {
            // Get organization information
            const orgInfo = await this.salesforceService.getOrganization();
            // Allow Developer Edition orgs and Sandboxes
            if (!orgInfo.IsSandbox && orgInfo.OrganizationType !== 'Developer Edition') {
                throw new Error('This tool can only be used with Salesforce sandboxes or Developer Edition orgs, not production orgs');
            }
            // Get limits information
            const limits = await this.salesforceService.getLimits();
            // Extract storage information
            const dataStorageInfo = limits.DataStorageMB;
            const fileStorageInfo = limits.FileStorageMB;
            // Determine sandbox type based on storage limits
            const sandboxType = this.determineSandboxType(dataStorageInfo.Max, fileStorageInfo.Max);
            const sandboxInfo = {
                type: sandboxType,
                dataStorageLimit: dataStorageInfo.Max,
                fileStorageLimit: fileStorageInfo.Max,
                currentDataUsage: dataStorageInfo.Max - dataStorageInfo.Remaining,
                currentFileUsage: fileStorageInfo.Max - fileStorageInfo.Remaining
            };
            // Add record limit for Partial Copy sandboxes
            if (sandboxType === 'Partial Copy') {
                sandboxInfo.recordLimit = 50000; // 50k records per object limit
            }
            return sandboxInfo;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to detect sandbox information: ${errorMessage}`);
        }
    }
    determineSandboxType(dataLimitMB, fileLimitMB) {
        // Determine sandbox type based on storage limits
        if (dataLimitMB <= 200 && fileLimitMB <= 200) {
            return 'Developer';
        }
        else if (dataLimitMB <= 1024 && fileLimitMB <= 1024) { // 1GB = 1024MB
            return 'Developer Pro';
        }
        else if (dataLimitMB <= 5120 && fileLimitMB <= 5120) { // 5GB = 5120MB
            return 'Partial Copy';
        }
        else {
            return 'Full';
        }
    }
    async calculateAvailableStorage(sandboxInfo) {
        const availableDataMB = sandboxInfo.dataStorageLimit - (sandboxInfo.currentDataUsage || 0);
        const availableFileMB = sandboxInfo.fileStorageLimit - (sandboxInfo.currentFileUsage || 0);
        const totalUsed = (sandboxInfo.currentDataUsage || 0) + (sandboxInfo.currentFileUsage || 0);
        const totalLimit = sandboxInfo.dataStorageLimit + sandboxInfo.fileStorageLimit;
        const usagePercentage = (totalUsed / totalLimit) * 100;
        return {
            availableDataMB,
            availableFileMB,
            usagePercentage
        };
    }
    async estimateRecordCapacity(sandboxInfo, avgRecordSizeKB = 2) {
        const storage = await this.calculateAvailableStorage(sandboxInfo);
        const avgRecordSizeMB = avgRecordSizeKB / 1024;
        // Calculate theoretical maximum based on available storage
        const theoreticalMax = Math.floor(storage.availableDataMB / avgRecordSizeMB);
        // Apply sandbox-specific limits
        let maxRecords = theoreticalMax;
        if (sandboxInfo.recordLimit) {
            maxRecords = Math.min(maxRecords, sandboxInfo.recordLimit);
        }
        // Recommended is 80% of max to leave headroom
        const recommendedRecords = Math.floor(maxRecords * 0.8);
        // Warning threshold at 90%
        const warningThreshold = Math.floor(maxRecords * 0.9);
        return {
            maxRecords,
            recommendedRecords,
            warningThreshold
        };
    }
    async validateStorageBeforeGeneration(sandboxInfo, estimatedRecords, avgRecordSizeKB = 2) {
        const warnings = [];
        const errors = [];
        const capacity = await this.estimateRecordCapacity(sandboxInfo, avgRecordSizeKB);
        const storage = await this.calculateAvailableStorage(sandboxInfo);
        // Check if we exceed maximum capacity
        if (estimatedRecords > capacity.maxRecords) {
            errors.push(`Estimated ${estimatedRecords} records exceeds maximum capacity of ${capacity.maxRecords} records`);
        }
        // Check if we exceed recommended capacity
        if (estimatedRecords > capacity.recommendedRecords) {
            warnings.push(`Estimated ${estimatedRecords} records exceeds recommended capacity of ${capacity.recommendedRecords} records`);
        }
        // Check storage usage
        if (storage.usagePercentage > 90) {
            warnings.push(`Current storage usage is ${storage.usagePercentage.toFixed(1)}% - consider cleaning up before adding more data`);
        }
        // Check for Partial Copy record limits
        if (sandboxInfo.recordLimit && estimatedRecords > sandboxInfo.recordLimit) {
            errors.push(`Partial Copy sandboxes are limited to ${sandboxInfo.recordLimit} records per object`);
        }
        return {
            canProceed: errors.length === 0,
            warnings,
            errors
        };
    }
    getRecommendedObjectCounts(sandboxInfo, objectCount) {
        // Distribute records based on sandbox type
        const baseRecordsPerObject = this.getBaseRecordsPerObject(sandboxInfo);
        const distribution = {};
        // Common distribution ratios for different object types
        const objectRatios = {
            'Account': 1.0,
            'Contact': 2.5, // Usually 2-3 contacts per account
            'Lead': 1.5,
            'Opportunity': 0.8,
            'Case': 1.2,
            'Campaign': 0.3,
            'Task': 3.0,
            'Event': 1.0
        };
        Object.keys(objectRatios).forEach(objectName => {
            const ratio = objectRatios[objectName];
            distribution[objectName] = Math.floor(baseRecordsPerObject * ratio);
        });
        return distribution;
    }
    getBaseRecordsPerObject(sandboxInfo) {
        switch (sandboxInfo.type) {
            case 'Developer':
                return 50;
            case 'Developer Pro':
                return 200;
            case 'Partial Copy':
                return 1000;
            case 'Full':
                return 5000;
            default:
                return 100;
        }
    }
}
exports.SandboxService = SandboxService;
//# sourceMappingURL=sandbox-detector.js.map