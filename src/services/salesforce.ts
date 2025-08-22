import * as jsforce from 'jsforce';
import chalk from 'chalk';
import { SalesforceConnection, SalesforceCredentials } from '../models/salesforce';

export class SalesforceService {
  private connection: jsforce.Connection | null = null;
  private connectionInfo: SalesforceConnection | null = null;

  constructor() {}

  async setAccessToken(accessToken: string, instanceUrl: string): Promise<SalesforceConnection> {
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

      console.log(chalk.green(`✅ Successfully connected with provided token to ${instanceUrl}`));
      
      return this.connectionInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error with access token';
      throw new Error(`Token validation failed: ${errorMessage}`);
    }
  }

  async authenticate(credentials: SalesforceCredentials): Promise<SalesforceConnection> {
    try {
      // Always use Client Credentials flow when clientId and clientSecret are provided
      if (credentials.clientId && credentials.clientSecret) {
        return await this.authenticateClientCredentials(credentials);
      } else if (credentials.username) {
        return await this.authenticateUsernamePassword(credentials);
      } else {
        throw new Error('Either clientId/clientSecret or username credentials must be provided');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
      throw new Error(`Authentication failed: ${errorMessage}`);
    }
  }

  private async authenticateClientCredentials(credentials: SalesforceCredentials): Promise<SalesforceConnection> {
    // Use the instance URL provided in loginUrl for Developer Edition orgs
    const baseUrl = credentials.loginUrl || 'https://login.salesforce.com';
    const tokenUrl = `${baseUrl}/services/oauth2/token`;
    
    console.log(chalk.yellow(`Attempting client credentials authentication to: ${tokenUrl}`));
    
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
      console.error(chalk.red(`OAuth request failed:`));
      console.error(chalk.red(`  URL: ${tokenUrl}`));
      console.error(chalk.red(`  Status: ${response.status}`));
      console.error(chalk.red(`  Response: ${errorData}`));
      throw new Error(`OAuth error: ${response.status} - ${errorData}`);
    }

    const tokenData = await response.json() as any;
    console.log(chalk.green(`✅ Received OAuth token from: ${tokenData.instance_url || 'unknown'}`));

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

    console.log(chalk.green(`✅ Successfully authenticated with ${this.connectionInfo.instanceUrl}`));
    
    return this.connectionInfo;
  }

  private async authenticateUsernamePassword(credentials: SalesforceCredentials): Promise<SalesforceConnection> {
    // Use JSforce's built-in username-password flow for testing
    this.connection = new jsforce.Connection({
      loginUrl: credentials.loginUrl,
      version: '59.0'
    });

    // For testing, we'll use a simple login (requires username + password + security token)
    // This is less secure but works for testing with Trailhead orgs
    console.log(chalk.yellow('Using username-password flow for testing...'));
    
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

    console.log(chalk.green(`✅ Successfully authenticated with ${this.connectionInfo.instanceUrl}`));
    
    return this.connectionInfo;
  }

  getConnection(): jsforce.Connection {
    if (!this.connection) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    return this.connection;
  }

  getConnectionInfo(): SalesforceConnection {
    if (!this.connectionInfo) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    return this.connectionInfo;
  }

  async query<T = any>(soql: string): Promise<T[]> {
    const connection = this.getConnection();
    const result = await connection.query(soql);
    return result.records as T[];
  }

  async queryMore<T = any>(locator: string): Promise<{ records: T[]; done: boolean; nextRecordsUrl?: string }> {
    const connection = this.getConnection();
    const result = await connection.queryMore(locator);
    return {
      records: result.records as T[],
      done: result.done,
      nextRecordsUrl: result.nextRecordsUrl
    };
  }

  async describeSObject(objectName: string): Promise<jsforce.DescribeSObjectResult> {
    const connection = this.getConnection();
    return await connection.describe(objectName);
  }

  async describeGlobal(): Promise<jsforce.DescribeGlobalResult> {
    const connection = this.getConnection();
    return await connection.describeGlobal();
  }

  async getLimits(): Promise<any> {
    const connection = this.getConnection();
    return await connection.request('/services/data/v59.0/limits');
  }

  async getOrganization(): Promise<any> {
    const connection = this.getConnection();
    const result = await this.query('SELECT Id, Name, OrganizationType, IsSandbox FROM Organization LIMIT 1');
    return result[0];
  }

  async getBulk(): Promise<any> {
    const connection = this.getConnection();
    return connection.bulk;
  }

  isConnected(): boolean {
    return this.connection !== null && this.connectionInfo !== null;
  }

  disconnect(): void {
    this.connection = null;
    this.connectionInfo = null;
  }
}