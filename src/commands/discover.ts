import { Command } from 'commander';
import chalk from 'chalk';
import { SalesforceService } from '../services/salesforce';
import { SandboxService } from '../sandbox/sandbox-detector';
import { ObjectDiscoveryService } from '../services/object-discovery';

export const discoverCommand = new Command('discover')
  .description('Discover and analyze Salesforce sandbox data model')
  .option('-u, --username <username>', 'Salesforce username (not required for Client Credentials flow)')
  .option('-c, --client-id <clientId>', 'Connected App client ID')
  .option('-s, --client-secret <clientSecret>', 'Connected App client secret')
  .option('-l, --login-url <loginUrl>', 'Salesforce login URL', 'https://test.salesforce.com')
  .option('-t, --access-token <token>', 'Use existing access token (for testing)')
  .option('-o, --output <file>', 'Output file for discovered data model')
  .option('--objects-only', 'Discover objects only (skip field analysis)')
  .option('--analyze-relationships', 'Analyze object relationships and dependencies')
  .option('--generate-load-order', 'Generate recommended load order based on dependencies')
  .option('--create-lists', 'Create include/exclude lists based on object analysis')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔍 Starting Salesforce sandbox discovery...'));
      
      // Initialize services
      const salesforceService = new SalesforceService();
      const sandboxService = new SandboxService(salesforceService);
      const discoveryService = new ObjectDiscoveryService(salesforceService);
      
      // Authenticate or use existing token
      if (options.accessToken) {
        console.log(chalk.yellow('Using provided access token...'));
        await salesforceService.setAccessToken(options.accessToken, options.loginUrl || 'https://drive-data-1545-dev-ed.develop.my.salesforce.com');
      } else {
        console.log(chalk.yellow('Authenticating with Salesforce...'));
        await salesforceService.authenticate({
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          username: options.username,
          loginUrl: options.loginUrl
        });
      }
      
      // Detect sandbox type and limits
      console.log(chalk.yellow('Analyzing sandbox environment...'));
      const sandboxInfo = await sandboxService.detectSandboxInfo();
      
      console.log(chalk.green('✅ Sandbox Information:'));
      console.log(`  Type: ${sandboxInfo.type}`);
      console.log(`  Data Storage: ${sandboxInfo.currentDataUsage || 0}MB / ${sandboxInfo.dataStorageLimit}MB`);
      console.log(`  File Storage: ${sandboxInfo.currentFileUsage || 0}MB / ${sandboxInfo.fileStorageLimit}MB`);
      
      // Discover objects
      console.log(chalk.yellow('Discovering Salesforce objects...'));
      const objects = await discoveryService.discoverObjects(!options.objectsOnly);
      
      // Categorize and analyze objects
      const categories = discoveryService.categorizeObjects(objects);
      const totalFields = objects.reduce((sum, obj) => sum + obj.fields.length, 0);
      
      // Analyze field types across the org
      const fieldTypeStats: { [type: string]: number } = {};
      objects.forEach(obj => {
        obj.fields.forEach(field => {
          fieldTypeStats[field.type] = (fieldTypeStats[field.type] || 0) + 1;
        });
      });
      
      // Display comprehensive summary
      console.log(chalk.blue('\n📊 Org Schema Summary:'));
      console.log(chalk.green(`   Total Objects: ${objects.length}`));
      console.log(chalk.green(`   Standard Objects: ${categories.standard.length}`));
      console.log(chalk.green(`   Custom Objects: ${categories.custom.length}`));
      console.log(chalk.green(`   Managed Package Objects: ${categories.managed.length}`));
      console.log(chalk.green(`   Total Fields: ${totalFields}`));
      
      console.log(chalk.blue('\n🔧 Object Capabilities:'));
      const createableCount = objects.filter(obj => obj.createable).length;
      const updateableCount = objects.filter(obj => obj.updateable).length;
      const deletableCount = objects.filter(obj => obj.deletable).length;
      console.log(chalk.green(`   Createable: ${createableCount}`));
      console.log(chalk.green(`   Updateable: ${updateableCount}`));
      console.log(chalk.green(`   Deletable: ${deletableCount}`));
      
      console.log(chalk.blue('\n📋 Top Field Types:'));
      const sortedFieldTypes = Object.entries(fieldTypeStats)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 10);
      
      sortedFieldTypes.forEach(([type, count]) => {
        console.log(chalk.green(`   ${type}: ${count}`));
      });

      // Analyze relationships and dependencies
      let dependencies: any[] = [];
      let loadOrder: string[] = [];
      let objectLists: any = {};

      if (options.analyzeRelationships) {
        console.log(chalk.blue('\n🔗 Analyzing object relationships...'));
        dependencies = await discoveryService.analyzeDependencies(objects);
        
        const relationshipStats = analyzeRelationshipComplexity(dependencies);
        console.log(chalk.green(`   Objects with dependencies: ${relationshipStats.objectsWithDependencies}`));
        console.log(chalk.green(`   Objects with no dependencies: ${relationshipStats.independentObjects}`));
        console.log(chalk.green(`   Most dependent object: ${relationshipStats.mostDependent.object} (${relationshipStats.mostDependent.count} deps)`));
        console.log(chalk.green(`   Total relationships: ${relationshipStats.totalRelationships}`));
      }

      if (options.generateLoadOrder) {
        console.log(chalk.blue('\n📋 Generating load order...'));
        loadOrder = discoveryService.sortObjectsByDependencies(objects, dependencies);
        
        console.log(chalk.green(`   Load order determined for ${loadOrder.length} objects`));
        console.log(chalk.yellow(`   First 10 objects to load: ${loadOrder.slice(0, 10).join(', ')}`));
        console.log(chalk.yellow(`   Last 10 objects to load: ${loadOrder.slice(-10).join(', ')}`));
      }

      if (options.createLists) {
        console.log(chalk.blue('\n📝 Creating include/exclude lists...'));
        objectLists = createObjectLists(objects, dependencies);
        
        console.log(chalk.green(`   Core objects (recommended): ${objectLists.core.length}`));
        console.log(chalk.green(`   Extended objects: ${objectLists.extended.length}`));
        console.log(chalk.green(`   System objects (exclude): ${objectLists.systemExclude.length}`));
        console.log(chalk.green(`   Complex objects (optional): ${objectLists.complex.length}`));
      }
      
      if (options.output) {
        const fs = require('fs').promises;
        const schemaAnalysis = {
          metadata: {
            orgType: sandboxInfo.type,
            discoveredAt: new Date().toISOString(),
            totalObjects: objects.length,
            totalFields: totalFields,
            dataStorageLimit: sandboxInfo.dataStorageLimit,
            fileStorageLimit: sandboxInfo.fileStorageLimit,
            currentDataUsage: sandboxInfo.currentDataUsage,
            currentFileUsage: sandboxInfo.currentFileUsage
          },
          summary: {
            standardObjects: categories.standard.length,
            customObjects: categories.custom.length, 
            managedObjects: categories.managed.length,
            createableObjects: createableCount,
            updateableObjects: updateableCount,
            deletableObjects: deletableCount
          },
          fieldTypeAnalysis: fieldTypeStats,
          objects: {
            standard: categories.standard,
            custom: categories.custom,
            managed: categories.managed
          },
          ...(options.analyzeRelationships && { dependencies }),
          ...(options.generateLoadOrder && { loadOrder }),
          ...(options.createLists && { objectLists })
        };
        
        await fs.writeFile(options.output, JSON.stringify(schemaAnalysis, null, 2));
        console.log(chalk.green(`\n📁 Schema analysis saved to ${options.output}`));
        
        // Generate separate files for easier access
        if (options.generateLoadOrder && loadOrder.length > 0) {
          const loadOrderContent = [
            '# Salesforce Object Load Order',
            '# Generated from relationship analysis - objects should be loaded in this order to respect dependencies',
            '# Edit this file to customize the load order for your specific requirements',
            '',
            ...loadOrder
          ].join('\n');
          
          await fs.writeFile('load-order.txt', loadOrderContent);
          console.log(chalk.green(`📋 Load order saved to load-order.txt`));
        }
        
        if (options.createLists && objectLists.core) {
          const objectListsContent = {
            metadata: {
              generatedAt: new Date().toISOString(),
              orgType: sandboxInfo.type,
              totalObjects: objects.length,
              description: "Categorized lists of Salesforce objects for data seeding. Edit these lists to customize which objects to include or exclude based on your requirements."
            },
            core: {
              description: "Essential Salesforce objects for most business scenarios - recommended for demos and testing",
              objects: objectLists.core
            },
            extended: {
              description: "Additional createable business objects that can be used for more comprehensive testing",
              count: objectLists.extended.length,
              examples: objectLists.extended.slice(0, 10),
              note: "Full list available in the complete relationship-analysis.json file"
            },
            systemExclude: {
              description: "System objects that should typically be excluded from data seeding",
              objects: objectLists.systemExclude.slice(0, 10),
              patterns: [
                ".*History$", ".*Share$", ".*Feed$", ".*Tag$", ".*Event$", ".*ChangeEvent$",
                "^Setup.*", "^Apex.*", "^Flow.*", "^Dashboard.*", "^Report.*", "^Folder.*",
                "^ContentDocument.*", "^ContentVersion.*", "^Document.*", "^Attachment.*",
                "^ProcessInstance.*", "^Workflow.*", "^EmailMessage.*", "^LoginHistory.*",
                "^AsyncApexJob.*", "^CronTrigger.*", "^Profile$"
              ]
            },
            complex: {
              description: "Objects with many dependencies (3+) that may require careful handling",
              count: objectLists.complex.length,
              examples: objectLists.complex.slice(0, 10),
              note: "These objects may require specific parent records to be created first"
            },
            usage: {
              recommendations: {
                quickDemo: "Use 'core' objects only",
                comprehensiveTesting: "Use 'core' + selected 'extended' objects", 
                developmentSandbox: "Consider 'complex' objects for full feature testing",
                excludeAlways: "Objects matching 'systemExclude' patterns"
              },
              customization: {
                addToCore: "Add frequently used custom objects to the 'core' list",
                modifyExclude: "Adjust 'systemExclude' patterns based on your org's naming conventions",
                loadOrder: "Modify load-order.txt to change the sequence of object creation"
              }
            }
          };
          
          await fs.writeFile('object-lists.json', JSON.stringify(objectListsContent, null, 2));
          console.log(chalk.green(`📝 Object lists saved to object-lists.json`));
        }
        
        if (options.analyzeRelationships && dependencies.length > 0) {
          // Create a human-readable dependencies file
          const dependenciesContent = [
            '# Salesforce Object Dependencies',
            '# This file shows which objects depend on which other objects',
            '# Format: ChildObject -> ParentObject1, ParentObject2',
            '# Use this to understand why certain objects must be loaded before others',
            '',
            ...dependencies
              .filter(dep => dep.dependsOn.length > 0)
              .sort((a, b) => a.objectName.localeCompare(b.objectName))
              .map(dep => `${dep.objectName} -> ${dep.dependsOn.join(', ')}`)
          ].join('\n');
          
          await fs.writeFile('dependencies.txt', dependenciesContent);
          console.log(chalk.green(`🔗 Dependencies saved to dependencies.txt`));
        }
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Discovery failed:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

function analyzeRelationshipComplexity(dependencies: any[]): any {
  const objectsWithDependencies = dependencies.filter(dep => dep.dependsOn.length > 0).length;
  const independentObjects = dependencies.filter(dep => dep.dependsOn.length === 0).length;
  const totalRelationships = dependencies.reduce((sum, dep) => sum + dep.dependsOn.length, 0);
  
  let mostDependent = { object: '', count: 0 };
  dependencies.forEach(dep => {
    if (dep.dependsOn.length > mostDependent.count) {
      mostDependent = { object: dep.objectName, count: dep.dependsOn.length };
    }
  });
  
  return {
    objectsWithDependencies,
    independentObjects,
    totalRelationships,
    mostDependent
  };
}

function createObjectLists(objects: any[], dependencies: any[]): any {
  const core: string[] = [];
  const extended: string[] = [];
  const systemExclude: string[] = [];
  const complex: string[] = [];
  
  // Core business objects (commonly used in demos and testing)
  const coreObjects = [
    'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Campaign',
    'Task', 'Event', 'User', 'Product2', 'Pricebook2', 'PricebookEntry'
  ];
  
  // System objects and rarely used objects to typically exclude from data seeding
  const systemExcludePatterns = [
    /.*History$/, /.*Share$/, /.*Feed$/, /.*Tag$/, /.*Event$/i, /.*ChangeEvent$/,
    /^Setup/, /^Apex/, /^Flow/, /^Dashboard/, /^Report/, /^Folder/,
    /^ContentDocument/, /^ContentVersion/, /^Document/, /^Attachment/,
    /^ProcessInstance/, /^Workflow/, /^EmailMessage/, /^LoginHistory/,
    /^AsyncApexJob/, /^CronTrigger/, /^Organization$/, /^Profile$/
  ];
  
  // Rarely used objects from a data loading perspective
  const rarelyUsedObjects = [
    'AccountPartner', 'ActionLinkGroupTemplate', 'ActionLinkTemplate', 
    'AdditionalNumber', 'Address', 'AlternativePaymentMethod', 'Announcement',
    'ApprovalRequest', 'AuthorizationForm', 'AuthorizationFormConsent',
    'AuthorizationFormDataUse', 'AuthorizationFormText', 'BusinessBrand',
    'CalendarView', 'CalendarViewShare', 'CallCenter', 'CommSubscription',
    'CommSubscriptionChannelType', 'CommSubscriptionConsent', 'ContactRequest',
    'ContentAsset', 'Coupon', 'DataUseLegalBasis', 'DataUsePurpose',
    'DandBCompany', 'EngagementChannelType', 'Holiday', 'ListEmail',
    'Macro', 'Metric', 'OrgWideEmailAddress', 'PartyConsent', 'PaymentGateway',
    'PaymentGatewayProvider', 'PerformanceMetric', 'PushTopic', 'RecordsetFilterCriteria',
    'SalesAgreement', 'StreamingChannel', 'ThreatDetectionFeedback', 'TwoFactorInfo',
    'UiFormula', 'UiFormulaCriterion', 'WebStore', 'WebStorePricebook',
    // App analytics and usage objects (administrative)
    'AppAnalyticsQueryRequest', 'AppExtension', 'AppUsageAssignment',
    // Appointment bundle objects (specialized Service Cloud)
    'ApptBundleAggrDurDnscale', 'ApptBundleAggrPolicy', 'ApptBundleConfig',
    'ApptBundlePolicy', 'ApptBundlePolicySvcTerr', 'ApptBundlePropagatePolicy',
    'ApptBundleRestrictPolicy', 'ApptBundleSortPolicy'
  ];
  
  objects.forEach(obj => {
    const objName = obj.name;
    
    // Check if it's a system object to exclude
    if (systemExcludePatterns.some(pattern => pattern.test(objName))) {
      systemExclude.push(objName);
      return;
    }
    
    // Check if it's a rarely used object 
    if (rarelyUsedObjects.includes(objName)) {
      systemExclude.push(objName);
      return;
    }
    
    // Check if it's a core business object
    if (coreObjects.includes(objName)) {
      core.push(objName);
      return;
    }
    
    // Check dependency complexity
    const objDependency = dependencies.find(dep => dep.objectName === objName);
    const dependencyCount = objDependency ? objDependency.dependsOn.length : 0;
    
    // Objects with many dependencies are complex
    if (dependencyCount > 3) {
      complex.push(objName);
    } else if (obj.createable && obj.queryable) {
      // Other createable objects go to extended
      extended.push(objName);
    } else {
      // Non-createable objects typically excluded
      systemExclude.push(objName);
    }
  });
  
  return {
    core: core.sort(),
    extended: extended.sort(), 
    complex: complex.sort(),
    systemExclude: systemExclude.sort()
  };
}