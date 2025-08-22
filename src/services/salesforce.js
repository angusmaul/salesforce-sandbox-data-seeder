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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesforceService = void 0;
const jsforce = __importStar(require("jsforce"));
const chalk_1 = __importDefault(require("chalk"));
class SalesforceService {
    constructor() {
        this.connection = null;
        this.connectionInfo = null;
    }
    async setAccessToken(accessToken, instanceUrl) {
        try {
            // Create JSforce connection with the provided token
            this.connection = new jsforce.Connection({
                instanceUrl: instanceUrl,
                accessToken: accessToken,
                version: '59.0'
            });
            // Store connection info
            this.connectionInfo = {
                instanceUrl: instanceUrl,
                accessToken: accessToken,
                apiVersion: '59.0'
            };
            // Verify connection by getting user info
            await this.connection.identity();
            console.log(chalk_1.default.green(`✅ Successfully connected with provided token to ${instanceUrl}`));
            return this.connectionInfo;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error with access token';
            throw new Error(`Token validation failed: ${errorMessage}`);
        }
    }
    async authenticate(credentials) {
        try {
            // Always use Client Credentials flow when clientId and clientSecret are provided
            if (credentials.clientId && credentials.clientSecret) {
                return await this.authenticateClientCredentials(credentials);
            }
            else if (credentials.username) {
                return await this.authenticateUsernamePassword(credentials);
            }
            else {
                throw new Error('Either clientId/clientSecret or username credentials must be provided');
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
            throw new Error(`Authentication failed: ${errorMessage}`);
        }
    }
    async authenticateClientCredentials(credentials) {
        // Use the instance URL provided in loginUrl for Developer Edition orgs
        const baseUrl = credentials.loginUrl || 'https://login.salesforce.com';
        const tokenUrl = `${baseUrl}/services/oauth2/token`;
        console.log(chalk_1.default.yellow(`Attempting client credentials authentication to: ${tokenUrl}`));
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', credentials.clientId);
        params.append('client_secret', credentials.clientSecret);
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });
        if (!response.ok) {
            const errorData = await response.text();
            console.error(chalk_1.default.red(`OAuth request failed:`));
            console.error(chalk_1.default.red(`  URL: ${tokenUrl}`));
            console.error(chalk_1.default.red(`  Status: ${response.status}`));
            console.error(chalk_1.default.red(`  Response: ${errorData}`));
            throw new Error(`OAuth error: ${response.status} - ${errorData}`);
        }
        const tokenData = await response.json();
        console.log(chalk_1.default.green(`✅ Received OAuth token from: ${tokenData.instance_url || 'unknown'}`));
        // Create JSforce connection with the token
        this.connection = new jsforce.Connection({
            instanceUrl: tokenData.instance_url,
            accessToken: tokenData.access_token,
            version: '59.0'
        });
        // Store connection info
        this.connectionInfo = {
            instanceUrl: tokenData.instance_url,
            accessToken: tokenData.access_token,
            apiVersion: '59.0'
        };
        // Verify connection by getting user info
        await this.connection.identity();
        console.log(chalk_1.default.green(`✅ Successfully authenticated with ${this.connectionInfo.instanceUrl}`));
        return this.connectionInfo;
    }
    async authenticateUsernamePassword(credentials) {
        // Use JSforce's built-in username-password flow for testing
        this.connection = new jsforce.Connection({
            loginUrl: credentials.loginUrl,
            version: '59.0'
        });
        // For testing, we'll use a simple login (requires username + password + security token)
        // This is less secure but works for testing with Trailhead orgs
        console.log(chalk_1.default.yellow('Using username-password flow for testing...'));
        // This would need password + security token, but for now let's use the connection as-is
        // and try to connect with the Client ID/Secret through JSforce's OAuth2
        this.connection = new jsforce.Connection({
            oauth2: {
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret,
                loginUrl: credentials.loginUrl
            },
            version: '59.0'
        });
        // Store dummy connection info for now
        this.connectionInfo = {
            instanceUrl: credentials.loginUrl,
            accessToken: 'test_token',
            apiVersion: '59.0'
        };
        // Verify connection by getting user info
        await this.connection.identity();
        console.log(chalk_1.default.green(`✅ Successfully authenticated with ${this.connectionInfo.instanceUrl}`));
        return this.connectionInfo;
    }
    getConnection() {
        if (!this.connection) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        return this.connection;
    }
    getConnectionInfo() {
        if (!this.connectionInfo) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        return this.connectionInfo;
    }
    async query(soql) {
        const connection = this.getConnection();
        const result = await connection.query(soql);
        return result.records;
    }
    async queryMore(locator) {
        const connection = this.getConnection();
        const result = await connection.queryMore(locator);
        return {
            records: result.records,
            done: result.done,
            nextRecordsUrl: result.nextRecordsUrl
        };
    }
    async describeSObject(objectName) {
        const connection = this.getConnection();
        return await connection.describe(objectName);
    }
    async describeGlobal() {
        const connection = this.getConnection();
        return await connection.describeGlobal();
    }
    async getLimits() {
        const connection = this.getConnection();
        return await connection.request('/services/data/v59.0/limits');
    }
    async getOrganization() {
        const connection = this.getConnection();
        const result = await this.query('SELECT Id, Name, OrganizationType, IsSandbox FROM Organization LIMIT 1');
        return result[0];
    }
    async getBulk() {
        const connection = this.getConnection();
        return connection.bulk;
    }
    isConnected() {
        return this.connection !== null && this.connectionInfo !== null;
    }
    disconnect() {
        this.connection = null;
        this.connectionInfo = null;
    }
}
exports.SalesforceService = SalesforceService;
//# sourceMappingURL=salesforce.js.map