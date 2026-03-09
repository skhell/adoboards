import { writeFileSync, existsSync, readFileSync, mkdirSync, unlinkSync, readdirSync, statSync, rmdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import * as ado from '../api/ado.js';
import { readConfig, writeConfig, readRefs, writeRefs, readStaged, findProjectRoot } from '../core/state.js';
import { adoToMarkdown, workItemFileName, workItemDirPath, buildParentMap } from '../core/mapper.js';

export default async function pullCommand() {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const config = readConfig(root);
  const refs = readRefs(root);
  const lastSync = config.lastSync;

  // Warn if there are staged changes that haven't been pushed
  const staged = readStaged(root);
  if (staged.length) {
    console.log(chalk.yellow(`\n  Warning: ${staged.length} staged file${staged.length !== 1 ? 's' : ''} not yet pushed.`));
    console.log(chalk.yellow('  Pull may overwrite local changes. Push first or unstage to continue.\n'));
    console.log(chalk.dim('  Staged files:'));
    for (const s of staged.slice(0, 5)) console.log(chalk.dim(`    ${s}`));
    if (staged.length > 5) console.log(chalk.dim(`    ... and ${staged.length - 5} more`));
    console.log();
    process.exit(1);
  }

  console.log(chalk.bold(`\n  Pulling changes from ${config.project}...\n`));
  if (lastSync) {
    console.log(chalk.dim(`  Last sync: ${lastSync}\n`));
  }

  // Build WIQL to fetch items modified since last sync
  const queryOpts = {};
  if (config.areaFilter) queryOpts.area = config.areaFilter;
  if (lastSync) queryOpts.since = lastSync;
  if (config.stateFilter) queryOpts.states = config.stateFilter;
  if (config.assigneeFilter) queryOpts.assignees = config.assigneeFilter;

  process.stdout.write('  Fetching updated work items... ');
  const workItems = await ado.getAllWorkItems(config.orgUrl, config.project, queryOpts);
  console.log(chalk.green(`${workItems.length} items`));

  if (!workItems.length) {
    console.log(chalk.dim('\n  No changes since last sync.\n'));
    config.lastSync = new Date().toISOString();
    writeConfig(root, config);
    return;
  }

  const parentMap = buildParentMap(workItems);

  // Build a map of ID -> actual file path by scanning the filesystem
  // This lets us find files that were moved from their ref path
  const actualPaths = buildIdToPathMap(root);

  let updatedCount = 0;
  let newCount = 0;
  let conflicts = 0;
  let movedBack = 0;

  for (const wi of workItems) {
    const id = wi.id;
    const ref = refs[id];

    // Find where the file actually is (might differ from ref.path if moved)
    const actualPath = actualPaths.get(id) || (ref && existsSync(join(root, ref.path)) ? ref.path : null);

    // Compute where ADO says this file should live
    const correctPath = computeCorrectPath(wi, config.project, parentMap);

    if (actualPath) {
      // File exists locally - check for edits and remote changes
      const localContent = readFileSync(join(root, actualPath), 'utf-8');
      const { data: localFm, content: localBody } = matter(localContent);

      const hasLocalEdits = detectLocalEdits(localFm, localBody, ref);
      const hasRemoteChanges = wi.rev !== ref?.rev;
      const wasMoved = actualPath !== ref?.path;

      if (hasLocalEdits && hasRemoteChanges) {
        // Conflict: both sides changed
        const conflictBase = actualPath;
        console.log(chalk.yellow(`  Conflict: ${conflictBase} (modified locally and remotely)`));
        const remotePath = conflictBase.replace(/\.md$/, '.remote.md');
        const markdown = adoToMarkdown(wi);
        writeFileSync(join(root, remotePath), markdown, 'utf-8');
        console.log(chalk.yellow(`    Remote version saved as: ${remotePath}`));
        conflicts++;
        continue;
      }

      if (hasLocalEdits && !hasRemoteChanges) {
        // Only local edits, no remote changes - but file might be moved
        if (wasMoved && actualPath !== correctPath) {
          // Move the file back to where it should be, keep local content edits
          mkdirSync(join(root, correctPath).replace(/\/[^/]+$/, ''), { recursive: true });
          writeFileSync(join(root, correctPath), localContent, 'utf-8');
          removeFileAndCleanup(root, actualPath);
          refs[id] = { path: correctPath, rev: ref?.rev || wi.rev, fields: ref?.fields || wi.fields };
          console.log(chalk.magenta(`  Moved back: ${actualPath} -> ${correctPath} (local edits kept)`));
          movedBack++;
        }
        // Otherwise: local edits only, no remote changes, file in right place - leave it alone
        continue;
      }

      // Remote changed (or file was just moved with no edits) - overwrite with remote
      const markdown = adoToMarkdown(wi);

      if (wasMoved || actualPath !== correctPath) {
        // File was moved or path changed due to ADO field changes - write to correct location
        mkdirSync(join(root, correctPath).replace(/\/[^/]+$/, ''), { recursive: true });
        writeFileSync(join(root, correctPath), markdown, 'utf-8');
        if (actualPath !== correctPath) {
          removeFileAndCleanup(root, actualPath);
        }
        refs[id] = { path: correctPath, rev: wi.rev, fields: wi.fields };
        if (hasRemoteChanges) {
          updatedCount++;
        } else {
          movedBack++;
          console.log(chalk.magenta(`  Moved back: ${actualPath} -> ${correctPath}`));
        }
      } else if (hasRemoteChanges) {
        // File in correct place, just update content
        writeFileSync(join(root, actualPath), markdown, 'utf-8');
        refs[id] = { path: actualPath, rev: wi.rev, fields: wi.fields };
        updatedCount++;
      }
    } else {
      // File doesn't exist locally - new item or was deleted
      mkdirSync(join(root, correctPath).replace(/\/[^/]+$/, ''), { recursive: true });
      const markdown = adoToMarkdown(wi);
      writeFileSync(join(root, correctPath), markdown, 'utf-8');
      refs[id] = { path: correctPath, rev: wi.rev, fields: wi.fields };
      newCount++;
    }
  }

  // Update state
  config.lastSync = new Date().toISOString();
  writeConfig(root, config);
  writeRefs(root, refs);

  // Summary
  console.log(chalk.bold('\n  Pull complete:'));
  if (updatedCount) console.log(chalk.green(`    Updated:    ${updatedCount}`));
  if (newCount) console.log(chalk.green(`    New:         ${newCount}`));
  if (movedBack) console.log(chalk.magenta(`    Moved back: ${movedBack}`));
  if (conflicts) console.log(chalk.yellow(`    Conflicts:  ${conflicts} (check .remote.md files)`));
  if (!updatedCount && !newCount && !conflicts && !movedBack) console.log(chalk.dim('    No changes.'));
  console.log();
}

/**
 * Compute the correct file path for a work item based on its ADO fields.
 */
function computeCorrectPath(wi, projectName, parentMap) {
  const type = wi.fields['System.WorkItemType'];
  const dirPath = workItemDirPath(wi, projectName, parentMap);
  const name = workItemFileName(wi);

  if (type === 'Epic' || type === 'Feature') {
    const itemDir = join(dirPath, name);
    return join(itemDir, `${type.toLowerCase()}.md`);
  }
  return join(dirPath, `${name}.md`);
}

/**
 * Detect local edits by comparing frontmatter and body against ref fields.
 */
function detectLocalEdits(localFm, localBody, ref) {
  if (!ref?.fields) return false;
  const rf = ref.fields;

  if (localFm.title !== rf['System.Title']) return true;
  if (localFm.state !== rf['System.State']) return true;
  if (localFm.area !== rf['System.AreaPath']) return true;
  if ((localFm.iteration || '') !== (rf['System.IterationPath'] || '')) return true;

  const refPoints = rf['Microsoft.VSTS.Scheduling.StoryPoints'];
  if (localFm.storyPoints != null && localFm.storyPoints !== refPoints) return true;

  const refBv = rf['Microsoft.VSTS.Common.BusinessValue'];
  if (localFm.businessValue != null && localFm.businessValue !== refBv) return true;

  // Check body content
  const sections = localBody.split(/^## /m).filter(Boolean);
  for (const section of sections) {
    const nlIdx = section.indexOf('\n');
    if (nlIdx === -1) continue;
    const heading = section.slice(0, nlIdx).trim().toLowerCase();
    const content = section.slice(nlIdx + 1).trim();

    if (heading === 'description') {
      const local = content === '_No description_' ? '' : content;
      const remote = htmlToPlainText(rf['System.Description'] || '');
      if (local !== remote) return true;
    } else if (heading === 'acceptance criteria') {
      const remote = htmlToPlainText(rf['Microsoft.VSTS.Common.AcceptanceCriteria'] || '');
      if (content !== remote) return true;
    } else if (heading === 'repro steps') {
      const local = content === '_No repro steps_' ? '' : content;
      const remote = htmlToPlainText(rf['Microsoft.VSTS.TCM.ReproSteps'] || '');
      if (local !== remote) return true;
    } else if (heading === 'system info') {
      const remote = htmlToPlainText(rf['Microsoft.VSTS.TCM.SystemInfo'] || '');
      if (content !== remote) return true;
    }
  }

  return false;
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
 * Scan project to build a map of work item ID -> actual file path.
 * Scans all directories (not just areas/) to find files even if
 * the areas folder was renamed or files were moved elsewhere.
 */
function buildIdToPathMap(root) {
  const map = new Map();
  // Scan all top-level directories except hidden/system ones
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return map;
  }

  const skipDirs = new Set(['.adoboards', '.git', 'node_modules', 'templates', 'reports']);
  for (const entry of entries) {
    if (skipDirs.has(entry) || entry.startsWith('.')) continue;
    const fullPath = join(root, entry);
    try {
      if (statSync(fullPath).isDirectory()) {
        scanForIds(fullPath, root, map);
      }
    } catch {
      // skip
    }
  }

  return map;
}

function scanForIds(dir, root, map) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      scanForIds(fullPath, root, map);
    } else if (entry.endsWith('.md') && !entry.endsWith('.remote.md')) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        const { data } = matter(content);
        if (data.id != null && data.id !== 'pending') {
          map.set(Number(data.id), relative(root, fullPath));
        }
      } catch {
        // Skip unreadable files
      }
    }
  }
}

/**
 * Remove a file and clean up empty parent directories.
 */
function removeFileAndCleanup(root, filePath) {
  const absPath = join(root, filePath);
  try {
    unlinkSync(absPath);
  } catch {
    return;
  }

  // Walk up and remove empty directories (stop at areas/)
  let dir = absPath.replace(/\/[^/]+$/, '');
  const areasDir = join(root, 'areas');
  while (dir.startsWith(areasDir) && dir !== areasDir) {
    try {
      const entries = readdirSync(dir);
      if (entries.length === 0) {
        rmdirSync(dir);
        dir = dir.replace(/\/[^/]+$/, '');
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}
