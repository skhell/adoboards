import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import { readRefs, readConfig, findProjectRoot } from '../core/state.js';

export default function diffCommand(file) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const config = readConfig(root);
  const refs = readRefs(root);

  if (file) {
    diffFile(root, file, refs);
  } else {
    diffAll(root, refs, config);
  }
}

function diffFile(root, filePath, refs) {
  // Find matching ref by path first, then by frontmatter ID (handles moved files)
  let refId = null;
  let ref = null;
  for (const [id, r] of Object.entries(refs)) {
    if (r.path === filePath) {
      refId = id;
      ref = r;
      break;
    }
  }

  // If not found by path, try matching by frontmatter ID (file was moved)
  if (!ref) {
    try {
      const content = readFileSync(join(root, filePath), 'utf-8');
      const { data } = matter(content);
      if (data.id === 'pending') {
        console.log(chalk.cyan(`\n  ${filePath} is a new item (id: pending) - no remote state to diff against.\n`));
        return;
      }
      if (data.id != null && refs[data.id]) {
        refId = String(data.id);
        ref = refs[data.id];
      }
    } catch {
      // fall through
    }
    if (!ref) {
      console.error(chalk.red(`\n  ${filePath} is not tracked. No remote state found.\n`));
      return;
    }
  }

  const absPath = join(root, filePath);
  let content;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    console.error(chalk.red(`\n  Cannot read: ${filePath}\n`));
    return;
  }

  const { data: local, content: localBody } = matter(content);
  const changes = compareFields(local, localBody, ref.fields);

  if (!changes.length) {
    console.log(chalk.dim(`\n  ${filePath} - no changes.\n`));
    return;
  }

  console.log(chalk.bold(`\n  ${filePath}`) + chalk.dim(` (#${refId})\n`));
  printChanges(changes);
  console.log();
}

function diffAll(root, refs, config) {
  const areasDir = join(root, 'areas');
  const allFiles = findMdRecursive(areasDir, root);

  // Build path -> ref map AND id -> ref map
  const pathToRef = {};
  const idToRef = {};
  for (const [id, r] of Object.entries(refs)) {
    pathToRef[r.path] = { id, ...r };
    idToRef[id] = { id, ...r };
  }

  let found = false;

  console.log(chalk.bold(`\n  ${config.project} - diff\n`));

  for (const filePath of allFiles) {
    let ref = pathToRef[filePath];

    // If not found by path, try by frontmatter ID (moved file)
    if (!ref) {
      try {
        const raw = readFileSync(join(root, filePath), 'utf-8');
        const { data } = matter(raw);
        if (data.id != null && data.id !== 'pending' && idToRef[data.id]) {
          ref = idToRef[data.id];
        }
      } catch {
        continue;
      }
      if (!ref) continue;
    }

    let content;
    try {
      content = readFileSync(join(root, filePath), 'utf-8');
    } catch {
      continue;
    }

    const { data: local, content: localBody } = matter(content);
    const changes = compareFields(local, localBody, ref.fields);

    if (changes.length) {
      found = true;
      console.log(chalk.bold(`  ${filePath}`) + chalk.dim(` (#${ref.id})`));
      printChanges(changes);
      console.log();
    }
  }

  if (!found) {
    console.log(chalk.dim('  No changes detected.\n'));
  }
}

function compareFields(local, localBody, refFields) {
  const changes = [];

  const fieldChecks = [
    { name: 'title', local: local.title, remote: refFields['System.Title'] },
    { name: 'state', local: local.state, remote: refFields['System.State'] },
    { name: 'area', local: local.area, remote: refFields['System.AreaPath'] },
    { name: 'iteration', local: local.iteration || '', remote: refFields['System.IterationPath'] || '' },
    { name: 'storyPoints', local: local.storyPoints, remote: refFields['Microsoft.VSTS.Scheduling.StoryPoints'] },
    { name: 'businessValue', local: local.businessValue, remote: refFields['Microsoft.VSTS.Common.BusinessValue'] },
    { name: 'assignee', local: local.assignee || '', remote: extractAssignee(refFields['System.AssignedTo']) },
    { name: 'tags', local: formatTags(local.tags), remote: refFields['System.Tags'] || '' },
  ];

  for (const check of fieldChecks) {
    if (check.local == null && check.remote == null) continue;
    const localStr = String(check.local ?? '');
    const remoteStr = String(check.remote ?? '');
    if (localStr !== remoteStr) {
      changes.push({ field: check.name, local: localStr, remote: remoteStr });
    }
  }

  // Body sections
  const sections = parseSections(localBody);
  const bodyChecks = [
    {
      name: 'description',
      local: sections.description || '',
      remote: htmlToPlainText(refFields['System.Description'] || ''),
    },
    {
      name: 'acceptance criteria',
      local: sections.acceptanceCriteria || '',
      remote: htmlToPlainText(refFields['Microsoft.VSTS.Common.AcceptanceCriteria'] || ''),
    },
    {
      name: 'repro steps',
      local: sections.reproSteps || '',
      remote: htmlToPlainText(refFields['Microsoft.VSTS.TCM.ReproSteps'] || ''),
    },
    {
      name: 'system info',
      local: sections.systemInfo || '',
      remote: htmlToPlainText(refFields['Microsoft.VSTS.TCM.SystemInfo'] || ''),
    },
  ];

  for (const check of bodyChecks) {
    const localTrimmed = check.local.trim();
    const remoteTrimmed = check.remote.trim();
    if (!localTrimmed && !remoteTrimmed) continue;
    if (localTrimmed !== remoteTrimmed) {
      changes.push({ field: check.name, local: truncate(localTrimmed), remote: truncate(remoteTrimmed) });
    }
  }

  return changes;
}

function printChanges(changes) {
  for (const c of changes) {
    const fieldLabel = chalk.bold(`    ${c.field}:`);
    if (c.remote) {
      console.log(`${fieldLabel} ${chalk.red('- ' + c.remote)}`);
    }
    if (c.local) {
      console.log(`${fieldLabel} ${chalk.green('+ ' + c.local)}`);
    }
  }
}

function extractAssignee(assignedTo) {
  if (!assignedTo) return '';
  if (typeof assignedTo === 'string') return assignedTo;
  return assignedTo.uniqueName || assignedTo.displayName || '';
}

function formatTags(tags) {
  if (!tags) return '';
  if (Array.isArray(tags)) return tags.join('; ');
  return String(tags);
}

function truncate(text, maxLen = 120) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
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
