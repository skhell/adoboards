import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import { readRefs, readConfig, findProjectRoot } from '../core/state.js';
import { adoToMarkdown } from '../core/mapper.js';

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
  let refId = null;
  let ref = null;

  // Find ref by path
  for (const [id, r] of Object.entries(refs)) {
    if (r.path === filePath) { refId = id; ref = r; break; }
  }

  // Fall back to frontmatter ID (moved file)
  if (!ref) {
    try {
      const content = readFileSync(join(root, filePath), 'utf-8');
      const { data } = matter(content);
      if (data.id === 'pending') {
        console.log(chalk.cyan(`\n  ${filePath} is a new item - no origin to diff against.\n`));
        return;
      }
      if (data.id != null && refs[data.id]) { refId = String(data.id); ref = refs[data.id]; }
    } catch { /* fall through */ }
    if (!ref) {
      console.error(chalk.red(`\n  ${filePath} is not tracked.\n`));
      return;
    }
  }

  let localContent;
  try { localContent = readFileSync(join(root, filePath), 'utf-8'); }
  catch { console.error(chalk.red(`\n  Cannot read: ${filePath}\n`)); return; }

  printFileDiff(filePath, refId, ref, localContent);
}

function diffAll(root, refs, config) {
  const areasDir = join(root, 'areas');
  const allFiles = findMdRecursive(areasDir, root);

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
    if (!ref) {
      try {
        const raw = readFileSync(join(root, filePath), 'utf-8');
        const { data } = matter(raw);
        if (data.id != null && data.id !== 'pending' && idToRef[data.id]) ref = idToRef[data.id];
      } catch { continue; }
      if (!ref) continue;
    }

    let localContent;
    try { localContent = readFileSync(join(root, filePath), 'utf-8'); }
    catch { continue; }

    // Quick hash check - skip if unchanged
    if (ref.hash) {
      const currentHash = createHash('sha256').update(localContent).digest('hex');
      if (currentHash === ref.hash) continue;
    }

    found = true;
    printFileDiff(filePath, ref.id, ref, localContent);
  }

  if (!found) console.log(chalk.dim('  No changes.\n'));
}

function printFileDiff(filePath, refId, ref, localContent) {
  // Reconstruct origin from stored fields
  const originContent = adoToMarkdown({ id: Number(refId), rev: ref.rev, fields: ref.fields });

  const oldLines = originContent.split('\n');
  const newLines = localContent.split('\n');
  const hunks = buildHunks(oldLines, newLines);

  if (!hunks.length) {
    // Hash mismatch but no semantic diff (whitespace-only or formatter diff)
    console.log(chalk.dim(`  ${filePath} - whitespace/formatting only\n`));
    return;
  }

  // Header like git diff
  console.log(chalk.bold(`diff --adoboards a/${filePath} b/${filePath}`));
  console.log(chalk.dim(`--- a/${filePath}  (origin #${refId})`));
  console.log(chalk.dim(`+++ b/${filePath}  (local)`));

  for (const hunk of hunks) {
    const oldCount = hunk.filter(l => l.type !== 'insert').length;
    const newCount = hunk.filter(l => l.type !== 'delete').length;
    const oldStart = hunk[0].oldLine;
    const newStart = hunk[0].newLine;
    console.log(chalk.cyan(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`));
    for (const line of hunk) {
      if (line.type === 'equal')  console.log(chalk.dim(` ${line.text}`));
      if (line.type === 'delete') console.log(chalk.red(`-${line.text}`));
      if (line.type === 'insert') console.log(chalk.green(`+${line.text}`));
    }
  }
  console.log();
}

/**
 * Compute LCS-based diff and return context hunks (3 lines of context, like git).
 */
function buildHunks(oldLines, newLines, context = 3) {
  const diff = lcs(oldLines, newLines);

  // Group into hunks separated by unchanged regions > 2*context
  const hunks = [];
  let current = null;
  let skipCount = 0;

  for (let i = 0; i < diff.length; i++) {
    const d = diff[i];
    if (d.type === 'equal') {
      skipCount++;
      if (current) {
        // Check if we should close this hunk
        const remaining = diff.slice(i).filter(x => x.type !== 'equal').length;
        if (remaining === 0) {
          // Tail context
          if (skipCount <= context) current.push(d);
          else { hunks.push(current); current = null; skipCount = 0; }
        } else if (skipCount <= context) {
          current.push(d);
        } else {
          // Gap too large - close current hunk
          hunks.push(current);
          current = null;
          skipCount = 0;
        }
      }
      // Accumulate leading context
    } else {
      if (!current) {
        // Start new hunk with leading context
        const leadStart = Math.max(0, i - context);
        current = diff.slice(leadStart, i).filter(x => x.type === 'equal').map(x => x);
      }
      current.push(d);
      skipCount = 0;
    }
  }
  if (current?.length) hunks.push(current);
  return hunks;
}

/**
 * Myers-style LCS diff. Returns array of {type, text, oldLine, newLine}.
 */
function lcs(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result = [];
  let i = 0, j = 0;
  let oldLine = 1, newLine = 1;

  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: 'equal', text: oldLines[i], oldLine, newLine });
      i++; j++; oldLine++; newLine++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: 'insert', text: newLines[j], oldLine, newLine });
      j++; newLine++;
    } else {
      result.push({ type: 'delete', text: oldLines[i], oldLine, newLine });
      i++; oldLine++;
    }
  }
  return result;
}

function findMdRecursive(dir, root) {
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) results.push(...findMdRecursive(fullPath, root));
    else if (entry.endsWith('.md') && !entry.endsWith('.remote.md'))
      results.push(relative(root, fullPath));
  }
  return results;
}

