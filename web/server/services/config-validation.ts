import { WizardSession, ConfigurationUpdate } from '../../shared/types/api';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  canProceed: boolean;
}

export interface ValidationError {
  type: 'missing_data' | 'invalid_value' | 'business_rule_violation' | 'system_constraint';
  field: string;
  message: string;
  severity: 'critical' | 'major' | 'minor';
  suggestedFix?: string;
  context?: any;
}

export interface ValidationWarning {
  type: 'performance' | 'best_practice' | 'data_quality' | 'user_experience';
  field: string;
  message: string;
  impact: 'high' | 'medium' | 'low';
  recommendation?: string;
}

export interface ConfigurationConfirmation {
  summary: string;
  changes: ConfigurationChange[];
  estimatedRecords: number;
  estimatedTime: string;
  riskLevel: 'low' | 'medium' | 'high';
  prerequisites: string[];
  consequences: string[];
}

export interface ConfigurationChange {
  type: 'object_selection' | 'record_count' | 'field_configuration' | 'global_setting' | 'step_navigation';
  description: string;
  before: any;
  after: any;
  impact: string;
}

class ConfigurationValidationService {
  constructor() {}

  async validateConfiguration(
    configUpdate: ConfigurationUpdate, 
    currentSession: WizardSession
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    try {
      // Validate object selection
      if (configUpdate.selectedObjects !== undefined) {
        const objectValidation = this.validateObjectSelection(configUpdate.selectedObjects, currentSession);
        errors.push(...objectValidation.errors);
        warnings.push(...objectValidation.warnings);
      }

      // Validate configuration settings
      if (configUpdate.configuration !== undefined) {
        const configValidation = this.validateObjectConfiguration(configUpdate.configuration, currentSession);
        errors.push(...configValidation.errors);
        warnings.push(...configValidation.warnings);
        suggestions.push(...configValidation.suggestions);
      }

      // Validate global settings
      if (configUpdate.globalSettings !== undefined) {
        const globalValidation = this.validateGlobalSettings(configUpdate.globalSettings, currentSession);
        errors.push(...globalValidation.errors);
        warnings.push(...globalValidation.warnings);
      }

      // Validate step navigation
      if (configUpdate.currentStep !== undefined) {
        const stepValidation = this.validateStepNavigation(configUpdate.currentStep, currentSession);
        errors.push(...stepValidation.errors);
        warnings.push(...stepValidation.warnings);
      }

      // Generate suggestions based on configuration
      suggestions.push(...this.generateConfigurationSuggestions(configUpdate, currentSession));

      const criticalErrors = errors.filter(e => e.severity === 'critical');
      const canProceed = criticalErrors.length === 0;

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        canProceed
      };

    } catch (error) {
      console.error('Configuration validation error:', error);
      return {
        isValid: false,
        errors: [{
          type: 'system_constraint',
          field: 'validation',
          message: 'Failed to validate configuration',
          severity: 'critical'
        }],
        warnings: [],
        suggestions: [],
        canProceed: false
      };
    }
  }

  async generateConfirmation(
    configUpdate: ConfigurationUpdate,
    currentSession: WizardSession
  ): Promise<ConfigurationConfirmation> {
    try {
      const changes = this.identifyChanges(configUpdate, currentSession);
      const estimatedRecords = this.calculateEstimatedRecords(configUpdate, currentSession);
      const estimatedTime = this.estimateProcessingTime(estimatedRecords, configUpdate);
      const riskLevel = this.assessRiskLevel(configUpdate, currentSession);
      const prerequisites = this.getPrerequisites(configUpdate, currentSession);
      const consequences = this.getConsequences(configUpdate, currentSession);

      const summary = this.generateSummary(changes, estimatedRecords, riskLevel);

      return {
        summary,
        changes,
        estimatedRecords,
        estimatedTime,
        riskLevel,
        prerequisites,
        consequences
      };

    } catch (error) {
      console.error('Configuration confirmation generation error:', error);
      return {
        summary: 'Unable to generate configuration summary',
        changes: [],
        estimatedRecords: 0,
        estimatedTime: 'Unknown',
        riskLevel: 'high',
        prerequisites: ['Review configuration manually'],
        consequences: ['Unexpected results may occur']
      };
    }
  }

  private validateObjectSelection(selectedObjects: string[], session: WizardSession): {errors: ValidationError[], warnings: ValidationWarning[]} {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!selectedObjects || selectedObjects.length === 0) {
      errors.push({
        type: 'missing_data',
        field: 'selectedObjects',
        message: 'No objects selected for data generation',
        severity: 'critical',
        suggestedFix: 'Select at least one Salesforce object to generate data for'
      });
      return { errors, warnings };
    }

    // Check if selected objects are available
    const availableObjects = session.discoveredObjects?.map(obj => obj.name) || [];
    const unavailableObjects = selectedObjects.filter(obj => !availableObjects.includes(obj));
    
    if (unavailableObjects.length > 0) {
      errors.push({
        type: 'invalid_value',
        field: 'selectedObjects',
        message: `Objects not available in your Salesforce org: ${unavailableObjects.join(', ')}`,
        severity: 'major',
        suggestedFix: 'Remove unavailable objects or run discovery again'
      });
    }

    // Warn about complex object combinations
    if (selectedObjects.length > 5) {
      warnings.push({
        type: 'performance',
        field: 'selectedObjects',
        message: `Generating data for ${selectedObjects.length} objects may take longer`,
        impact: 'medium',
        recommendation: 'Consider generating data in smaller batches'
      });
    }

    // Check for missing relationships
    const hasAccounts = selectedObjects.includes('Account');
    const hasContacts = selectedObjects.includes('Contact');
    const hasOpportunities = selectedObjects.includes('Opportunity');

    if (hasContacts && !hasAccounts) {
      warnings.push({
        type: 'data_quality',
        field: 'selectedObjects',
        message: 'Contacts without Accounts may have limited relationship data',
        impact: 'medium',
        recommendation: 'Consider including Account objects to create realistic relationships'
      });
    }

    if (hasOpportunities && !hasAccounts) {
      warnings.push({
        type: 'data_quality',
        field: 'selectedObjects',
        message: 'Opportunities without Accounts will have limited relationship data',
        impact: 'high',
        recommendation: 'Include Account objects to create proper opportunity relationships'
      });
    }

    return { errors, warnings };
  }

  private validateObjectConfiguration(configuration: any, session: WizardSession): {errors: ValidationError[], warnings: ValidationWarning[], suggestions: string[]} {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    for (const [objectName, objectConfig] of Object.entries(configuration)) {
      if (typeof objectConfig !== 'object' || objectConfig === null) {
        errors.push({
          type: 'invalid_value',
          field: `configuration.${objectName}`,
          message: `Invalid configuration for object ${objectName}`,
          severity: 'major'
        });
        continue;
      }

      const config = objectConfig as any;

      // Validate record count
      if (config.recordCount !== undefined) {
        if (typeof config.recordCount !== 'number' || config.recordCount < 0) {
          errors.push({
            type: 'invalid_value',
            field: `configuration.${objectName}.recordCount`,
            message: `Invalid record count for ${objectName}: ${config.recordCount}`,
            severity: 'major',
            suggestedFix: 'Use a positive number for record count'
          });
        } else if (config.recordCount === 0) {
          warnings.push({
            type: 'data_quality',
            field: `configuration.${objectName}.recordCount`,
            message: `Zero records configured for ${objectName}`,
            impact: 'medium',
            recommendation: 'Consider setting a positive record count'
          });
        } else if (config.recordCount > 10000) {
          warnings.push({
            type: 'performance',
            field: `configuration.${objectName}.recordCount`,
            message: `Large record count for ${objectName}: ${config.recordCount}`,
            impact: 'high',
            recommendation: 'Consider generating data in smaller batches to avoid performance issues'
          });
        }
      }

      // Suggest realistic record counts based on object type
      if (config.recordCount !== undefined) {
        const suggestedCount = this.getSuggestedRecordCount(objectName, config.recordCount);
        if (suggestedCount && suggestedCount !== config.recordCount) {
          suggestions.push(`Consider ${suggestedCount} records for ${objectName} (typical business ratio)`);
        }
      }
    }

    return { errors, warnings, suggestions };
  }

  private validateGlobalSettings(globalSettings: any, session: WizardSession): {errors: ValidationError[], warnings: ValidationWarning[]} {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (globalSettings.totalRecords !== undefined) {
      if (typeof globalSettings.totalRecords !== 'number' || globalSettings.totalRecords < 0) {
        errors.push({
          type: 'invalid_value',
          field: 'globalSettings.totalRecords',
          message: 'Total records must be a positive number',
          severity: 'major'
        });
      } else if (globalSettings.totalRecords > 50000) {
        warnings.push({
          type: 'performance',
          field: 'globalSettings.totalRecords',
          message: `Large total record count: ${globalSettings.totalRecords}`,
          impact: 'high',
          recommendation: 'Consider reducing total records or enabling batch processing'
        });
      }
    }

    if (globalSettings.batchSize !== undefined) {
      if (typeof globalSettings.batchSize !== 'number' || globalSettings.batchSize < 1) {
        errors.push({
          type: 'invalid_value',
          field: 'globalSettings.batchSize',
          message: 'Batch size must be at least 1',
          severity: 'major'
        });
      } else if (globalSettings.batchSize > 10000) {
        warnings.push({
          type: 'performance',
          field: 'globalSettings.batchSize',
          message: 'Very large batch size may cause memory issues',
          impact: 'medium'
        });
      }
    }

    return { errors, warnings };
  }

  private validateStepNavigation(targetStep: string, session: WizardSession): {errors: ValidationError[], warnings: ValidationWarning[]} {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const stepOrder = ['authentication', 'discovery', 'selection', 'configuration', 'preview', 'execution', 'results'];
    const currentIndex = stepOrder.indexOf(session.currentStep);
    const targetIndex = stepOrder.indexOf(targetStep);

    if (targetIndex === -1) {
      errors.push({
        type: 'invalid_value',
        field: 'currentStep',
        message: `Invalid wizard step: ${targetStep}`,
        severity: 'major'
      });
      return { errors, warnings };
    }

    // Check prerequisites for forward navigation
    if (targetIndex > currentIndex) {
      switch (targetStep) {
        case 'discovery':
          if (!session.connectionInfo) {
            errors.push({
              type: 'missing_data',
              field: 'currentStep',
              message: 'Cannot discover objects without Salesforce connection',
              severity: 'critical',
              suggestedFix: 'Complete authentication step first'
            });
          }
          break;
        case 'selection':
          if (!session.discoveredObjects?.length) {
            errors.push({
              type: 'missing_data',
              field: 'currentStep',
              message: 'Cannot select objects without discovery data',
              severity: 'critical',
              suggestedFix: 'Complete discovery step first'
            });
          }
          break;
        case 'configuration':
          if (!session.selectedObjects?.length) {
            errors.push({
              type: 'missing_data',
              field: 'currentStep',
              message: 'Cannot configure without selected objects',
              severity: 'critical',
              suggestedFix: 'Select objects in the selection step first'
            });
          }
          break;
        case 'preview':
          if (!session.configuration || Object.keys(session.configuration).length === 0) {
            errors.push({
              type: 'missing_data',
              field: 'currentStep',
              message: 'Cannot preview without configuration',
              severity: 'critical',
              suggestedFix: 'Configure objects in the configuration step first'
            });
          }
          break;
        case 'execution':
          if (!session.selectedObjects?.length || !session.configuration) {
            errors.push({
              type: 'missing_data',
              field: 'currentStep',
              message: 'Cannot execute without complete configuration',
              severity: 'critical',
              suggestedFix: 'Complete configuration before execution'
            });
          }
          break;
        case 'results':
          if (!session.executionResults) {
            errors.push({
              type: 'missing_data',
              field: 'currentStep',
              message: 'Cannot view results without execution',
              severity: 'critical',
              suggestedFix: 'Execute data generation first'
            });
          }
          break;
      }
    }

    return { errors, warnings };
  }

  private generateConfigurationSuggestions(configUpdate: ConfigurationUpdate, session: WizardSession): string[] {
    const suggestions: string[] = [];

    // Suggest related objects
    if (configUpdate.selectedObjects) {
      const selected = configUpdate.selectedObjects;
      
      if (selected.includes('Account') && !selected.includes('Contact')) {
        suggestions.push('Consider adding Contact objects to create realistic account relationships');
      }
      
      if (selected.includes('Account') && !selected.includes('Opportunity')) {
        suggestions.push('Consider adding Opportunity objects to simulate sales processes');
      }
      
      if (selected.includes('Contact') && selected.includes('Account')) {
        suggestions.push('Great! Account-Contact relationships will create realistic business data');
      }
    }

    // Suggest optimal record counts
    if (configUpdate.configuration) {
      const totalEstimated = this.calculateEstimatedRecords(configUpdate, session);
      if (totalEstimated > 0 && totalEstimated < 100) {
        suggestions.push('Consider generating more records for better testing coverage');
      } else if (totalEstimated > 10000) {
        suggestions.push('Large datasets may take longer to generate. Consider starting smaller.');
      }
    }

    return suggestions;
  }

  private getSuggestedRecordCount(objectName: string, currentCount: number): number | null {
    const recommendations: { [key: string]: number } = {
      'Account': 100,
      'Contact': 300,
      'Opportunity': 200,
      'Lead': 150,
      'Case': 100,
      'Task': 500,
      'Event': 200
    };

    const suggested = recommendations[objectName];
    if (suggested && Math.abs(currentCount - suggested) > suggested * 0.5) {
      return suggested;
    }

    return null;
  }

  private identifyChanges(configUpdate: ConfigurationUpdate, session: WizardSession): ConfigurationChange[] {
    const changes: ConfigurationChange[] = [];

    if (configUpdate.selectedObjects !== undefined) {
      changes.push({
        type: 'object_selection',
        description: 'Object selection updated',
        before: session.selectedObjects || [],
        after: configUpdate.selectedObjects,
        impact: `${configUpdate.selectedObjects.length} objects selected for data generation`
      });
    }

    if (configUpdate.configuration !== undefined) {
      const objectConfigs = Object.keys(configUpdate.configuration);
      changes.push({
        type: 'record_count',
        description: 'Record counts configured',
        before: session.configuration || {},
        after: configUpdate.configuration,
        impact: `Configuration set for ${objectConfigs.length} objects`
      });
    }

    if (configUpdate.globalSettings !== undefined) {
      changes.push({
        type: 'global_setting',
        description: 'Global settings updated',
        before: session.globalSettings || {},
        after: configUpdate.globalSettings,
        impact: 'Global generation settings modified'
      });
    }

    if (configUpdate.currentStep !== undefined) {
      changes.push({
        type: 'step_navigation',
        description: `Navigate from ${session.currentStep} to ${configUpdate.currentStep}`,
        before: session.currentStep,
        after: configUpdate.currentStep,
        impact: `Wizard step changed`
      });
    }

    return changes;
  }

  private calculateEstimatedRecords(configUpdate: ConfigurationUpdate, session: WizardSession): number {
    if (configUpdate.globalSettings?.totalRecords) {
      return configUpdate.globalSettings.totalRecords;
    }

    if (configUpdate.configuration) {
      return Object.values(configUpdate.configuration).reduce((total, config: any) => {
        return total + (config?.recordCount || 0);
      }, 0);
    }

    if (session.configuration) {
      return Object.values(session.configuration).reduce((total, config: any) => {
        return total + (config?.recordCount || 0);
      }, 0);
    }

    return 0;
  }

  private estimateProcessingTime(recordCount: number, configUpdate: ConfigurationUpdate): string {
    // Rough estimation: 100 records per minute
    const estimatedMinutes = Math.ceil(recordCount / 100);
    
    if (estimatedMinutes < 1) {
      return 'Less than 1 minute';
    } else if (estimatedMinutes < 60) {
      return `${estimatedMinutes} minute${estimatedMinutes === 1 ? '' : 's'}`;
    } else {
      const hours = Math.floor(estimatedMinutes / 60);
      const minutes = estimatedMinutes % 60;
      return `${hours} hour${hours === 1 ? '' : 's'}${minutes > 0 ? ` ${minutes} minute${minutes === 1 ? '' : 's'}` : ''}`;
    }
  }

  private assessRiskLevel(configUpdate: ConfigurationUpdate, session: WizardSession): 'low' | 'medium' | 'high' {
    const recordCount = this.calculateEstimatedRecords(configUpdate, session);
    const objectCount = configUpdate.selectedObjects?.length || session.selectedObjects?.length || 0;

    if (recordCount > 10000 || objectCount > 7) {
      return 'high';
    } else if (recordCount > 1000 || objectCount > 3) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private getPrerequisites(configUpdate: ConfigurationUpdate, session: WizardSession): string[] {
    const prerequisites: string[] = [];

    if (configUpdate.currentStep === 'execution') {
      prerequisites.push('Salesforce connection established');
      prerequisites.push('Objects selected and configured');
      prerequisites.push('Validation rules reviewed');
    }

    if (this.calculateEstimatedRecords(configUpdate, session) > 5000) {
      prerequisites.push('Consider enabling batch processing');
      prerequisites.push('Ensure adequate API limits');
    }

    return prerequisites;
  }

  private getConsequences(configUpdate: ConfigurationUpdate, session: WizardSession): string[] {
    const consequences: string[] = [];
    const recordCount = this.calculateEstimatedRecords(configUpdate, session);

    if (recordCount > 0) {
      consequences.push(`${recordCount} records will be created in your Salesforce org`);
    }

    if (recordCount > 1000) {
      consequences.push('Data generation may consume significant API limits');
    }

    if (configUpdate.selectedObjects?.includes('Account')) {
      consequences.push('Account hierarchies and relationships will be created');
    }

    return consequences;
  }

  private generateSummary(changes: ConfigurationChange[], recordCount: number, riskLevel: string): string {
    let summary = '';
    
    const objectChanges = changes.filter(c => c.type === 'object_selection');
    const countChanges = changes.filter(c => c.type === 'record_count');
    
    if (objectChanges.length > 0) {
      const objectCount = (objectChanges[0].after as string[]).length;
      summary += `Configure ${objectCount} Salesforce objects for data generation. `;
    }

    if (recordCount > 0) {
      summary += `Generate approximately ${recordCount.toLocaleString()} records. `;
    }

    summary += `Risk level: ${riskLevel}.`;

    return summary.trim();
  }
}

export default ConfigurationValidationService;