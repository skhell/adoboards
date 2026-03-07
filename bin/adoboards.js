#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('adoboards')
  .description('Git-like CLI for Azure DevOps Boards with AI generation')
  .version('0.1.0');

program
  .command('config')
  .description('Interactive setup wizard - org, secrets, AI provider, team capacity')
  .option('--secrets <backend>', 'Set secrets backend directly (keepass / keytar / env)')
  .action(async (opts) => {
    const { default: configCommand } = await import('../src/commands/config.js');
    await configCommand(opts);
  });

program
  .command('clone <url>')
  .description('Clone work items from an Azure DevOps project (e.g. https://dev.azure.com/org/project)')
  .option('--area <path>', 'Clone only items under this area path and all sub-areas beneath it')
  .option('--assignee <users>', 'Filter by assignee: @me, user@company.com, or comma-separated list')
  .option('--since <date>', 'Only items changed since this date (default: Jan 1 of current year)', '')
  .option('--all', 'Include Closed/Removed items and all history (no date, state, or assignee filter)')
  .action(async (url, opts) => {
    const { default: cloneCommand } = await import('../src/commands/clone.js');
    await cloneCommand(url, opts);
  });

program.parse();
