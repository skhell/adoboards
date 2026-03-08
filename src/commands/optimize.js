import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import chalk from 'chalk';
import { generate } from '../api/ai.js';
import { readConfig, findProjectRoot } from '../core/state.js';

export default async function optimizeCommand(path, opts = {}) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  readConfig(root); // validate project

  // Collect files to optimize
  const targetPath = path || '.';
  const files = collectMdFiles(targetPath);

  if (!files.length) {
    console.error(chalk.red('  No markdown files found to optimize.\n'));
    process.exit(1);
  }

  console.log(chalk.bold(`\n  Optimizing ${files.length} file${files.length !== 1 ? 's' : ''}...\n`));

  let optimized = 0;
  let skipped = 0;

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');

    // Skip non-work-item files
    try {
      const matter = (await import('gray-matter')).default;
      const { data } = matter(content);
      if (!data.type || !data.id) {
        skipped++;
        continue;
      }
    } catch {
      skipped++;
      continue;
    }

    process.stdout.write(`  ${relative('.', filePath)}... `);

    let result;
    try {
      result = await generate('optimize', { content }, { provider: opts.provider });
    } catch (err) {
      console.log(chalk.red('failed'));
      console.error(chalk.red(`    ${err.message}`));
      continue;
    }

    // Strip code fences if AI wrapped the output
    result = result.replace(/^```(?:markdown)?\n?/gm, '').replace(/^```$/gm, '').trim();

    if (!result.startsWith('---')) {
      console.log(chalk.yellow('skipped (invalid AI output)'));
      continue;
    }

    if (opts.apply) {
      writeFileSync(filePath, result, 'utf-8');
      console.log(chalk.green('applied'));
      optimized++;
    } else {
      // Show diff preview
      console.log(chalk.cyan('preview'));
      showDiff(content, result);
      optimized++;
    }
  }

  console.log(chalk.bold(`\n  Optimized: ${optimized}, Skipped: ${skipped}`));
  if (!opts.apply && optimized > 0) {
    console.log(chalk.dim(`  Run with --apply to write changes to files.\n`));
  } else {
    console.log();
  }
}

function showDiff(original, optimized) {
  const origLines = original.split('\n');
  const optLines = optimized.split('\n');

  // Simple line-by-line diff - show only changed lines
  const maxLines = Math.max(origLines.length, optLines.length);
  let inFrontmatter = false;
  let changes = 0;

  for (let i = 0; i < maxLines; i++) {
    const orig = origLines[i] || '';
    const opt = optLines[i] || '';

    // Skip frontmatter (should be identical)
    if (orig === '---' && i === 0) { inFrontmatter = true; continue; }
    if (inFrontmatter && orig === '---') { inFrontmatter = false; continue; }
    if (inFrontmatter) continue;

    if (orig !== opt) {
      if (orig && !opt) {
        console.log(chalk.red(`    - ${orig}`));
      } else if (!orig && opt) {
        console.log(chalk.green(`    + ${opt}`));
      } else {
        console.log(chalk.red(`    - ${orig}`));
        console.log(chalk.green(`    + ${opt}`));
      }
      changes++;
      if (changes > 30) {
        console.log(chalk.dim('    ... (truncated)'));
        break;
      }
    }
  }

  if (!changes) {
    console.log(chalk.dim('    No changes detected.'));
  }
}

function collectMdFiles(target) {
  const stat = statSync(target, { throwIfNoEntry: false });
  if (!stat) return [];

  if (stat.isFile() && target.endsWith('.md') && !target.endsWith('.remote.md')) {
    return [target];
  }

  if (stat.isDirectory()) {
    const results = [];
    const entries = readdirSync(target);
    for (const entry of entries) {
      if (entry === '.adoboards' || entry === 'node_modules' || entry === '.git' || entry === 'templates') continue;
      const fullPath = join(target, entry);
      const s = statSync(fullPath);
      if (s.isDirectory()) {
        results.push(...collectMdFiles(fullPath));
      } else if (entry.endsWith('.md') && !entry.endsWith('.remote.md')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  return [];
}
