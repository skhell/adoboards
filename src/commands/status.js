import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import matter from 'gray-matter';
import { readRefs, readStaged, readConfig, findProjectRoot } from '../core/state.js';

export default function statusCommand() {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const config = readConfig(root);
  const refs = readRefs(root);
  const staged = new Set(readStaged(root));

  // Build reverse map: path -> id
  const pathToId = {};
  for (const [id, ref] of Object.entries(refs)) {
    pathToId[ref.path] = Number(id);
  }

  // Find all work item .md files from project root
  const mdFiles = findWorkItemFiles(root);
  const trackedPaths = new Set(Object.values(refs).map((r) => r.path));

  const modified = [];
  const pending = [];
  const untracked = [];
  const stagedList = [];

  const moved = [];

  for (const filePath of mdFiles) {
    const id = pathToId[filePath];

    if (id == null) {
      // Not in refs by path - check frontmatter for id
      try {
        const content = readFileSync(join(root, filePath), 'utf-8');
        const { data } = matter(content);
        if (data.id === 'pending') {
          pending.push(filePath);
        } else if (data.id != null && refs[data.id]) {
          // File has a tracked ID but at a different path - it was moved
          const ref = refs[data.id];
          const hasFieldChanges = hasChanges(data, content, ref.fields);
          moved.push({ path: filePath, oldPath: ref.path, id: data.id, alsoModified: hasFieldChanges });
        }
        // Files without id are not work items - skip silently
      } catch {
        // Skip unreadable files
      }
      continue;
    }

    // Check if modified by comparing frontmatter fields
    try {
      const content = readFileSync(join(root, filePath), 'utf-8');
      const { data } = matter(content);
      const ref = refs[id];
      const refFields = ref.fields;

      if (hasChanges(data, content, refFields)) {
        modified.push({ path: filePath, id });
      }
    } catch {
      // File might be corrupted, skip
    }
  }

  // Check for deleted (in refs but file gone and not moved)
  const movedIds = new Set(moved.map((m) => String(m.id)));
  const deleted = [];
  const mdFilesSet = new Set(mdFiles);
  for (const [id, ref] of Object.entries(refs)) {
    if (!mdFilesSet.has(ref.path) && !movedIds.has(id)) {
      deleted.push({ path: ref.path, id: Number(id) });
    }
  }

  // Categorize staged
  for (const file of mdFiles) {
    if (staged.has(file)) {
      stagedList.push(file);
    }
  }

  // Output
  console.log(chalk.bold(`\n  ${config.project} - status\n`));

  const rows = [];

  for (const f of stagedList) {
    rows.push([chalk.green('staged'), chalk.green(f), chalk.dim('-')]);
  }
  for (const m of modified) {
    rows.push([chalk.yellow('modified'), chalk.yellow(m.path), chalk.yellow(m.id)]);
  }
  for (const p of pending) {
    rows.push([chalk.cyan('new'), chalk.cyan(p), chalk.cyan('pending')]);
  }
  for (const m of moved) {
    const label = m.alsoModified ? 'moved + modified' : 'moved';
    rows.push([chalk.magenta(label), chalk.magenta(m.path), chalk.magenta(m.id)]);
  }
  for (const d of deleted) {
    rows.push([chalk.red('deleted'), chalk.red(d.path), chalk.red(d.id)]);
  }

  if (!rows.length) {
    console.log(chalk.dim('  Nothing changed.\n'));
    return;
  }

  const table = new Table({
    head: [chalk.bold('Status'), chalk.bold('File'), chalk.bold('ID')],
    style: { head: [], border: [], 'padding-left': 1, 'padding-right': 1 },
    chars: {
      top: '-', 'top-mid': '+', 'top-left': '  +', 'top-right': '+',
      bottom: '-', 'bottom-mid': '+', 'bottom-left': '  +', 'bottom-right': '+',
      left: '  |', 'left-mid': '  +', mid: '-', 'mid-mid': '+',
      right: '|', 'right-mid': '+', middle: '|',
    },
  });

  for (const row of rows) table.push(row);
  console.log(table.toString());

  if (moved.length) {
    console.log(chalk.magenta('\n  Moved files:'));
    for (const m of moved) {
      console.log(chalk.dim(`    ${m.oldPath}`));
      console.log(chalk.magenta(`    -> ${m.path}`));
    }
    console.log(chalk.dim('\n  Tip: use "adoboards add" then "adoboards push" to update refs.'));
  }

  console.log();
}

function hasChanges(frontmatter, rawContent, refFields) {
  if (frontmatter.title !== refFields['System.Title']) return true;
  if (frontmatter.state !== refFields['System.State']) return true;
  if (frontmatter.area !== refFields['System.AreaPath']) return true;
  if ((frontmatter.iteration || '') !== (refFields['System.IterationPath'] || '')) return true;
  const refPoints = refFields['Microsoft.VSTS.Scheduling.StoryPoints'];
  if (frontmatter.storyPoints != null && frontmatter.storyPoints !== refPoints) return true;
  const refBv = refFields['Microsoft.VSTS.Common.BusinessValue'];
  if (frontmatter.businessValue != null && frontmatter.businessValue !== refBv) return true;

  // Body changes
  const { content: body } = matter(rawContent);
  const sections = parseSections(body);
  const refDesc = htmlToPlainText(refFields['System.Description'] || '');
  const refAc = htmlToPlainText(refFields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '');
  const localDesc = (sections.description || '').trim();
  const localAc = (sections.acceptanceCriteria || '').trim();
  if (localDesc !== refDesc) return true;
  if (localAc !== refAc) return true;

  return false;
}

function parseSections(body) {
  const result = {};
  const parts = body.split(/^## /m).filter(Boolean);
  for (const section of parts) {
    const newlineIdx = section.indexOf('\n');
    if (newlineIdx === -1) continue;
    const heading = section.slice(0, newlineIdx).trim().toLowerCase();
    const content = section.slice(newlineIdx + 1).trim();
    if (heading === 'description') {
      result.description = content === '_No description_' ? '' : content;
    } else if (heading === 'acceptance criteria') {
      result.acceptanceCriteria = content;
    } else if (heading === 'repro steps') {
      result.reproSteps = content === '_No repro steps_' ? '' : content;
    } else if (heading === 'system info') {
      result.systemInfo = content;
    }
  }
  return result;
}

function htmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div)>/gi, '\n')
    .replace(/<\/?(b|strong)>/gi, '**')
    .replace(/<\/?(i|em)>/gi, '_')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Find work item markdown files from project root.
 * Only scans areas/ directory (where work items live).
 * Skips templates/, .adoboards/, node_modules/, .git/.
 * Returns paths relative to root.
 */
function findWorkItemFiles(root) {
  const areasDir = join(root, 'areas');
  return findMdRecursive(areasDir, root);
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
