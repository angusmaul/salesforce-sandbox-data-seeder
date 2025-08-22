import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { SalesforceService } from '../services/salesforce';
import { SandboxService } from '../sandbox/sandbox-detector';
import { ObjectSelectionService } from '../selection/object-selector';
import { DataGenerationService } from '../generators/data-generator';
import { DataLoadService } from '../services/bulk-loader';

export const seedCommand = new Command('seed')
  .description('Generate and load sample data into Salesforce sandbox')
  .option('-u, --username <username>', 'Salesforce username (not required for Client Credentials flow)')
  .option('-c, --client-id <clientId>', 'Connected App client ID')
  .option('-s, --client-secret <clientSecret>', 'Connected App client secret')
  .option('-l, --login-url <loginUrl>', 'Salesforce login URL', 'https://test.salesforce.com')
  .option('-t, --access-token <token>', 'Use existing access token (for testing)')
  .option('-o, --objects <objects>', 'Comma-separated list of objects to seed')
  .option('-r, --records <number>', 'Number of records per object', '100')
  .option('--preset <preset>', 'Use predefined object selection preset')
  .option('--dry-run', 'Show what would be generated without actually loading data')
  .option('--interactive', 'Interactive mode for object selection and configuration')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🌱 Starting Salesforce data seeding...'));
      
      // Initialize services
      const salesforceService = new SalesforceService();
      const sandboxService = new SandboxService(salesforceService);
      const selectionService = new ObjectSelectionService(salesforceService);
      const generationService = new DataGenerationService();
      const dataLoadService = new DataLoadService(salesforceService);
      
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
      
      // Analyze sandbox
      const sandboxInfo = await sandboxService.detectSandboxInfo();
      console.log(chalk.green(`✅ Connected to ${sandboxInfo.type} sandbox`));
      
      // Select objects
      let selectedObjects: string[];
      if (options.interactive) {
        selectedObjects = await selectionService.interactiveSelection(sandboxInfo);
      } else if (options.objects) {
        selectedObjects = options.objects.split(',').map((obj: string) => obj.trim());
      } else if (options.preset) {
        selectedObjects = await selectionService.loadPreset(options.preset);
      } else {
        console.log(chalk.yellow('No objects specified. Use --interactive, --objects, or --preset'));
        process.exit(1);
      }
      
      console.log(chalk.green(`📋 Selected ${selectedObjects.length} objects for seeding`));
      
      // Calculate generation plan
      const recordsPerObject = parseInt(options.records);
      // Use exact counts if user explicitly provided -r parameter (not using default)
      const useExactCounts = options.records !== '100'; // '100' is the default value
      const generationPlan = await generationService.createGenerationPlan(
        selectedObjects,
        recordsPerObject,
        sandboxInfo,
        undefined, // objects parameter
        useExactCounts
      );
      
      if (options.dryRun) {
        console.log(chalk.blue('🔍 Dry run - showing generation plan:'));
        generationPlan.forEach(plan => {
          console.log(`  ${plan.objectName}: ${plan.recordCount} records`);
        });
        return;
      }
      
      // Confirm before proceeding
      if (!options.interactive && !options.yes) {
        const { proceed } = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: `Generate data for ${selectedObjects.length} objects?`,
          default: true
        }]);
        
        if (!proceed) {
          console.log(chalk.yellow('Operation cancelled'));
          return;
        }
      }
      
      // Generate and load data
      console.log(chalk.yellow('🔄 Generating and loading data...'));
      const results = await dataLoadService.executeGenerationPlan(generationPlan);
      
      // Display results
      console.log(chalk.green('✅ Data seeding completed!'));
      results.forEach(result => {
        const status = result.recordsFailed > 0 ? chalk.yellow('⚠️') : chalk.green('✅');
        console.log(`${status} ${result.objectName}: ${result.recordsCreated} created, ${result.recordsFailed} failed`);
      });
      
    } catch (error) {
      console.error(chalk.red('❌ Seeding failed:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });