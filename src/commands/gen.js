import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import { generate } from '../api/ai.js';
import { readConfig, findProjectRoot } from '../core/state.js';

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export default async function genCommand(idea, opts = {}) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const config = readConfig(root);
  const type = (opts.type || 'hierarchy').toLowerCase();
  const validTypes = ['hierarchy', 'epic', 'feature', 'story'];
  if (!validTypes.includes(type)) {
    console.error(chalk.red(`Invalid type: ${type}. Choose: ${validTypes.join(', ')}`));
    process.exit(1);
  }

  // Require parent for feature and story
  if ((type === 'feature' || type === 'story') && !opts.parent) {
    console.error(chalk.red(`--parent <id> is required for --type ${type}`));
    process.exit(1);
  }

  const area = opts.area || config.areaFilter || config.project || '';
  const assignee = config.userEmail || '';
  const outputDir = opts.dir || '.';

  const variables = {
    idea,
    area,
    assignee,
    parent: opts.parent || '',
  };

  console.log(chalk.bold(`\n  Generating ${type} from your idea...\n`));
  console.log(chalk.dim(`  Idea: ${idea}`));
  console.log(chalk.dim(`  Type: ${type}`));
  console.log(chalk.dim(`  Area: ${area}`));
  if (opts.parent) console.log(chalk.dim(`  Parent: ${opts.parent}`));
  console.log();

  process.stdout.write('  Calling AI... ');
  let result;
  try {
    result = await generate(`gen-${type}`, variables, { provider: opts.provider });
  } catch (err) {
    console.log(chalk.red('failed'));
    console.error(chalk.red(`\n  ${err.message}\n`));
    process.exit(1);
  }
  console.log(chalk.green('done\n'));

  // Parse the AI response into individual files
  const files = parseGeneratedFiles(result);

  if (!files.length) {
    console.error(chalk.red('  AI returned no valid work items. Try rephrasing your idea.\n'));
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });

  let written = 0;
  for (const fileContent of files) {
    try {
      const { data } = matter(fileContent);
      if (!data.type || !data.title) continue;

      const prefix = {
        Epic: 'EPIC', Feature: 'FEAT', Story: 'STORY',
        Bug: 'BUG', Task: 'TASK',
      }[data.type] || data.type.toUpperCase();

      const slug = slugify(data.title);
      const fileName = `${prefix}-pending-${slug}.md`;
      const filePath = join(outputDir, fileName);

      if (existsSync(filePath)) {
        console.log(chalk.yellow(`  Skipped (exists): ${fileName}`));
        continue;
      }

      writeFileSync(filePath, fileContent, 'utf-8');
      console.log(chalk.green(`  Created: ${fileName}`));
      written++;
    } catch {
      // Skip unparseable output
    }
  }

  console.log(chalk.bold(`\n  Generated ${written} file${written !== 1 ? 's' : ''}.`));
  console.log(chalk.dim(`  Review, edit if needed, then: adoboards add . && adoboards push\n`));
}

/**
 * Parse AI response into individual markdown files.
 * Files are separated by ---FILE--- or by detecting multiple frontmatter blocks.
 */
function parseGeneratedFiles(text) {
  // Strip markdown code fences if AI wrapped the output
  text = text.replace(/^```(?:markdown)?\n?/gm, '').replace(/^```$/gm, '');

  // Try ---FILE--- separator first
  if (text.includes('---FILE---')) {
    return text
      .split('---FILE---')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('---'));
  }

  // Try splitting on multiple frontmatter blocks
  const parts = text.split(/\n(?=---\n(?:id|type):)/);
  if (parts.length > 1) {
    return parts.map((s) => s.trim()).filter((s) => s.startsWith('---'));
  }

  // Single file
  const trimmed = text.trim();
  if (trimmed.startsWith('---')) {
    return [trimmed];
  }

  return [];
}
