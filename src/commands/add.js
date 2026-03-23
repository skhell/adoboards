import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import { readStaged, writeStaged, readRefs, readConfig, findProjectRoot } from '../core/state.js';

export default function addCommand(files) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const staged = new Set(readStaged(root));
  const refs = readRefs(root);
  const toAdd = [];
  const errors = [];

  // Build a set of ref paths for fast lookup (for detecting staged deletions)
  const refPaths = new Set(Object.values(refs).map((r) => r.path));

  for (const file of files) {
    if (file === '.') {
      // Stage only CHANGED files (modified + new) - not unmodified tracked files
      const areasDir = join(root, 'areas');
      const mdFiles = findMdRecursive(areasDir, root);
      for (const f of mdFiles) {
        if (isChanged(f, root, refs)) toAdd.push(f);
      }

      // Also stage deleted files: tracked in refs but no longer on disk
      for (const refPath of refPaths) {
        if (!existsSync(join(root, refPath))) {
          toAdd.push(refPath);
        }
      }
    } else {
      // Resolve path relative to project root
      const absPath = resolve(file);
      const relPath = relative(root, absPath);

      if (!existsSync(absPath)) {
        // File might be a tracked deletion
        if (refPaths.has(relPath)) {
          toAdd.push(relPath); // Stage deletion
        } else {
          errors.push({ path: file, issue: 'file not found' });
        }
        continue;
      }

      const stat = statSync(absPath);
      if (stat.isDirectory()) {
        const mdFiles = findMdRecursive(absPath, root);
        for (const f of mdFiles) {
          if (isChanged(f, root, refs)) toAdd.push(f);
        }
        // Also include tracked deletions under this directory
        for (const refPath of refPaths) {
          if (refPath.startsWith(relPath + '/') && !existsSync(join(root, refPath))) {
            toAdd.push(refPath);
          }
        }
      } else if (relPath.endsWith('.md') && !relPath.endsWith('.remote.md')) {
        toAdd.push(relPath);
      }
    }
  }

  // Validate each file before staging
  const validTypes = ['Epic', 'Feature', 'Story', 'Bug', 'Task', 'Issue'];
  const validToStage = [];
  const config = readConfig(root);
  const warnings = [];

  for (const filePath of toAdd) {
    if (staged.has(filePath)) continue; // already staged

    const absPath = join(root, filePath);

    // Deleted file: tracked in refs, no longer on disk - stage as deletion without frontmatter checks
    if (!existsSync(absPath)) {
      if (refPaths.has(filePath)) {
        validToStage.push(filePath);
      }
      continue;
    }

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

      // Guardrail: validate folder structure
      const structureError = validateFolderStructure(filePath, config);
      if (structureError) {
        errors.push({ path: filePath, issue: structureError.issue, fix: structureError.fix });
        continue;
      }

      // Detect moved files and warn
      if (data.id !== 'pending' && refs[data.id]) {
        const ref = refs[data.id];
        if (ref.path !== filePath) {
          warnings.push({ path: filePath, oldPath: ref.path, id: data.id });
        }
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

  if (warnings.length) {
    console.log(chalk.magenta(`\n  ${warnings.length} moved file${warnings.length !== 1 ? 's' : ''} (refs will update on push):\n`));
    for (const w of warnings) {
      console.log(chalk.dim(`    ${w.oldPath}`));
      console.log(chalk.magenta(`    -> ${w.path} (ID ${w.id})`));
    }
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

/**
 * Validate that a file lives under the expected folder structure.
 *
 * Protected folders (always enforced):
 *   - files must be under areas/
 *   - path must contain backlog/ or iterations/ (not misspelled)
 *
 * Folder creation (controlled by config.allowFolderEdits):
 *   - When false (default): the area and iteration segments in the path must
 *     match known paths from config.json (synced from ADO on clone/pull).
 *     This prevents users from creating arbitrary folder structures.
 *   - When true: any folder is allowed as long as the structural folders
 *     (areas, backlog, iterations) are correct.
 */
function validateFolderStructure(filePath, config) {
  // Must start with areas/
  if (!filePath.startsWith('areas/')) {
    return {
      issue: 'file is outside the areas/ directory',
      fix: 'work item files must live under areas/',
    };
  }

  const parts = filePath.split('/');
  // Minimum: areas/<area>/<bucket>/file.md (4 parts)
  if (parts.length < 4) {
    return null; // Let other validations handle shallow files
  }

  // Search for backlog or iterations anywhere in the path after areas/
  const VALID_BUCKETS = ['backlog', 'iterations'];
  const innerParts = parts.slice(1); // skip "areas"

  const bucketIdx = innerParts.findIndex((p) => VALID_BUCKETS.includes(p));

  if (bucketIdx === -1) {
    // No valid bucket found - check if any segment is a misspelling
    for (const part of innerParts) {
      const misspelled = findMisspelling(part, VALID_BUCKETS);
      if (misspelled) {
        return {
          issue: `folder "${part}" looks like a misspelling of "${misspelled}"`,
          fix: `rename the folder to "${misspelled}" - wrong folder names break syncing`,
        };
      }
    }

    return {
      issue: 'file is not inside a backlog/ or iterations/ folder',
      fix: 'move the file into backlog/ or iterations/ under the area path',
    };
  }

  // If allowFolderEdits is on, structural check is enough
  if (config?.allowFolderEdits) return null;

  // Validate area path matches known areas from config
  if (config?.areas?.length) {
    // Area segments are everything between areas/ and the bucket folder
    // e.g. areas/Team/Backend/backlog/... -> area segments = ["Team", "Backend"]
    const areaSegments = innerParts.slice(0, bucketIdx);
    if (areaSegments.length > 0) {
      const localAreaPath = areaSegments.join('/');
      // Config stores ADO-style paths: "Project\Team\Backend"
      // Convert to forward slash and strip project prefix for comparison
      const knownAreas = config.areas.map((a) => {
        const normalized = a.replace(/\\/g, '/');
        // Strip project name prefix (first segment)
        const slashIdx = normalized.indexOf('/');
        return slashIdx === -1 ? '' : normalized.slice(slashIdx + 1);
      }).filter(Boolean);

      if (!knownAreas.includes(localAreaPath)) {
        return {
          issue: `area path "${localAreaPath}" is not in the project`,
          fix: 'use an area from the ADO project, or set allowFolderEdits: true in .adoboards/config.json',
        };
      }
    }
  }

  // Validate iteration path matches known iterations from config
  if (innerParts[bucketIdx] === 'iterations' && config?.iterations?.length) {
    // Iteration segments are everything after iterations/ up to the filename
    // e.g. areas/Team/iterations/Y2025/Q1/file.md -> iter segments = ["Y2025", "Q1"]
    const iterSegments = innerParts.slice(bucketIdx + 1, -1); // exclude filename
    if (iterSegments.length > 0) {
      const localIterPath = iterSegments.join('/');
      const knownIters = config.iterations.map((i) => {
        const normalized = i.replace(/\\/g, '/');
        const slashIdx = normalized.indexOf('/');
        return slashIdx === -1 ? '' : normalized.slice(slashIdx + 1);
      }).filter(Boolean);

      // Check if the path matches or is a prefix of any known iteration
      const matches = knownIters.some((ki) => ki === localIterPath || ki.startsWith(localIterPath + '/'));
      if (!matches) {
        return {
          issue: `iteration path "${localIterPath}" is not in the project`,
          fix: 'use an iteration from the ADO project, or set allowFolderEdits: true in .adoboards/config.json',
        };
      }
    }
  }

  return null;
}

function findMisspelling(input, candidates) {
  for (const c of candidates) {
    const dist = levenshtein(input.toLowerCase(), c);
    if (dist > 0 && dist <= 3) return c;
  }
  return null;
}

function levenshtein(a, b) {
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

/**
 * Returns true if a file has changes worth staging:
 * - New file (no ref entry matching its ID)
 * - Modified file (hash differs from stored ref)
 * Untracked unmodified files return false so "add ." doesn't stage everything.
 */
function isChanged(filePath, root, refs) {
  try {
    const content = readFileSync(join(root, filePath), 'utf-8');
    const { data } = matter(content);
    if (!data.id) return true; // no id - treat as new/unknown

    if (data.id === 'pending') return true; // always stage new pending items

    const ref = refs[data.id];
    if (!ref) return true; // not tracked -> new

    const currentHash = createHash('sha256').update(content).digest('hex');
    return currentHash !== ref.hash; // only stage if content changed
  } catch {
    return true; // if we can't read it, let validation handle it
  }
}
