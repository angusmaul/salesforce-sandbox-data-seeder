import * as jsforce from 'jsforce';
import { SalesforceConnection, SalesforceCredentials } from '../models/salesforce';
export declare class SalesforceService {
    private connection;
    private connectionInfo;
    constructor();
    setAccessToken(accessToken: string, instanceUrl: string): Promise<SalesforceConnection>;
    authenticate(credentials: SalesforceCredentials): Promise<SalesforceConnection>;
    private authenticateClientCredentials;
    private authenticateUsernamePassword;
    getConnection(): jsforce.Connection;
    getConnectionInfo(): SalesforceConnection;
    query<T = any>(soql: string): Promise<T[]>;
    queryMore<T = any>(locator: string): Promise<{
        records: T[];
        done: boolean;
        nextRecordsUrl?: string;
    }>;
    describeSObject(objectName: string): Promise<jsforce.DescribeSObjectResult>;
    describeGlobal(): Promise<jsforce.DescribeGlobalResult>;
    getLimits(): Promise<any>;
    getOrganization(): Promise<any>;
    getBulk(): Promise<any>;
    isConnected(): boolean;
    disconnect(): void;
}
//# sourceMappingURL=salesforce.d.ts.map