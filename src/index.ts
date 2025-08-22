#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { discoverCommand } from './commands/discover';
import { seedCommand } from './commands/seed';
import { configCommand } from './commands/config';

const packageJson = require('../package.json');

program
  .name('sf-seed')
  .description('CLI tool to discover Salesforce sandbox data models and generate realistic sample data')
  .version(packageJson.version);

program
  .addCommand(discoverCommand)
  .addCommand(seedCommand)
  .addCommand(configCommand);

program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
  process.exit(1);
});

if (process.argv.length === 2) {
  program.help();
}

program.parse(process.argv);