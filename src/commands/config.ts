import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigService } from '../services/config';

export const configCommand = new Command('config')
  .description('Manage configuration settings and presets')
  .addCommand(
    new Command('set')
      .description('Set configuration values')
      .argument('<key>', 'Configuration key (e.g., salesforce.loginUrl)')
      .argument('<value>', 'Configuration value')
      .action(async (key: string, value: string) => {
        try {
          const configService = new ConfigService();
          await configService.set(key, value);
          console.log(chalk.green(`✅ Set ${key} = ${value}`));
        } catch (error) {
          console.error(chalk.red('❌ Failed to set configuration:'), error instanceof Error ? error.message : error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('get')
      .description('Get configuration values')
      .argument('[key]', 'Configuration key (omit to show all)')
      .action(async (key?: string) => {
        try {
          const configService = new ConfigService();
          if (key) {
            const value = await configService.get(key);
            console.log(value);
          } else {
            const config = await configService.getAll();
            console.log(JSON.stringify(config, null, 2));
          }
        } catch (error) {
          console.error(chalk.red('❌ Failed to get configuration:'), error instanceof Error ? error.message : error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('presets')
      .description('Manage object selection presets')
      .addCommand(
        new Command('list')
          .description('List available presets')
          .action(async () => {
            try {
              const configService = new ConfigService();
              const presets = await configService.getPresets();
              if (presets.length === 0) {
                console.log(chalk.yellow('No presets configured'));
                return;
              }
              
              console.log(chalk.blue('Available presets:'));
              presets.forEach(preset => {
                console.log(`  ${chalk.green(preset.name)}: ${preset.description}`);
                console.log(`    Objects: ${preset.includedObjects.join(', ')}`);
              });
            } catch (error) {
              console.error(chalk.red('❌ Failed to list presets:'), error instanceof Error ? error.message : error);
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command('create')
          .description('Create a new preset')
          .option('-n, --name <name>', 'Preset name')
          .option('-d, --description <description>', 'Preset description')
          .option('-o, --objects <objects>', 'Comma-separated list of objects')
          .action(async (options) => {
            try {
              const configService = new ConfigService();
              
              let name = options.name;
              let description = options.description;
              let objects = options.objects;
              
              if (!name || !description || !objects) {
                const answers = await inquirer.prompt([
                  {
                    type: 'input',
                    name: 'name',
                    message: 'Preset name:',
                    when: !name,
                    validate: (input: string) => input.length > 0 || 'Name is required'
                  },
                  {
                    type: 'input',
                    name: 'description',
                    message: 'Preset description:',
                    when: !description,
                    validate: (input: string) => input.length > 0 || 'Description is required'
                  },
                  {
                    type: 'input',
                    name: 'objects',
                    message: 'Objects (comma-separated):',
                    when: !objects,
                    validate: (input: string) => input.length > 0 || 'Objects are required'
                  }
                ]);
                
                name = name || answers.name;
                description = description || answers.description;
                objects = objects || answers.objects;
              }
              
              await configService.createPreset({
                name,
                description,
                includedObjects: objects.split(',').map((obj: string) => obj.trim())
              });
              
              console.log(chalk.green(`✅ Created preset '${name}'`));
            } catch (error) {
              console.error(chalk.red('❌ Failed to create preset:'), error instanceof Error ? error.message : error);
              process.exit(1);
            }
          })
      )
  );