import { SalesforceService } from './salesforce';
import { SalesforceObject, SalesforceField, PicklistValue, ObjectDependency } from '../models/salesforce';
import chalk from 'chalk';
import ora from 'ora';

export class ObjectDiscoveryService {
  constructor(private salesforceService: SalesforceService) {}

  async discoverObjects(includeFields: boolean = true): Promise<SalesforceObject[]> {
    const spinner = ora('Discovering Salesforce objects...').start();
    
    try {
      // Get global describe to list all objects
      const globalDescribe = await this.salesforceService.describeGlobal();
      
      spinner.text = `Found ${globalDescribe.sobjects.length} objects, analyzing...`;
      
      const objects: SalesforceObject[] = [];
      
      // Filter to relevant objects (exclude system objects we don't want to seed)
      const relevantObjects = globalDescribe.sobjects.filter((obj: any) => 
        obj.createable && 
        obj.queryable && 
        !this.isSystemObject(obj.name)
      );
      
      spinner.text = `Processing ${relevantObjects.length} relevant objects...`;
      
      // Process objects in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < relevantObjects.length; i += batchSize) {
        const batch = relevantObjects.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (objInfo: any) => {
          try {
            const objectDetail = await this.describeObject(objInfo.name, includeFields);
            return objectDetail;
          } catch (error) {
            console.warn(chalk.yellow(`⚠️  Failed to describe ${objInfo.name}: ${error instanceof Error ? error.message : error}`));
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        objects.push(...batchResults.filter((obj: any) => obj !== null) as SalesforceObject[]);
        
        spinner.text = `Processed ${Math.min(i + batchSize, relevantObjects.length)}/${relevantObjects.length} objects...`;
      }
      
      spinner.succeed(`✅ Discovered ${objects.length} objects`);
      return objects;
      
    } catch (error) {
      spinner.fail('Failed to discover objects');
      throw error;
    }
  }

  async describeObject(objectName: string, includeFields: boolean = true): Promise<SalesforceObject> {
    const describe = await this.salesforceService.describeSObject(objectName);
    
    const salesforceObject: SalesforceObject = {
      name: describe.name,
      apiName: describe.name,
      label: describe.label,
      labelPlural: describe.labelPlural,
      keyPrefix: describe.keyPrefix || undefined,
      custom: describe.custom,
      createable: describe.createable,
      updateable: describe.updateable,
      deletable: describe.deletable,
      queryable: describe.queryable,
      fields: [],
      childRelationships: describe.childRelationships.map((rel: any) => ({
        field: rel.field,
        childSObject: rel.childSObject,
        relationshipName: rel.relationshipName
      }))
    };

    if (describe.recordTypeInfos && describe.recordTypeInfos.length > 0) {
      salesforceObject.recordTypeInfos = describe.recordTypeInfos.map((rt: any) => ({
        recordTypeId: rt.recordTypeId,
        name: rt.name,
        developerName: rt.developerName,
        active: rt.active,
        defaultRecordTypeMapping: rt.defaultRecordTypeMapping
      }));
    }

    if (includeFields) {
      salesforceObject.fields = describe.fields.map((field: any) => this.mapField(field));
    }

    return salesforceObject;
  }

  private mapField(field: any): SalesforceField {
    const salesforceField: SalesforceField = {
      name: field.name,
      apiName: field.name,
      type: field.type,
      label: field.label,
      length: field.length,
      precision: field.precision,
      scale: field.scale,
      required: !field.nillable && !field.defaultedOnCreate,
      unique: field.unique,
      createable: field.createable,
      updateable: field.updateable,
      calculated: field.calculated,
      autoNumber: field.autoNumber
    };

    if (field.referenceTo && field.referenceTo.length > 0) {
      salesforceField.referenceTo = field.referenceTo;
      salesforceField.relationshipName = field.relationshipName;
    }

    if (field.picklistValues && field.picklistValues.length > 0) {
      salesforceField.picklistValues = field.picklistValues.map((pv: any) => ({
        label: pv.label,
        value: pv.value,
        active: pv.active,
        defaultValue: pv.defaultValue
      } as PicklistValue));
    }

    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      salesforceField.defaultValue = field.defaultValue;
    }

    return salesforceField;
  }

  async analyzeDependencies(objects: SalesforceObject[]): Promise<ObjectDependency[]> {
    const dependencies: ObjectDependency[] = [];
    
    for (const obj of objects) {
      const objDependency: ObjectDependency = {
        objectName: obj.name,
        dependsOn: [],
        dependentFields: []
      };

      // Find lookup/master-detail relationships
      for (const field of obj.fields) {
        if (field.referenceTo && field.referenceTo.length > 0) {
          for (const referencedObject of field.referenceTo) {
            // Only include dependencies on objects we're working with
            if (objects.some(o => o.name === referencedObject)) {
              if (!objDependency.dependsOn.includes(referencedObject)) {
                objDependency.dependsOn.push(referencedObject);
              }
              objDependency.dependentFields.push(field.name);
            }
          }
        }
      }

      dependencies.push(objDependency);
    }

    return dependencies;
  }

  async getObjectsWithFields(objectNames: string[]): Promise<SalesforceObject[]> {
    const objects: SalesforceObject[] = [];
    
    for (const objectName of objectNames) {
      try {
        const object = await this.describeObject(objectName, true);
        objects.push(object);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Skipping ${objectName}: ${error instanceof Error ? error.message : error}`));
      }
    }
    
    return objects;
  }

  sortObjectsByDependencies(objects: SalesforceObject[], dependencies: ObjectDependency[]): string[] {
    const sorted: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    
    const visit = (objectName: string) => {
      if (visited.has(objectName)) return;
      if (visiting.has(objectName)) {
        // Circular dependency detected - just add it
        console.warn(chalk.yellow(`⚠️  Circular dependency detected for ${objectName}`));
        return;
      }
      
      visiting.add(objectName);
      
      const dependency = dependencies.find(d => d.objectName === objectName);
      if (dependency) {
        for (const dep of dependency.dependsOn) {
          visit(dep);
        }
      }
      
      visiting.delete(objectName);
      visited.add(objectName);
      sorted.push(objectName);
    };
    
    // Visit all objects
    for (const obj of objects) {
      visit(obj.name);
    }
    
    return sorted;
  }

  private isSystemObject(objectName: string): boolean {
    // Filter out system objects that we typically don't want to seed
    const systemPatterns = [
      /.*History$/,
      /.*Share$/,
      /.*Feed$/,
      /.*Tag$/,
      /.*Event$/i,
      /.*ChangeEvent$/,
      /.*__Tag$/,
      /^FieldSecurityClassification$/,
      /^SetupAuditTrail$/,
      /^LoginHistory$/,
      /^ApexLog$/,
      /^FlowInterview$/,
      /^AsyncApexJob$/,
      /^CronTrigger$/,
      /^DatacloudPurchaseUsage$/,
      /^Organization$/,
      /^Profile$/,
      /^User$/,
      /^Group$/,
      /^Permission/,
      /^Setup/,
      /^Apex/,
      /^Flow/,
      /^Dashboard/,
      /^Report/,
      /^Folder/,
      /^Document/,
      /^ContentDocument/,
      /^ContentVersion/,
      /^Attachment$/,
      /^EmailMessage$/,
      /^ProcessInstance/,
      /^Workflow/
    ];
    
    return systemPatterns.some(pattern => pattern.test(objectName));
  }

  categorizeObjects(objects: SalesforceObject[]): {
    standard: SalesforceObject[];
    custom: SalesforceObject[];
    managed: SalesforceObject[];
  } {
    const standard: SalesforceObject[] = [];
    const custom: SalesforceObject[] = [];
    const managed: SalesforceObject[] = [];
    
    for (const obj of objects) {
      if (obj.custom) {
        if (obj.name.includes('__')) {
          // Check if it's a managed package object (has namespace)
          const parts = obj.name.split('__');
          if (parts.length > 2) {
            managed.push(obj);
          } else {
            custom.push(obj);
          }
        } else {
          custom.push(obj);
        }
      } else {
        standard.push(obj);
      }
    }
    
    return { standard, custom, managed };
  }
}