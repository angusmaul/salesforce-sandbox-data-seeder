import { SalesforceService } from './salesforce';
import { DataGenerationService, GenerationPlan } from '../generators/data-generator';
import { ObjectDiscoveryService } from './object-discovery';
import { SeedResult } from '../models/salesforce';
import { LoadLoggerService, LoadRecord } from './load-logger';
import chalk from 'chalk';
import ora from 'ora';

export class DataLoadService {
  private generationService: DataGenerationService;
  private discoveryService: ObjectDiscoveryService;
  private logger: LoadLoggerService;

  constructor(private salesforceService: SalesforceService, logDirectory?: string) {
    this.generationService = new DataGenerationService();
    this.discoveryService = new ObjectDiscoveryService(salesforceService);
    this.logger = new LoadLoggerService(logDirectory);
  }

  async executeGenerationPlan(plans: GenerationPlan[]): Promise<SeedResult[]> {
    const results: SeedResult[] = [];
    
    console.log(chalk.blue(`\n🚀 Executing data generation plan for ${plans.length} objects...`));
    
    // Start logging session
    const sessionId = await this.logger.startSession(plans);
    console.log(chalk.gray(`📝 Logging to session: ${sessionId}`));
    
    // Clear any previous reference data
    this.generationService.clearReferenceStore();
    
    for (const plan of plans) {
      const startTime = Date.now();
      const spinner = ora(`Generating data for ${plan.objectName}...`).start();
      
      try {
        // Get object metadata if not provided
        let objectMeta: any;
        if (plan.fields.length === 0) {
          objectMeta = await this.discoveryService.describeObject(plan.objectName, true);
        } else {
          // If fields are provided, we still need the full object metadata for RecordType info
          objectMeta = await this.discoveryService.describeObject(plan.objectName, true);
        }
        
        spinner.text = `Generating ${plan.recordCount} records for ${plan.objectName}...`;
        
        // Generate records
        const records = this.generationService.generateRecords(
          objectMeta,
          plan.recordCount
        );
        
        // For objects with reference fields, regenerate them with actual IDs from reference store
        const hasReferenceFields = objectMeta.fields.some((field: any) => field.type === 'reference');
        if (hasReferenceFields) {
          this.generationService.updateReferenceFields(records, objectMeta, plan.objectName);
        }
        
        spinner.text = `Loading ${records.length} records into ${plan.objectName}...`;
        
        // Load records using REST API
        const loadResult = await this.restInsert(plan.objectName, records);
        
        const timeTaken = Date.now() - startTime;
        
        // Update reference store with actual Salesforce IDs for successful records
        if (loadResult.successfulRecords.length > 0) {
          this.generationService.updateReferenceStoreWithSalesforceIds(plan.objectName, loadResult.successfulRecords);
        }

        // Log the detailed results
        await this.logger.logObjectResult(
          plan.objectName,
          plan.recordCount,
          records,
          loadResult.successfulRecords,
          loadResult.failedRecords,
          timeTaken
        );
        
        const result: SeedResult = {
          objectName: plan.objectName,
          recordsCreated: loadResult.successCount,
          recordsFailed: loadResult.failureCount,
          errors: loadResult.errors,
          timeTaken
        };
        
        results.push(result);
        
        if (loadResult.failureCount > 0) {
          spinner.warn(`⚠️  ${plan.objectName}: ${loadResult.successCount} created, ${loadResult.failureCount} failed`);
          if (loadResult.errors.length > 0) {
            console.log(chalk.yellow('  Errors:'));
            loadResult.errors.slice(0, 3).forEach(error => {
              console.log(chalk.yellow(`    - ${error}`));
            });
            if (loadResult.errors.length > 3) {
              console.log(chalk.yellow(`    ... and ${loadResult.errors.length - 3} more errors`));
            }
          }
        } else {
          spinner.succeed(`✅ ${plan.objectName}: ${loadResult.successCount} records created in ${(timeTaken / 1000).toFixed(1)}s`);
        }
        
      } catch (error) {
        const timeTaken = Date.now() - startTime;
        spinner.fail(`❌ Failed to process ${plan.objectName}`);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(chalk.red(`  Error: ${errorMessage}`));
        
        // Log the error case (no generated records available)
        await this.logger.logObjectResult(
          plan.objectName,
          plan.recordCount,
          [], // No records generated due to error
          [], // No successful records
          Array.from({ length: plan.recordCount }, (_, index) => ({
            recordIndex: index + 1,
            recordData: {},
            result: 'failure',
            error: errorMessage
          })),
          timeTaken
        );
        
        results.push({
          objectName: plan.objectName,
          recordsCreated: 0,
          recordsFailed: plan.recordCount,
          errors: [errorMessage],
          timeTaken
        });
      }
    }
    
    // End logging session and save log file
    try {
      const logFilePath = await this.logger.endSession();
      console.log(chalk.green(`📝 Load log saved to: ${logFilePath}`));
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to save load log: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
    
    return results;
  }

  private async restInsert(objectName: string, records: any[]): Promise<{
    successCount: number;
    failureCount: number;
    errors: string[];
    successfulRecords: LoadRecord[];
    failedRecords: LoadRecord[];
  }> {
    try {
      const connection = this.salesforceService.getConnection();
      
      console.log(`    Inserting ${records.length} ${objectName} records using REST API...`);
      
      let successCount = 0;
      let failureCount = 0;
      const errors: string[] = [];
      const successfulRecords: LoadRecord[] = [];
      const failedRecords: LoadRecord[] = [];
      
      // Insert records one by one using standard REST API
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          console.log(`    Inserting record ${i + 1}/${records.length}...`);
          
          const result = await connection.sobject(objectName).create(record);
          
          // Handle single result (not array)
          const singleResult = Array.isArray(result) ? result[0] : result;
          
          if (singleResult.success) {
            successCount++;
            console.log(`    ✅ Record ${i + 1} created with ID: ${singleResult.id}`);
            successfulRecords.push({
              recordIndex: i + 1,
              recordData: record,
              result: 'success',
              recordId: singleResult.id
            });
          } else {
            failureCount++;
            const errorMsg = singleResult.errors ? singleResult.errors.map((e: any) => e.message).join('; ') : 'Unknown error';
            errors.push(`Record ${i + 1}: ${errorMsg}`);
            console.log(`    ❌ Record ${i + 1} failed: ${errorMsg}`);
            failedRecords.push({
              recordIndex: i + 1,
              recordData: record,
              result: 'failure',
              error: errorMsg
            });
          }
        } catch (error) {
          failureCount++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Record ${i + 1}: ${errorMsg}`);
          console.log(`    ❌ Record ${i + 1} failed: ${errorMsg}`);
          failedRecords.push({
            recordIndex: i + 1,
            recordData: record,
            result: 'failure',
            error: errorMsg
          });
        }
      }
      
      console.log(`    Final results: ${successCount} successful, ${failureCount} failed`);
      
      return {
        successCount,
        failureCount,
        errors: errors.slice(0, 10), // Limit to first 10 errors
        successfulRecords,
        failedRecords
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown REST API error';
      console.log(`    REST API error: ${errorMessage}`);
      const allFailedRecords: LoadRecord[] = records.map((record, index) => ({
        recordIndex: index + 1,
        recordData: record,
        result: 'failure',
        error: errorMessage
      }));
      
      return {
        successCount: 0,
        failureCount: records.length,
        errors: [errorMessage],
        successfulRecords: [],
        failedRecords: allFailedRecords
      };
    }
  }



  async validateRecords(objectName: string, records: any[]): Promise<{
    valid: any[];
    invalid: any[];
    warnings: string[];
  }> {
    const valid: any[] = [];
    const invalid: any[] = [];
    const warnings: string[] = [];
    
    try {
      // Get object metadata for validation
      const objectMeta = await this.discoveryService.describeObject(objectName, true);
      const requiredFields = objectMeta.fields.filter(f => f.required && !f.defaultValue);
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        let isValid = true;
        
        // Check required fields
        for (const requiredField of requiredFields) {
          if (!record[requiredField.name] || record[requiredField.name] === '') {
            warnings.push(`Record ${i + 1}: Missing required field '${requiredField.name}'`);
            isValid = false;
          }
        }
        
        // Check field lengths
        for (const field of objectMeta.fields) {
          if (field.length && record[field.name]) {
            const value = String(record[field.name]);
            if (value.length > field.length) {
              warnings.push(`Record ${i + 1}: Field '${field.name}' exceeds maximum length of ${field.length}`);
              isValid = false;
            }
          }
        }
        
        if (isValid) {
          valid.push(record);
        } else {
          invalid.push(record);
        }
      }
      
    } catch (error) {
      warnings.push(`Validation error: ${error instanceof Error ? error.message : error}`);
      // If validation fails, assume all records are valid
      valid.push(...records);
    }
    
    return { valid, invalid, warnings };
  }

  async estimateDataSize(records: any[]): Promise<{
    totalSizeKB: number;
    avgRecordSizeKB: number;
    estimatedStorageMB: number;
  }> {
    if (records.length === 0) {
      return { totalSizeKB: 0, avgRecordSizeKB: 0, estimatedStorageMB: 0 };
    }
    
    // Sample first 100 records to estimate size
    const sample = records.slice(0, Math.min(100, records.length));
    let totalBytes = 0;
    
    sample.forEach(record => {
      const jsonSize = JSON.stringify(record).length;
      totalBytes += jsonSize;
    });
    
    const avgRecordSizeKB = (totalBytes / sample.length) / 1024;
    const totalSizeKB = (avgRecordSizeKB * records.length);
    const estimatedStorageMB = totalSizeKB / 1024;
    
    return {
      totalSizeKB,
      avgRecordSizeKB,
      estimatedStorageMB
    };
  }
}