import { SalesforceService } from './salesforce';
import { SalesforceObject, ObjectDependency } from '../models/salesforce';
export declare class ObjectDiscoveryService {
    private salesforceService;
    constructor(salesforceService: SalesforceService);
    discoverObjects(includeFields?: boolean): Promise<SalesforceObject[]>;
    describeObject(objectName: string, includeFields?: boolean): Promise<SalesforceObject>;
    private mapField;
    analyzeDependencies(objects: SalesforceObject[]): Promise<ObjectDependency[]>;
    getObjectsWithFields(objectNames: string[]): Promise<SalesforceObject[]>;
    sortObjectsByDependencies(objects: SalesforceObject[], dependencies: ObjectDependency[]): string[];
    private isSystemObject;
    categorizeObjects(objects: SalesforceObject[]): {
        standard: SalesforceObject[];
        custom: SalesforceObject[];
        managed: SalesforceObject[];
    };
}
//# sourceMappingURL=object-discovery.d.ts.map