import Conf from 'conf';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppConfig, ObjectSelectionPreset, SessionConfig } from '../models/config';
import chalk from 'chalk';

export class ConfigService {
  private config: Conf<any>;
  private sessionConfig: Conf<any>;

  constructor() {
    this.config = new Conf({
      projectName: 'salesforce-sandbox-data-seeder',
      schema: {
        salesforce: {
          type: 'object',
          properties: {
            loginUrl: { type: 'string', default: 'https://test.salesforce.com' },
            apiVersion: { type: 'string', default: '59.0' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            username: { type: 'string' }
          }
        },
        generation: {
          type: 'object',
          properties: {
            defaultRecordsPerObject: { type: 'number', default: 100 },
            maxTotalRecords: { type: 'number', default: 10000 },
            respectStorageLimits: { type: 'boolean', default: true },
            generateRelationships: { type: 'boolean', default: true },
            faker: {
              type: 'object',
              properties: {
                locale: { type: 'string', default: 'en' },
                seed: { type: 'number' }
              }
            }
          }
        },
        objectSelection: {
          type: 'object',
          properties: {
            includePatterns: { type: 'array', default: [] },
            excludePatterns: { type: 'array', default: ['*History', '*Share', '*Feed'] },
            includedObjects: { type: 'array', default: [] },
            excludedObjects: { type: 'array', default: [] }
          }
        }
      }
    });

    this.sessionConfig = new Conf({
      projectName: 'salesforce-sandbox-data-seeder',
      configName: 'session'
    });
  }

  async get(key: string): Promise<any> {
    return this.config.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.config.set(key, value);
  }

  async getAll(): Promise<AppConfig> {
    return {
      salesforce: this.config.get('salesforce') as any,
      generation: this.config.get('generation') as any,
      objectSelection: this.config.get('objectSelection') as any
    };
  }

  async reset(): Promise<void> {
    this.config.clear();
  }

  async getPresets(): Promise<ObjectSelectionPreset[]> {
    try {
      const presetsDir = path.join(process.cwd(), 'config', 'presets');
      const files = await fs.readdir(presetsDir);
      const presets: ObjectSelectionPreset[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(presetsDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const preset = JSON.parse(content);
            presets.push(preset);
          } catch (error) {
            console.warn(chalk.yellow(`Warning: Failed to load preset ${file}`));
          }
        }
      }

      return presets;
    } catch (error) {
      return [];
    }
  }

  async createPreset(preset: ObjectSelectionPreset): Promise<void> {
    try {
      const presetsDir = path.join(process.cwd(), 'config', 'presets');
      
      // Ensure directory exists
      await fs.mkdir(presetsDir, { recursive: true });
      
      const filePath = path.join(presetsDir, `${preset.name}.json`);
      await fs.writeFile(filePath, JSON.stringify(preset, null, 2));
    } catch (error) {
      throw new Error(`Failed to create preset: ${error instanceof Error ? error.message : error}`);
    }
  }

  async deletePreset(presetName: string): Promise<void> {
    try {
      const presetsDir = path.join(process.cwd(), 'config', 'presets');
      const filePath = path.join(presetsDir, `${presetName}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      throw new Error(`Failed to delete preset: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Session management
  async saveSession(sessionData: SessionConfig): Promise<void> {
    Object.keys(sessionData).forEach(key => {
      this.sessionConfig.set(key, (sessionData as any)[key]);
    });
  }

  async getSession(): Promise<SessionConfig> {
    return {
      lastConnection: this.sessionConfig.get('lastConnection') as SessionConfig['lastConnection'],
      lastObjectSelection: this.sessionConfig.get('lastObjectSelection') as SessionConfig['lastObjectSelection'],
      lastGenerationSettings: this.sessionConfig.get('lastGenerationSettings') as SessionConfig['lastGenerationSettings']
    };
  }

  async clearSession(): Promise<void> {
    this.sessionConfig.clear();
  }

  // Environment-specific configuration
  async getSalesforceCredentials(): Promise<{
    clientId?: string;
    clientSecret?: string;
    username?: string;
    loginUrl?: string;
  }> {
    // Check environment variables first
    const envCredentials = {
      clientId: process.env.SF_CLIENT_ID,
      clientSecret: process.env.SF_CLIENT_SECRET,
      username: process.env.SF_USERNAME,
      loginUrl: process.env.SF_LOGIN_URL
    };

    // Get stored credentials
    const storedCredentials = await this.get('salesforce') || {};

    // Merge with env taking precedence
    return {
      loginUrl: envCredentials.loginUrl || storedCredentials.loginUrl || 'https://test.salesforce.com',
      clientId: envCredentials.clientId || storedCredentials.clientId,
      clientSecret: envCredentials.clientSecret || storedCredentials.clientSecret,
      username: envCredentials.username || storedCredentials.username
    };
  }

  async validateCredentials(): Promise<{
    isValid: boolean;
    missingFields: string[];
    warnings: string[];
  }> {
    const credentials = await this.getSalesforceCredentials();
    const missingFields: string[] = [];
    const warnings: string[] = [];

    if (!credentials.clientId) {
      missingFields.push('clientId');
    }

    if (!credentials.clientSecret) {
      missingFields.push('clientSecret');
    }

    if (!credentials.username) {
      missingFields.push('username');
    }

    // Validate login URL
    if (credentials.loginUrl) {
      if (!credentials.loginUrl.startsWith('https://')) {
        warnings.push('Login URL should use HTTPS');
      }
      if (credentials.loginUrl.includes('login.salesforce.com')) {
        warnings.push('Using production login URL - ensure this is intentional for sandbox use');
      }
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
      warnings
    };
  }

  // Default configurations
  async initializeDefaults(): Promise<void> {
    const currentConfig = await this.getAll();
    
    // Set default values if not already configured
    if (!currentConfig.salesforce.loginUrl) {
      await this.set('salesforce.loginUrl', 'https://test.salesforce.com');
    }

    if (!currentConfig.salesforce.apiVersion) {
      await this.set('salesforce.apiVersion', '59.0');
    }

    if (!currentConfig.generation.defaultRecordsPerObject) {
      await this.set('generation.defaultRecordsPerObject', 100);
    }

    if (!currentConfig.generation.faker?.locale) {
      await this.set('generation.faker.locale', 'en');
    }

    if (!currentConfig.objectSelection.excludePatterns || currentConfig.objectSelection.excludePatterns.length === 0) {
      await this.set('objectSelection.excludePatterns', ['*History', '*Share', '*Feed', '*Tag']);
    }
  }

  // Export/Import configuration
  async exportConfig(filePath: string): Promise<void> {
    try {
      const config = await this.getAll();
      const session = await this.getSession();
      const presets = await this.getPresets();

      const exportData = {
        config,
        session,
        presets,
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      };

      await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
    } catch (error) {
      throw new Error(`Failed to export configuration: ${error instanceof Error ? error.message : error}`);
    }
  }

  async importConfig(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const importData = JSON.parse(content);

      if (importData.config) {
        Object.keys(importData.config).forEach(key => {
          this.config.set(key, importData.config[key]);
        });
      }

      if (importData.session) {
        await this.saveSession(importData.session);
      }

      if (importData.presets && Array.isArray(importData.presets)) {
        for (const preset of importData.presets) {
          await this.createPreset(preset);
        }
      }
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : error}`);
    }
  }

  getConfigPath(): string {
    return this.config.path;
  }

  getSessionPath(): string {
    return this.sessionConfig.path;
  }
}