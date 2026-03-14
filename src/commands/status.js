import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import { readRefs, readStaged, readConfig, findProjectRoot } from '../core/state.js';

// Quote path for shell copy-paste if it contains spaces
const q = (p) => p.includes(' ') ? `"${p}"` : p;

export default function statusCommand() {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const config = readConfig(root);
  const refs = readRefs(root);
  const staged = new Set(readStaged(root));

  // Check structural integrity - areas/ folder must exist
  const areasDir = join(root, 'areas');
  if (!existsSync(areasDir)) {
    console.log(chalk.bold(`\n  ${config.project} - status\n`));
    console.log(chalk.red('  Error: areas/ folder is missing or was renamed.'));
    console.log(chalk.red('  This folder is required for adoboards to work.'));
    console.log(chalk.yellow('  Fix: rename it back to "areas/" or run "adoboards pull" to restore.\n'));
    process.exit(1);
  }

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
          if (!staged.has(filePath)) pending.push(filePath);
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

    // Check if modified - hash first (catches any change), fall back to semantic
    try {
      const content = readFileSync(join(root, filePath), 'utf-8');
      const ref = refs[id];
      const currentHash = createHash('sha256').update(content).digest('hex');

      if (ref.hash) {
        if (currentHash !== ref.hash) modified.push({ path: filePath, id });
      } else {
        // No stored hash (old clone) - fall back to semantic field comparison
        const { data } = matter(content);
        if (hasChanges(data, content, ref.fields)) modified.push({ path: filePath, id });
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

  // Check for renamed structural folders
  const folderWarnings = checkStructuralFolders(root);

  // Output - git style
  const projectLabel = config.project ? chalk.bold(config.project) : chalk.bold('adoboards');
  console.log(`\n${projectLabel} · ${chalk.dim(config.orgUrl || '')}\n`);

  const totalChanges = stagedList.length + modified.length + pending.length + moved.length + deleted.length;

  if (!totalChanges && !folderWarnings.length) {
    console.log(chalk.dim('  Nothing to commit, working tree is clean.\n'));
    return;
  }

  // Helper to print a section
  function printSection(label, color, items, formatLine) {
    if (!items.length) return;
    console.log(color(`${label}:`));
    for (const item of items) console.log('  ' + formatLine(item));
    console.log();
  }

  // Staged
  printSection('Changes staged for push', chalk.green, stagedList, (f) =>
    chalk.green(`staged:    ${q(f)}`)
  );

  // Modified
  printSection('Changes not staged for push', chalk.yellow, modified, (m) =>
    chalk.yellow(`modified:  ${q(m.path)}`) + chalk.dim(`  #${m.id}`)
  );

  // New (pending)
  if (pending.length) {
    console.log(chalk.cyan('New work items (pending push):'));
    console.log(chalk.dim('  (use "adoboards add <file>" to stage, "adoboards push" to create in ADO)\n'));
    for (const f of pending) console.log('  ' + chalk.cyan(`new file:  ${q(f)}`));
    console.log();
  }

  // Moved
  if (moved.length) {
    console.log(chalk.magenta('Moved work items:'));
    for (const m of moved) {
      const label = m.alsoModified ? 'moved+mod: ' : 'moved:     ';
      console.log('  ' + chalk.magenta(`${label}${q(m.path)}`) + chalk.dim(`  #${m.id}`));
      console.log('  ' + chalk.dim(`           (was: ${q(m.oldPath)})`));
    }
    console.log();
  }

  // Deleted
  printSection('Deleted work items:', chalk.red, deleted, (d) =>
    chalk.red(`deleted:   ${q(d.path)}`) + chalk.dim(`  #${d.id}`)
  );

  // Folder warnings
  if (folderWarnings.length) {
    console.log(chalk.red('Structural warnings:'));
    for (const w of folderWarnings) console.log('  ' + chalk.red(`warning:   ${q(w.path)}`) + chalk.dim(`  (${w.issue})`));
    console.log();
  }

  // Summary line
  const parts = [];
  if (stagedList.length)  parts.push(chalk.green(`${stagedList.length} staged`));
  if (modified.length)    parts.push(chalk.yellow(`${modified.length} modified`));
  if (pending.length)     parts.push(chalk.cyan(`${pending.length} new`));
  if (moved.length)       parts.push(chalk.magenta(`${moved.length} moved`));
  if (deleted.length)     parts.push(chalk.red(`${deleted.length} deleted`));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(parts.join(chalk.dim('  ·  ')));
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

  const bodyChecks = [
    { local: sections.description, remote: refFields['System.Description'] },
    { local: sections.acceptanceCriteria, remote: refFields['Microsoft.VSTS.Common.AcceptanceCriteria'] },
    { local: sections.reproSteps, remote: refFields['Microsoft.VSTS.TCM.ReproSteps'] },
    { local: sections.systemInfo, remote: refFields['Microsoft.VSTS.TCM.SystemInfo'] },
  ];

  for (const check of bodyChecks) {
    const localText = (check.local || '').trim();
    const remoteText = htmlToPlainText(check.remote || '');
    if (localText !== remoteText) return true;
  }

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

/**
 * Scan area folders for unknown subfolders that might be renamed backlog/iterations.
 */
function checkStructuralFolders(root) {
  const warnings = [];
  const areasDir = join(root, 'areas');
  const VALID_BUCKETS = ['backlog', 'iterations'];

  // Recursively check area directories for structural folders
  function checkDir(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    const subdirs = entries.filter((e) => {
      try { return statSync(join(dir, e)).isDirectory(); } catch { return false; }
    });

    // Check if this directory has any valid bucket folders
    const hasBucket = subdirs.some((d) => VALID_BUCKETS.includes(d));
    const hasUnknown = subdirs.filter((d) => !VALID_BUCKETS.includes(d));

    if (hasBucket) {
      // Area level - check for suspicious siblings of backlog/iterations
      for (const d of hasUnknown) {
        const dist = levenshteinDist(d.toLowerCase(), 'backlog');
        const dist2 = levenshteinDist(d.toLowerCase(), 'iterations');
        if ((dist > 0 && dist <= 3) || (dist2 > 0 && dist2 <= 3)) {
          const match = dist <= dist2 ? 'backlog' : 'iterations';
          const relPath = relative(root, join(dir, d));
          warnings.push({ path: relPath, issue: `looks like misspelled "${match}"` });
        }
      }
    } else if (subdirs.length > 0 && dir !== areasDir) {
      // No bucket folder found at this level - could be nested area or renamed
      // Check if any subfolder looks like a misspelled bucket
      for (const d of subdirs) {
        const dist = levenshteinDist(d.toLowerCase(), 'backlog');
        const dist2 = levenshteinDist(d.toLowerCase(), 'iterations');
        if ((dist > 0 && dist <= 3) || (dist2 > 0 && dist2 <= 3)) {
          const match = dist <= dist2 ? 'backlog' : 'iterations';
          const relPath = relative(root, join(dir, d));
          warnings.push({ path: relPath, issue: `looks like misspelled "${match}"` });
        } else {
          // Recurse into subfolders (might be nested area path)
          checkDir(join(dir, d));
        }
      }
    }
  }

  checkDir(areasDir);
  return warnings;
}

function levenshteinDist(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
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
