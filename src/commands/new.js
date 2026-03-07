import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import { readConfig } from '../core/state.js';

const VALID_TYPES = ['epic', 'feature', 'story', 'bug', 'task'];

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export default function newCommand(type, opts = {}) {
  const config = readConfig('.');
  if (!config) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const typeLower = type.toLowerCase();
  if (!VALID_TYPES.includes(typeLower)) {
    console.error(chalk.red(`Invalid type: ${type}. Choose: ${VALID_TYPES.join(', ')}`));
    process.exit(1);
  }

  // Load template
  const templateName = typeLower;
  const globalTemplateDir = new URL('../../templates', import.meta.url).pathname;

  let templatePath;
  const localTemplatePath = join('.', 'templates', `${templateName}.md`);
  if (existsSync(localTemplatePath)) {
    templatePath = localTemplatePath;
  } else if (existsSync(join(globalTemplateDir, `${templateName}.md`))) {
    templatePath = join(globalTemplateDir, `${templateName}.md`);
  } else {
    console.error(chalk.red(`Template not found: ${templateName}.md`));
    process.exit(1);
  }

  let content = readFileSync(templatePath, 'utf-8');

  // Set title if provided
  const title = opts.title || '';
  content = content.replace(/^title:\s*""/m, `title: "${title}"`);

  // Set area from flag or config default
  const area = opts.area || config.areaFilter || '';
  if (area) {
    content = content.replace(/^area:\s*""/m, `area: "${area}"`);
  }

  // Set iteration if provided
  if (opts.iteration) {
    content = content.replace(/^iteration:\s*""/m, `iteration: "${opts.iteration}"`);
  }

  // Set assignee from config (resolved during clone)
  const assignee = opts.assignee || config.userEmail || '';
  if (assignee) {
    content = content.replace(/^assignee:\s*""/m, `assignee: "${assignee}"`);
  }

  // Set parent if provided
  if (opts.parent) {
    content = content.replace(/^parent:$/m, `parent: ${opts.parent}`);
  }

  // Build filename
  const prefix = { epic: 'EPIC', feature: 'FEAT', story: 'STORY', bug: 'BUG', task: 'TASK' }[typeLower];
  const slug = title ? slugify(title) : 'untitled';
  const fileName = `${prefix}-pending-${slug}.md`;

  // Determine output directory
  const outputDir = opts.dir || '.';
  mkdirSync(outputDir, { recursive: true });
  const filePath = join(outputDir, fileName);

  if (existsSync(filePath)) {
    console.error(chalk.red(`File already exists: ${filePath}`));
    process.exit(1);
  }

  writeFileSync(filePath, content, 'utf-8');

  console.log(chalk.green(`\n  Created: ${filePath}`));
  console.log(chalk.dim(`  Edit the file, then: adoboards add ${filePath} && adoboards push\n`));
}
