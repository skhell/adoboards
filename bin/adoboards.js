#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('adoboards')
  .description('Git-like CLI for Azure DevOps Boards with AI generation support')
  .version(version);

program
  .command('config')
  .description('Interactive setup wizard - org, secrets, AI provider, team capacity')
  .option('--secrets <backend>', 'Set secrets backend directly (keepass / keytar / env)')
  .action(async (opts) => {
    const { default: configCommand } = await import('../src/commands/config.js');
    await configCommand(opts);
  });

program
  .command('clone [url]')
  .description('Clone work items from an Azure DevOps project (e.g. https://dev.azure.com/org/project). URL defaults to orgUrl+project from config.')
  .option('--area <path>', 'Clone only items under this area path and all sub-areas beneath it')
  .option('--iteration <path>', 'Filter iterations to this root path (e.g. "Project\\TeamA")')
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
  .command('unstage <files...>')
  .description('Remove files from staging area (use . to clear all staged files)')
  .action(async (files) => {
    const { unstage } = await import('../src/commands/unstage.js');
    await unstage(files);
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
  .option('--force', 'Overwrite local edits with remote state - discards all uncommitted changes (like git checkout .)')
  .action(async (opts) => {
    const { default: pullCommand } = await import('../src/commands/pull.js');
    await pullCommand(opts);
  });

program
  .command('gen <idea>')
  .description('Generate work items from an idea (inline text or idea file name from ~/.adoboards/gen/YEAR/)')
  .option('--type <type>', 'Generation type: hierarchy, epic, feature, story (default: hierarchy)')
  .option('--parent <id>', 'Parent work item ID (required for feature and story)')
  .option('--area <path>', 'Override area path')
  .option('--dir <path>', 'Output directory (default: current directory)')
  .option('--provider <name>', 'AI provider: anthropic, openai, gemini, azure-openai, github-copilot')
  .option('--assignee <email>', 'Assignee email (default: user email from config)')
  .option('--project <path>', 'adoboards project root (default: cwd or global defaultProjectPath)')
  .addHelpText('after', `
Examples:
  adoboards gen "add user login with OAuth"                         inline text
  adoboards gen feature-01.md --type feature --project ~/path/proj  name -> ~/.adoboards/gen/YEAR/
  adoboards gen ./ideas/feature-01.md --project ~/path/proj         relative path
  adoboards gen ~/Documents/ideas/feature-01.md                     absolute path

Idea resolution order:
  1. Absolute or ~/ path          -> read file directly
  2. Relative path (contains /)   -> resolve from current directory
  3. Name (no slashes, .md)       -> cwd first, then ~/.adoboards/gen/YEAR/
  4. Plain text                   -> used as-is

Run "adoboards config" to set a default project path and provider-specific tips.`)
  .action(async (idea, opts) => {
    const { default: genCommand } = await import('../src/commands/gen.js');
    await genCommand(idea, opts);
  });

program
  .command('optimize [path]')
  .description('AI-optimize work item content (descriptions, acceptance criteria)')
  .option('--apply', 'Write changes to files (default: preview only)')
  .option('--provider <name>', 'AI provider: anthropic, openai, gemini, azure-openai')
  .action(async (path, opts) => {
    const { default: optimizeCommand } = await import('../src/commands/optimize.js');
    await optimizeCommand(path, opts);
  });

program
  .command('plan')
  .description('AI-powered sprint planning - distribute unassigned stories across sprints')
  .option('--apply', 'Apply sprint assignments to files')
  .option('--team-size <n>', 'Override team size')
  .option('--velocity <n>', 'Override velocity per person per sprint')
  .option('--provider <name>', 'AI provider: anthropic, openai, gemini, azure-openai')
  .action(async (opts) => {
    const { default: planCommand } = await import('../src/commands/plan.js');
    await planCommand(opts);
  });

program
  .command('report')
  .description('Generate sprint summary from local files (no API calls)')
  .option('--sprint <name>', 'Sprint name or number (default: overview of all sprints)')
  .action(async (opts) => {
    const { default: reportCommand } = await import('../src/commands/report.js');
    reportCommand(opts);
  });

program
  .command('diff [file]')
  .description('Field-level diff between local files and last known remote state')
  .action(async (file) => {
    const { default: diffCommand } = await import('../src/commands/diff.js');
    diffCommand(file);
  });

program.parse();
