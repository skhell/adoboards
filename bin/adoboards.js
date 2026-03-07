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

program
  .command('new <type>')
  .description('Create a new work item from template (epic, feature, story, bug, task)')
  .option('--title <title>', 'Set the work item title')
  .option('--area <path>', 'Set the area path')
  .option('--iteration <path>', 'Set the iteration path')
  .option('--parent <id>', 'Set the parent work item ID')
  .option('--assignee <email>', 'Set assignee (default: your email from clone)')
  .option('--dir <path>', 'Output directory (default: current directory)')
  .action(async (type, opts) => {
    const { default: newCommand } = await import('../src/commands/new.js');
    newCommand(type, opts);
  });

program
  .command('status')
  .description('Show modified, staged, new, and deleted work items')
  .action(async () => {
    const { default: statusCommand } = await import('../src/commands/status.js');
    statusCommand();
  });

program
  .command('add <files...>')
  .description('Stage files for push (supports individual files, directories, or . for all)')
  .action(async (files) => {
    const { default: addCommand } = await import('../src/commands/add.js');
    addCommand(files);
  });

program
  .command('push [file]')
  .description('Push staged work items to Azure DevOps (or push a single file directly)')
  .action(async (file) => {
    const { default: pushCommand } = await import('../src/commands/push.js');
    await pushCommand(file);
  });

program
  .command('pull')
  .description('Pull remote changes from Azure DevOps since last sync')
  .action(async () => {
    const { default: pullCommand } = await import('../src/commands/pull.js');
    await pullCommand();
  });

program.parse();
