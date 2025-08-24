import { WizardSession, WizardStep } from '../../shared/types/api';
import { 
  NLPResponse, 
  ActionPlan, 
  ObjectConfiguration, 
  ConfigurationParameters,
  ClarificationRequest 
} from './nlp-processor';

export interface ConfigurationAction {
  type: 'update_selection' | 'update_configuration' | 'navigate_step' | 'request_clarification' | 'apply_global_settings';
  payload: any;
  description: string;
  confirmationRequired: boolean;
  targetStep?: WizardStep;
  rollbackData?: any;
}

export interface TranslationResult {
  actions: ConfigurationAction[];
  updatePreview: Partial<WizardSession>;
  userMessage: string;
  requiresConfirmation: boolean;
  warnings: string[];
  validationErrors: string[];
}

export interface WizardStateUpdate {
  selectedObjects?: string[];
  configuration?: { [key: string]: any };
  globalSettings?: any;
  currentStep?: WizardStep;
  fieldAnalysis?: { [key: string]: any };
}

class ActionTranslator {
  constructor() {}

  async translateNLPResponse(
    nlpResponse: NLPResponse, 
    currentSession: WizardSession
  ): Promise<TranslationResult> {
    try {
      const actions: ConfigurationAction[] = [];
      const warnings: string[] = [];
      const validationErrors: string[] = [];
      let requiresConfirmation = false;

      // Handle clarifications first
      if (nlpResponse.clarifications.length > 0) {
        const clarificationAction = this.createClarificationAction(nlpResponse.clarifications);
        return {
          actions: [clarificationAction],
          updatePreview: {},
          userMessage: this.formatClarificationMessage(nlpResponse.clarifications),
          requiresConfirmation: false,
          warnings: [],
          validationErrors: []
        };
      }

      // Process based on intent type
      switch (nlpResponse.intent.type) {
        case 'configure_objects':
          const configActions = await this.translateObjectConfiguration(
            nlpResponse.parameters, 
            currentSession
          );
          actions.push(...configActions.actions);
          warnings.push(...configActions.warnings);
          validationErrors.push(...configActions.errors);
          requiresConfirmation = configActions.requiresConfirmation;
          break;

        case 'set_counts':
          const countActions = this.translateCountConfiguration(
            nlpResponse.parameters,
            currentSession
          );
          actions.push(...countActions.actions);
          warnings.push(...countActions.warnings);
          requiresConfirmation = true; // Count changes should be confirmed
          break;

        case 'specify_relationships':
          const relationshipActions = this.translateRelationshipConfiguration(
            nlpResponse.parameters,
            currentSession
          );
          actions.push(...relationshipActions.actions);
          requiresConfirmation = relationshipActions.requiresConfirmation;
          break;

        case 'navigate_step':
          const navigationAction = this.createNavigationAction(nlpResponse.suggestedActions, currentSession);
          if (navigationAction) {
            actions.push(navigationAction);
          }
          break;

        case 'generate_data':
          const generateActions = this.createGenerateDataActions(nlpResponse, currentSession);
          actions.push(...generateActions.actions);
          warnings.push(...generateActions.warnings);
          validationErrors.push(...generateActions.errors);
          requiresConfirmation = true;
          break;

        default:
          // For questions or unclear intents, don't create configuration actions
          break;
      }

      // Generate preview of changes
      const updatePreview = this.generateSessionPreview(actions, currentSession);
      const userMessage = this.formatUserMessage(nlpResponse, actions, warnings, validationErrors);

      return {
        actions,
        updatePreview,
        userMessage,
        requiresConfirmation,
        warnings,
        validationErrors
      };

    } catch (error) {
      console.error('Action translation error:', error);
      
      return {
        actions: [],
        updatePreview: {},
        userMessage: 'I encountered an error while processing your request. Please try rephrasing your configuration needs.',
        requiresConfirmation: false,
        warnings: [],
        validationErrors: ['Failed to translate configuration request']
      };
    }
  }

  private async translateObjectConfiguration(
    parameters: ConfigurationParameters, 
    session: WizardSession
  ): Promise<{actions: ConfigurationAction[], warnings: string[], errors: string[], requiresConfirmation: boolean}> {
    const actions: ConfigurationAction[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    let requiresConfirmation = false;

    if (!parameters.objects || parameters.objects.length === 0) {
      errors.push('No objects specified for configuration');
      return { actions, warnings, errors, requiresConfirmation };
    }

    // Validate objects against discovered objects
    const validObjects: ObjectConfiguration[] = [];
    for (const objConfig of parameters.objects) {
      const discovered = session.discoveredObjects?.find(
        obj => obj.name === objConfig.name || obj.label === objConfig.name
      );

      if (!discovered) {
        warnings.push(`Object "${objConfig.name}" not found in your Salesforce org. Skipping.`);
        continue;
      }

      validObjects.push({
        ...objConfig,
        name: discovered.name // Ensure we use API name
      });
    }

    if (validObjects.length === 0) {
      errors.push('None of the specified objects are available in your Salesforce org');
      return { actions, warnings, errors, requiresConfirmation };
    }

    // Create selection update action
    const objectNames = validObjects.map(obj => obj.name);
    actions.push({
      type: 'update_selection',
      payload: { selectedObjects: objectNames },
      description: `Select objects: ${validObjects.map(obj => obj.name).join(', ')}`,
      confirmationRequired: false
    });

    // Create configuration update actions for each object
    const configUpdates: { [key: string]: any } = {};
    for (const objConfig of validObjects) {
      const objectConfig: any = {
        recordCount: objConfig.recordCount || 100,
        enabled: true
      };

      // Add field configurations if specified
      if (objConfig.fields && objConfig.fields.length > 0) {
        objectConfig.fieldOverrides = {};
        for (const fieldConfig of objConfig.fields) {
          objectConfig.fieldOverrides[fieldConfig.name] = {
            required: fieldConfig.required,
            values: fieldConfig.values,
            pattern: fieldConfig.pattern
          };
        }
      }

      // Add constraints
      if (objConfig.constraints && objConfig.constraints.length > 0) {
        objectConfig.constraints = objConfig.constraints;
        warnings.push(`Custom constraints for ${objConfig.name}: ${objConfig.constraints.join(', ')}`);
      }

      configUpdates[objConfig.name] = objectConfig;
      requiresConfirmation = true;
    }

    if (Object.keys(configUpdates).length > 0) {
      actions.push({
        type: 'update_configuration',
        payload: { configuration: configUpdates },
        description: `Configure ${Object.keys(configUpdates).length} objects with specified settings`,
        confirmationRequired: true,
        rollbackData: { previousConfiguration: session.configuration }
      });
    }

    return { actions, warnings, errors, requiresConfirmation };
  }

  private translateCountConfiguration(
    parameters: ConfigurationParameters,
    session: WizardSession
  ): {actions: ConfigurationAction[], warnings: string[], requiresConfirmation: boolean} {
    const actions: ConfigurationAction[] = [];
    const warnings: string[] = [];

    // Handle global count settings
    if (parameters.globalSettings?.totalRecords) {
      actions.push({
        type: 'apply_global_settings',
        payload: { 
          globalSettings: { 
            totalRecords: parameters.globalSettings.totalRecords,
            updated: new Date()
          } 
        },
        description: `Set total records to ${parameters.globalSettings.totalRecords}`,
        confirmationRequired: true
      });
    }

    // Handle object-specific counts
    if (parameters.objects) {
      const configUpdates: { [key: string]: any } = {};
      for (const objConfig of parameters.objects) {
        if (objConfig.recordCount) {
          configUpdates[objConfig.name] = {
            ...session.configuration?.[objConfig.name],
            recordCount: objConfig.recordCount
          };
        }
      }

      if (Object.keys(configUpdates).length > 0) {
        actions.push({
          type: 'update_configuration',
          payload: { configuration: configUpdates },
          description: `Update record counts for ${Object.keys(configUpdates).length} objects`,
          confirmationRequired: true,
          rollbackData: { previousConfiguration: session.configuration }
        });
      }
    }

    return { actions, warnings, requiresConfirmation: true };
  }

  private translateRelationshipConfiguration(
    parameters: ConfigurationParameters,
    session: WizardSession
  ): {actions: ConfigurationAction[], requiresConfirmation: boolean} {
    const actions: ConfigurationAction[] = [];
    
    if (!parameters.relationships || parameters.relationships.length === 0) {
      return { actions, requiresConfirmation: false };
    }

    // For now, store relationship information as metadata
    // Full relationship handling would require more complex wizard integration
    actions.push({
      type: 'update_configuration',
      payload: { 
        configuration: {
          ...session.configuration,
          relationships: parameters.relationships
        }
      },
      description: `Configure ${parameters.relationships.length} object relationships`,
      confirmationRequired: true,
      rollbackData: { previousConfiguration: session.configuration }
    });

    return { actions, requiresConfirmation: true };
  }

  private createNavigationAction(
    suggestedActions: ActionPlan[], 
    session: WizardSession
  ): ConfigurationAction | null {
    const navAction = suggestedActions.find(action => action.action === 'navigate');
    if (!navAction || !navAction.parameters.step) {
      return null;
    }

    const targetStep = navAction.parameters.step as WizardStep;
    
    // Validate the target step is reachable
    if (!this.isStepReachable(targetStep, session)) {
      return null;
    }

    return {
      type: 'navigate_step',
      payload: { step: targetStep },
      description: `Navigate to ${targetStep} step`,
      confirmationRequired: false,
      targetStep
    };
  }

  private createGenerateDataActions(
    nlpResponse: NLPResponse,
    session: WizardSession
  ): {actions: ConfigurationAction[], warnings: string[], errors: string[]} {
    const actions: ConfigurationAction[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check if we can generate data
    if (!session.selectedObjects || session.selectedObjects.length === 0) {
      errors.push('No objects selected for data generation');
      return { actions, warnings, errors };
    }

    if (!session.configuration || Object.keys(session.configuration).length === 0) {
      errors.push('No configuration set for data generation');
      return { actions, warnings, errors };
    }

    // Check if we're in the right step
    if (session.currentStep !== 'execution') {
      // Navigate to execution step
      actions.push({
        type: 'navigate_step',
        payload: { step: 'execution' },
        description: 'Navigate to execution step to begin data generation',
        confirmationRequired: false,
        targetStep: 'execution'
      });
    }

    // Apply any last-minute configuration changes
    if (nlpResponse.parameters.generation) {
      const genConfig = nlpResponse.parameters.generation;
      actions.push({
        type: 'apply_global_settings',
        payload: { 
          globalSettings: {
            ...session.globalSettings,
            generationStrategy: genConfig.strategy,
            seed: genConfig.seed,
            patterns: genConfig.patterns
          }
        },
        description: `Apply generation settings: ${genConfig.strategy} strategy`,
        confirmationRequired: true
      });
    }

    return { actions, warnings, errors };
  }

  private createClarificationAction(clarifications: ClarificationRequest[]): ConfigurationAction {
    return {
      type: 'request_clarification',
      payload: { clarifications },
      description: `Request clarification on ${clarifications.length} items`,
      confirmationRequired: false
    };
  }

  private generateSessionPreview(actions: ConfigurationAction[], session: WizardSession): Partial<WizardSession> {
    const preview: Partial<WizardSession> = {};
    
    for (const action of actions) {
      switch (action.type) {
        case 'update_selection':
          preview.selectedObjects = action.payload.selectedObjects;
          break;
          
        case 'update_configuration':
          preview.configuration = {
            ...session.configuration,
            ...action.payload.configuration
          };
          break;
          
        case 'apply_global_settings':
          preview.globalSettings = {
            ...session.globalSettings,
            ...action.payload.globalSettings
          };
          break;
          
        case 'navigate_step':
          preview.currentStep = action.payload.step;
          break;
      }
    }
    
    return preview;
  }

  private formatUserMessage(
    nlpResponse: NLPResponse, 
    actions: ConfigurationAction[],
    warnings: string[],
    errors: string[]
  ): string {
    let message = nlpResponse.explanation;

    if (errors.length > 0) {
      message += '\n\n❌ **Issues found:**\n' + errors.map(e => `- ${e}`).join('\n');
    }

    if (warnings.length > 0) {
      message += '\n\n⚠️ **Notes:**\n' + warnings.map(w => `- ${w}`).join('\n');
    }

    if (actions.length > 0) {
      const actionDescriptions = actions.map(a => a.description);
      message += '\n\n**I can help you with:**\n' + actionDescriptions.map(d => `- ${d}`).join('\n');
    }

    return message;
  }

  private formatClarificationMessage(clarifications: ClarificationRequest[]): string {
    const highPriority = clarifications.filter(c => c.priority === 'high');
    const otherClarifications = clarifications.filter(c => c.priority !== 'high');

    let message = "I need some clarification to help you better:\n\n";

    highPriority.forEach((clarification, index) => {
      message += `**${index + 1}.** ${clarification.question}\n`;
      if (clarification.options && clarification.options.length > 0) {
        message += clarification.options.map(opt => `   - ${opt}`).join('\n') + '\n';
      }
      message += '\n';
    });

    if (otherClarifications.length > 0) {
      message += "Also, it would help to know:\n";
      otherClarifications.forEach((clarification, index) => {
        message += `- ${clarification.question}\n`;
      });
    }

    return message.trim();
  }

  private isStepReachable(targetStep: WizardStep, session: WizardSession): boolean {
    const stepOrder: WizardStep[] = [
      'authentication', 'discovery', 'selection', 'configuration', 'preview', 'execution', 'results'
    ];
    
    const currentIndex = stepOrder.indexOf(session.currentStep);
    const targetIndex = stepOrder.indexOf(targetStep);
    
    // Can navigate to current step, previous steps, or next step (if requirements met)
    if (targetIndex <= currentIndex) {
      return true;
    }
    
    // Check if requirements are met for forward navigation
    switch (targetStep) {
      case 'discovery':
        return !!session.connectionInfo;
      case 'selection':
        return !!(session.connectionInfo && session.discoveredObjects?.length);
      case 'configuration':
        return !!(session.selectedObjects?.length);
      case 'preview':
        return !!(session.configuration && Object.keys(session.configuration).length);
      case 'execution':
        return !!(session.configuration && session.selectedObjects?.length);
      case 'results':
        return !!session.executionResults;
      default:
        return true;
    }
  }

  // Public utility methods
  async applyConfigurationActions(
    actions: ConfigurationAction[], 
    session: WizardSession, 
    updateSessionCallback: (updates: Partial<WizardSession>) => Promise<WizardSession | null>
  ): Promise<{ success: boolean; updatedSession?: WizardSession; errors: string[] }> {
    const errors: string[] = [];
    let updatedSession = session;

    try {
      for (const action of actions) {
        if (action.type === 'request_clarification') {
          // Skip clarification actions - they're handled by the UI
          continue;
        }

        const updates: Partial<WizardSession> = {};
        
        switch (action.type) {
          case 'update_selection':
            updates.selectedObjects = action.payload.selectedObjects;
            break;
            
          case 'update_configuration':
            updates.configuration = {
              ...updatedSession.configuration,
              ...action.payload.configuration
            };
            break;
            
          case 'apply_global_settings':
            updates.globalSettings = {
              ...updatedSession.globalSettings,
              ...action.payload.globalSettings
            };
            break;
            
          case 'navigate_step':
            updates.currentStep = action.payload.step;
            break;
        }

        if (Object.keys(updates).length > 0) {
          const result = await updateSessionCallback(updates);
          if (result) {
            updatedSession = result;
          } else {
            errors.push(`Failed to apply action: ${action.description}`);
          }
        }
      }

      return { success: errors.length === 0, updatedSession, errors };

    } catch (error) {
      console.error('Error applying configuration actions:', error);
      errors.push('Failed to apply configuration changes');
      return { success: false, errors };
    }
  }

  validateConfiguration(config: any, session: WizardSession): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate object selection
    if (config.selectedObjects) {
      for (const objName of config.selectedObjects) {
        const exists = session.discoveredObjects?.find(obj => obj.name === objName);
        if (!exists) {
          errors.push(`Object "${objName}" is not available in your Salesforce org`);
        }
      }
    }

    // Validate record counts
    if (config.configuration) {
      for (const [objName, objConfig] of Object.entries(config.configuration)) {
        if (typeof objConfig === 'object' && objConfig !== null) {
          const configObj = objConfig as any;
          if (configObj.recordCount !== undefined) {
            if (typeof configObj.recordCount !== 'number' || configObj.recordCount < 0) {
              errors.push(`Invalid record count for ${objName}: ${configObj.recordCount}`);
            } else if (configObj.recordCount > 10000) {
              warnings.push(`Large record count for ${objName}: ${configObj.recordCount}. This may take a while to generate.`);
            }
          }
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

export default ActionTranslator;