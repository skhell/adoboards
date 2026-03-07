import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import { readStaged, writeStaged, readConfig } from '../core/state.js';

export default function addCommand(files) {
  const config = readConfig('.');
  if (!config) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const staged = new Set(readStaged('.'));
  let added = 0;

  for (const file of files) {
    if (file === '.') {
      // Stage all .md files
      const mdFiles = findMarkdownFiles('.', '.');
      for (const f of mdFiles) {
        if (!staged.has(f)) {
          staged.add(f);
          added++;
        }
      }
    } else {
      const resolved = relative('.', resolve(file));
      if (!existsSync(resolved)) {
        console.error(chalk.red(`  File not found: ${file}`));
        continue;
      }

      const stat = statSync(resolved);
      if (stat.isDirectory()) {
        const mdFiles = findMarkdownFiles(resolved, '.');
        for (const f of mdFiles) {
          if (!staged.has(f)) {
            staged.add(f);
            added++;
          }
        }
      } else if (resolved.endsWith('.md') && !resolved.endsWith('.remote.md')) {
        if (!staged.has(resolved)) {
          staged.add(resolved);
          added++;
        }
      }
    }
  }

  // Validate staged files and warn about issues early
  const warnings = [];
  const validTypes = ['Epic', 'Feature', 'Story', 'Bug', 'Task', 'Issue'];

  for (const filePath of staged) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const { data } = matter(content);

      if (!data.type) {
        warnings.push({ path: filePath, issue: 'missing type — not a work item, will be skipped on push' });
      } else if (!validTypes.includes(data.type)) {
        warnings.push({ path: filePath, issue: `unknown type "${data.type}" — use: ${validTypes.join(', ')}` });
      } else if (data.id == null) {
        warnings.push({ path: filePath, issue: 'missing id — set to "pending" for new items' });
      } else if (!data.title) {
        warnings.push({ path: filePath, issue: 'missing title — fill in before push' });
      }
    } catch {
      warnings.push({ path: filePath, issue: 'cannot parse frontmatter' });
    }
  }

  writeStaged('.', [...staged]);
  console.log(chalk.green(`  ${added} file${added !== 1 ? 's' : ''} staged for push (${staged.size} total)`));

  if (warnings.length) {
    console.log(chalk.yellow(`\n  Warnings (fix before push):`));
    for (const w of warnings) console.log(chalk.yellow(`    ${w.path} — ${w.issue}`));
  }
}

function findMarkdownFiles(dir, basePath) {
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
      results.push(...findMarkdownFiles(fullPath, basePath));
    } else if (entry.endsWith('.md') && !entry.endsWith('.remote.md')) {
      results.push(relative(basePath, fullPath));
    }
  }
  return results;
}
