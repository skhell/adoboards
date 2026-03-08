import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import { readStaged, writeStaged, findProjectRoot } from '../core/state.js';

export default function addCommand(files) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const staged = new Set(readStaged(root));
  const toAdd = [];
  const errors = [];

  for (const file of files) {
    if (file === '.') {
      // Stage all work item .md files from areas/
      const areasDir = join(root, 'areas');
      const mdFiles = findMdRecursive(areasDir, root);
      for (const f of mdFiles) toAdd.push(f);
    } else {
      // Resolve path relative to project root
      const absPath = resolve(file);
      const relPath = relative(root, absPath);

      if (!existsSync(absPath)) {
        errors.push({ path: file, issue: 'file not found' });
        continue;
      }

      const stat = statSync(absPath);
      if (stat.isDirectory()) {
        const mdFiles = findMdRecursive(absPath, root);
        for (const f of mdFiles) toAdd.push(f);
      } else if (relPath.endsWith('.md') && !relPath.endsWith('.remote.md')) {
        toAdd.push(relPath);
      }
    }
  }

  // Validate each file before staging
  const validTypes = ['Epic', 'Feature', 'Story', 'Bug', 'Task', 'Issue'];
  const validToStage = [];

  for (const filePath of toAdd) {
    if (staged.has(filePath)) continue; // already staged

    const absPath = join(root, filePath);
    try {
      const content = readFileSync(absPath, 'utf-8');
      const { data } = matter(content);

      if (!data.type) {
        errors.push({ path: filePath, issue: 'missing type in frontmatter', fix: 'add type: Story (or Epic, Feature, Bug, Task)' });
        continue;
      }
      if (!validTypes.includes(data.type)) {
        errors.push({ path: filePath, issue: `unknown type "${data.type}"`, fix: `use one of: ${validTypes.join(', ')}` });
        continue;
      }
      if (data.id == null) {
        errors.push({ path: filePath, issue: 'missing id in frontmatter', fix: 'add id: pending (for new items)' });
        continue;
      }
      if (!data.title || !String(data.title).trim()) {
        errors.push({ path: filePath, issue: 'empty title', fix: 'fill in the title field' });
        continue;
      }

      validToStage.push(filePath);
    } catch {
      errors.push({ path: filePath, issue: 'cannot parse frontmatter', fix: 'check YAML syntax in the --- block' });
    }
  }

  // Only stage valid files
  for (const f of validToStage) {
    staged.add(f);
  }

  writeStaged(root, [...staged]);

  if (validToStage.length) {
    console.log(chalk.green(`\n  ${validToStage.length} file${validToStage.length !== 1 ? 's' : ''} staged (${staged.size} total)`));
  }

  if (errors.length) {
    console.log(chalk.red(`\n  ${errors.length} file${errors.length !== 1 ? 's' : ''} rejected:\n`));
    for (const e of errors) {
      console.log(chalk.red(`    ${e.path}`));
      console.log(chalk.red(`      Error: ${e.issue}`));
      if (e.fix) console.log(chalk.yellow(`      Fix:   ${e.fix}`));
      console.log();
    }
  }

  if (!validToStage.length && !errors.length) {
    console.log(chalk.dim('\n  Nothing new to stage.\n'));
  }
}

function findMdRecursive(dir, root) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry === '.adoboards' || entry === 'node_modules' || entry === '.git') continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findMdRecursive(fullPath, root));
    } else if (entry.endsWith('.md') && !entry.endsWith('.remote.md')) {
      results.push(relative(root, fullPath));
    }
  }
  return results;
}
