"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectDiscoveryService = void 0;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
class ObjectDiscoveryService {
    constructor(salesforceService) {
        this.salesforceService = salesforceService;
    }
    async discoverObjects(includeFields = true) {
        const spinner = (0, ora_1.default)('Discovering Salesforce objects...').start();
        try {
            // Get global describe to list all objects
            const globalDescribe = await this.salesforceService.describeGlobal();
            spinner.text = `Found ${globalDescribe.sobjects.length} objects, analyzing...`;
            const objects = [];
            // Filter to relevant objects (exclude system objects we don't want to seed)
            const relevantObjects = globalDescribe.sobjects.filter((obj) => obj.createable &&
                obj.queryable &&
                !this.isSystemObject(obj.name));
            spinner.text = `Processing ${relevantObjects.length} relevant objects...`;
            // Process objects in batches to avoid overwhelming the API
            const batchSize = 10;
            for (let i = 0; i < relevantObjects.length; i += batchSize) {
                const batch = relevantObjects.slice(i, i + batchSize);
                const batchPromises = batch.map(async (objInfo) => {
                    try {
                        const objectDetail = await this.describeObject(objInfo.name, includeFields);
                        return objectDetail;
                    }
                    catch (error) {
                        console.warn(chalk_1.default.yellow(`⚠️  Failed to describe ${objInfo.name}: ${error instanceof Error ? error.message : error}`));
                        return null;
                    }
                });
                const batchResults = await Promise.all(batchPromises);
                objects.push(...batchResults.filter((obj) => obj !== null));
                spinner.text = `Processed ${Math.min(i + batchSize, relevantObjects.length)}/${relevantObjects.length} objects...`;
            }
            spinner.succeed(`✅ Discovered ${objects.length} objects`);
            return objects;
        }
        catch (error) {
            spinner.fail('Failed to discover objects');
            throw error;
        }
    }
    async describeObject(objectName, includeFields = true) {
        const describe = await this.salesforceService.describeSObject(objectName);
        const salesforceObject = {
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
            childRelationships: describe.childRelationships.map((rel) => ({
                field: rel.field,
                childSObject: rel.childSObject,
                relationshipName: rel.relationshipName
            }))
        };
        if (describe.recordTypeInfos && describe.recordTypeInfos.length > 0) {
            salesforceObject.recordTypeInfos = describe.recordTypeInfos.map((rt) => ({
                recordTypeId: rt.recordTypeId,
                name: rt.name,
                developerName: rt.developerName,
                active: rt.active,
                defaultRecordTypeMapping: rt.defaultRecordTypeMapping
            }));
        }
        if (includeFields) {
            salesforceObject.fields = describe.fields.map((field) => this.mapField(field));
        }
        return salesforceObject;
    }
    mapField(field) {
        const salesforceField = {
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
            salesforceField.picklistValues = field.picklistValues.map((pv) => ({
                label: pv.label,
                value: pv.value,
                active: pv.active,
                defaultValue: pv.defaultValue
            }));
        }
        if (field.defaultValue !== null && field.defaultValue !== undefined) {
            salesforceField.defaultValue = field.defaultValue;
        }
        return salesforceField;
    }
    async analyzeDependencies(objects) {
        const dependencies = [];
        for (const obj of objects) {
            const objDependency = {
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
    async getObjectsWithFields(objectNames) {
        const objects = [];
        for (const objectName of objectNames) {
            try {
                const object = await this.describeObject(objectName, true);
                objects.push(object);
            }
            catch (error) {
                console.warn(chalk_1.default.yellow(`⚠️  Skipping ${objectName}: ${error instanceof Error ? error.message : error}`));
            }
        }
        return objects;
    }
    sortObjectsByDependencies(objects, dependencies) {
        const sorted = [];
        const visiting = new Set();
        const visited = new Set();
        const visit = (objectName) => {
            if (visited.has(objectName))
                return;
            if (visiting.has(objectName)) {
                // Circular dependency detected - just add it
                console.warn(chalk_1.default.yellow(`⚠️  Circular dependency detected for ${objectName}`));
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
    isSystemObject(objectName) {
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
    categorizeObjects(objects) {
        const standard = [];
        const custom = [];
        const managed = [];
        for (const obj of objects) {
            if (obj.custom) {
                if (obj.name.includes('__')) {
                    // Check if it's a managed package object (has namespace)
                    const parts = obj.name.split('__');
                    if (parts.length > 2) {
                        managed.push(obj);
                    }
                    else {
                        custom.push(obj);
                    }
                }
                else {
                    custom.push(obj);
                }
            }
            else {
                standard.push(obj);
            }
        }
        return { standard, custom, managed };
    }
}
exports.ObjectDiscoveryService = ObjectDiscoveryService;
//# sourceMappingURL=object-discovery.js.map