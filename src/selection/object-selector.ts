import inquirer from 'inquirer';
import chalk from 'chalk';
import { SalesforceService } from '../services/salesforce';
import { ObjectDiscoveryService } from '../services/object-discovery';
import { SandboxInfo, SalesforceObject } from '../models/salesforce';
import { ObjectSelectionPreset } from '../models/config';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ObjectSelectionService {
  private discoveryService: ObjectDiscoveryService;

  constructor(private salesforceService: SalesforceService) {
    this.discoveryService = new ObjectDiscoveryService(salesforceService);
  }

  async interactiveSelection(sandboxInfo: SandboxInfo): Promise<string[]> {
    console.log(chalk.blue('\n🎯 Interactive Object Selection'));
    console.log(chalk.gray(`Sandbox Type: ${sandboxInfo.type}`));
    console.log(chalk.gray(`Data Limit: ${sandboxInfo.dataStorageLimit}MB`));
    
    // Discover objects
    const objects = await this.discoveryService.discoverObjects(false);
    const categorized = this.discoveryService.categorizeObjects(objects);
    
    // Show categories
    console.log(chalk.blue('\n📊 Object Categories:'));
    console.log(`  Standard Objects: ${categorized.standard.length}`);
    console.log(`  Custom Objects: ${categorized.custom.length}`);
    console.log(`  Managed Objects: ${categorized.managed.length}`);
    
    const { selectionMethod } = await inquirer.prompt([{
      type: 'list',
      name: 'selectionMethod',
      message: 'How would you like to select objects?',
      choices: [
        { name: '📋 Use a preset', value: 'preset' },
        { name: '🎯 Select by category', value: 'category' },
        { name: '🔍 Custom selection', value: 'custom' },
        { name: '📝 Manual list', value: 'manual' }
      ]
    }]);

    switch (selectionMethod) {
      case 'preset':
        return await this.selectByPreset();
      case 'category':
        return await this.selectByCategory(categorized);
      case 'custom':
        return await this.customSelection(objects);
      case 'manual':
        return await this.manualSelection();
      default:
        throw new Error('Invalid selection method');
    }
  }

  async selectByPreset(): Promise<string[]> {
    const presets = await this.loadAvailablePresets();
    
    if (presets.length === 0) {
      console.log(chalk.yellow('No presets available. Falling back to manual selection.'));
      return await this.manualSelection();
    }

    const { presetName } = await inquirer.prompt([{
      type: 'list',
      name: 'presetName',
      message: 'Select a preset:',
      choices: presets.map(preset => ({
        name: `${preset.name} - ${preset.description}`,
        value: preset.name
      }))
    }]);

    return await this.loadPreset(presetName);
  }

  async selectByCategory(categorized: {
    standard: SalesforceObject[];
    custom: SalesforceObject[];
    managed: SalesforceObject[];
  }): Promise<string[]> {
    const { categories } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'categories',
      message: 'Select object categories:',
      choices: [
        {
          name: `Standard Objects (${categorized.standard.length})`,
          value: 'standard',
          checked: true
        },
        {
          name: `Custom Objects (${categorized.custom.length})`,
          value: 'custom',
          checked: true
        },
        {
          name: `Managed Objects (${categorized.managed.length})`,
          value: 'managed',
          checked: false
        }
      ]
    }]);

    let selectedObjects: string[] = [];
    
    if (categories.includes('standard')) {
      const commonStandard = this.getCommonStandardObjects(categorized.standard);
      const { standardObjects } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'standardObjects',
        message: 'Select standard objects:',
        choices: commonStandard.map(obj => ({
          name: `${obj.label} (${obj.name})`,
          value: obj.name,
          checked: this.isRecommendedObject(obj.name)
        }))
      }]);
      selectedObjects.push(...standardObjects);
    }

    if (categories.includes('custom')) {
      const { includeAllCustom } = await inquirer.prompt([{
        type: 'confirm',
        name: 'includeAllCustom',
        message: 'Include all custom objects?',
        default: true
      }]);

      if (includeAllCustom) {
        selectedObjects.push(...categorized.custom.map(obj => obj.name));
      } else {
        const { customObjects } = await inquirer.prompt([{
          type: 'checkbox',
          name: 'customObjects',
          message: 'Select custom objects:',
          choices: categorized.custom.map(obj => ({
            name: `${obj.label} (${obj.name})`,
            value: obj.name,
            checked: false
          }))
        }]);
        selectedObjects.push(...customObjects);
      }
    }

    if (categories.includes('managed')) {
      const { managedObjects } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'managedObjects',
        message: 'Select managed objects:',
        choices: categorized.managed.map(obj => ({
          name: `${obj.label} (${obj.name})`,
          value: obj.name,
          checked: false
        }))
      }]);
      selectedObjects.push(...managedObjects);
    }

    return selectedObjects;
  }

  async customSelection(objects: SalesforceObject[]): Promise<string[]> {
    // Search and filter interface
    const { searchTerm } = await inquirer.prompt([{
      type: 'input',
      name: 'searchTerm',
      message: 'Search objects (leave empty for all):',
      default: ''
    }]);

    let filteredObjects = objects;
    if (searchTerm) {
      filteredObjects = objects.filter(obj => 
        obj.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        obj.label.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filteredObjects.length === 0) {
      console.log(chalk.yellow('No objects found matching your search.'));
      return [];
    }

    const { selectedObjects } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedObjects',
      message: `Select objects (${filteredObjects.length} available):`,
      choices: filteredObjects.map(obj => ({
        name: `${obj.label} (${obj.name})`,
        value: obj.name,
        checked: this.isRecommendedObject(obj.name)
      })),
      pageSize: 15
    }]);

    return selectedObjects;
  }

  async manualSelection(): Promise<string[]> {
    const { objectList } = await inquirer.prompt([{
      type: 'input',
      name: 'objectList',
      message: 'Enter object names (comma-separated):',
      validate: (input: string) => {
        return input.trim().length > 0 || 'Please enter at least one object name';
      }
    }]);

    return objectList.split(',').map((obj: string) => obj.trim());
  }

  async loadPreset(presetName: string): Promise<string[]> {
    try {
      const presetsDir = path.join(process.cwd(), 'config', 'presets');
      const presetPath = path.join(presetsDir, `${presetName}.json`);
      const presetContent = await fs.readFile(presetPath, 'utf-8');
      const preset: ObjectSelectionPreset = JSON.parse(presetContent);
      
      let selectedObjects = [...preset.includedObjects];
      
      // Apply include patterns if specified
      if (preset.includePatterns && preset.includePatterns.length > 0) {
        const objects = await this.discoveryService.discoverObjects(false);
        const matchedObjects = this.applyPatterns(objects.map(o => o.name), preset.includePatterns);
        selectedObjects.push(...matchedObjects);
      }
      
      // Remove excluded objects
      if (preset.excludedObjects && preset.excludedObjects.length > 0) {
        selectedObjects = selectedObjects.filter(obj => !preset.excludedObjects!.includes(obj));
      }
      
      // Apply exclude patterns
      if (preset.excludePatterns && preset.excludePatterns.length > 0) {
        const excludedObjects = this.applyPatterns(selectedObjects, preset.excludePatterns);
        selectedObjects = selectedObjects.filter(obj => !excludedObjects.includes(obj));
      }
      
      // Remove duplicates
      return [...new Set(selectedObjects)];
    } catch (error) {
      throw new Error(`Failed to load preset '${presetName}': ${error instanceof Error ? error.message : error}`);
    }
  }

  async loadAvailablePresets(): Promise<ObjectSelectionPreset[]> {
    try {
      const presetsDir = path.join(process.cwd(), 'config', 'presets');
      const presetFiles = await fs.readdir(presetsDir);
      const presets: ObjectSelectionPreset[] = [];
      
      for (const file of presetFiles) {
        if (file.endsWith('.json')) {
          try {
            const presetPath = path.join(presetsDir, file);
            const presetContent = await fs.readFile(presetPath, 'utf-8');
            const preset: ObjectSelectionPreset = JSON.parse(presetContent);
            presets.push(preset);
          } catch (error) {
            console.warn(chalk.yellow(`⚠️  Failed to load preset ${file}: ${error instanceof Error ? error.message : error}`));
          }
        }
      }
      
      return presets;
    } catch (error) {
      console.warn(chalk.yellow('⚠️  No presets directory found'));
      return [];
    }
  }

  private applyPatterns(objects: string[], patterns: string[]): string[] {
    const matched: string[] = [];
    
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
      const patternMatches = objects.filter(obj => regex.test(obj));
      matched.push(...patternMatches);
    }
    
    return [...new Set(matched)];
  }

  private getCommonStandardObjects(standardObjects: SalesforceObject[]): SalesforceObject[] {
    const commonObjectNames = [
      'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Campaign',
      'Task', 'Event', 'User', 'Product2', 'PricebookEntry', 'Quote',
      'Contract', 'Order', 'OrderItem', 'Asset'
    ];
    
    return standardObjects.filter(obj => 
      commonObjectNames.includes(obj.name)
    ).sort((a, b) => {
      const aIndex = commonObjectNames.indexOf(a.name);
      const bIndex = commonObjectNames.indexOf(b.name);
      return aIndex - bIndex;
    });
  }

  private isRecommendedObject(objectName: string): boolean {
    const recommended = ['Account', 'Contact', 'Lead', 'Opportunity', 'Case'];
    return recommended.includes(objectName);
  }

  async validateObjectSelection(objectNames: string[]): Promise<{
    valid: string[];
    invalid: string[];
    warnings: string[];
  }> {
    const valid: string[] = [];
    const invalid: string[] = [];
    const warnings: string[] = [];
    
    try {
      const allObjects = await this.discoveryService.discoverObjects(false);
      const objectMap = new Map(allObjects.map(obj => [obj.name, obj]));
      
      for (const objectName of objectNames) {
        const object = objectMap.get(objectName);
        if (!object) {
          invalid.push(objectName);
        } else if (!object.createable) {
          warnings.push(`${objectName} is not createable - data cannot be inserted`);
          invalid.push(objectName);
        } else {
          valid.push(objectName);
        }
      }
      
    } catch (error) {
      throw new Error(`Failed to validate object selection: ${error instanceof Error ? error.message : error}`);
    }
    
    return { valid, invalid, warnings };
  }
}