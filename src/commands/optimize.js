import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline';
import chalk from 'chalk';
import { generate } from '../api/ai.js';
import { readConfig, findProjectRoot } from '../core/state.js';

export default async function optimizeCommand(target, opts = {}) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  readConfig(root); // validate project

  // ID-targeting mode: numeric argument
  if (target && /^\d+$/.test(String(target))) {
    await optimizeById(Number(target), root, opts);
    return;
  }

  // Path-based mode (legacy)
  const targetPath = target || '.';
  const files = collectMdFiles(targetPath);

  if (!files.length) {
    console.error(chalk.red('  No markdown files found to optimize.\n'));
    process.exit(1);
  }

  console.log(chalk.bold(`\n  Optimizing ${files.length} file${files.length !== 1 ? 's' : ''}...\n`));
  const { optimized, skipped } = await processFiles(files, opts);

  console.log(chalk.bold(`\n  Optimized: ${optimized}, Skipped: ${skipped}\n`));
}

async function optimizeById(id, root, opts) {
  const matter = (await import('gray-matter')).default;

  // Build index of all work item files
  const allFiles = collectMdFiles(root);
  const index = buildIndex(allFiles, matter);

  const entry = index.byId.get(id);
  if (!entry) {
    console.error(chalk.red(`  No work item found with ID ${id}.\n`));
    process.exit(1);
  }

  const { type } = entry.data;
  console.log(chalk.bold(`\n  Target: [${type}] ${entry.data.title} (#${id})\n`));

  if (type === 'Story' || type === 'Bug' || type === 'Task') {
    // Single item
    await processFiles([entry.filePath], opts);
    printSummary(opts);
    return;
  }

  if (type === 'Feature') {
    const childStories = index.byParent.get(id) || [];
    const storyFiles = childStories.map((e) => e.filePath);

    if (storyFiles.length > 0) {
      console.log(chalk.dim(`  Connected stories: ${storyFiles.length}`));
      const confirmed = await confirm(
        `  Optimize feature #${id} and all ${storyFiles.length} connected stor${storyFiles.length === 1 ? 'y' : 'ies'}?`,
      );
      if (!confirmed) {
        console.log(chalk.yellow('\n  Cancelled.\n'));
        return;
      }
    }

    console.log();
    const files = [entry.filePath, ...storyFiles];
    await processFiles(files, opts);
    printSummary(opts);
    return;
  }

  if (type === 'Epic') {
    const childFeatures = index.byParent.get(id) || [];
    const allStories = childFeatures.flatMap((f) => index.byParent.get(f.data.id) || []);
    const totalChildren = childFeatures.length + allStories.length;

    if (totalChildren > 0) {
      console.log(
        chalk.dim(`  Connected features: ${childFeatures.length}, stories: ${allStories.length}`),
      );
      const confirmed = await confirm(
        `  Optimize epic #${id}, ${childFeatures.length} feature${childFeatures.length === 1 ? '' : 's'}, and ${allStories.length} stor${allStories.length === 1 ? 'y' : 'ies'}?`,
      );
      if (!confirmed) {
        console.log(chalk.yellow('\n  Cancelled.\n'));
        return;
      }
    }

    console.log();
    const files = [
      entry.filePath,
      ...childFeatures.map((e) => e.filePath),
      ...allStories.map((e) => e.filePath),
    ];
    await processFiles(files, opts);
    printSummary(opts);
    return;
  }

  // Unknown type - optimize just the single item
  await processFiles([entry.filePath], opts);
  printSummary(opts);
}

function buildIndex(files, matter) {
  const byId = new Map();
  const byParent = new Map();

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const { data } = matter(content);
      if (!data.id || !data.type) continue;

      const entry = { filePath, data };
      byId.set(data.id, entry);

      if (data.parent != null) {
        if (!byParent.has(data.parent)) byParent.set(data.parent, []);
        byParent.get(data.parent).push(entry);
      }
    } catch {
      // skip unreadable files
    }
  }

  return { byId, byParent };
}

async function processFiles(files, opts) {
  const matter = (await import('gray-matter')).default;
  let optimized = 0;
  let skipped = 0;

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');

    try {
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
      skipped++;
      continue;
    }

    writeFileSync(filePath, result, 'utf-8');
    console.log(chalk.green('applied'));
    optimized++;
  }

  return { optimized, skipped };
}

function printSummary() {
  console.log();
}

function confirm(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.bold(`${question} [Y/n] `), (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === '' || a === 'y' || a === 'yes');
    });
  });
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
