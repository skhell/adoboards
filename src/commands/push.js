import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, dirname, basename } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import * as ado from '../api/ado.js';
import { readRefs, writeRefs, readStaged, writeStaged, readConfig, findProjectRoot } from '../core/state.js';
import { markdownToFields, validateHeadings, slugify } from '../core/mapper.js';

export default async function pushCommand(file) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const config = readConfig(root);
  const refs = readRefs(root);
  let filesToPush;

  if (file) {
    // Push specific file - resolve relative to project root
    const absPath = resolve(file);
    filesToPush = [relative(root, absPath)];
  } else {
    // Push all staged files
    filesToPush = readStaged(root);
    if (!filesToPush.length) {
      console.log(chalk.yellow('  Nothing staged. Use: adoboards add <file|.>'));
      return;
    }
  }

  // Guardrail: filter out non-work-item files and .remote.md conflict files
  const validFiles = [];
  const skipped = [];

  for (const filePath of filesToPush) {
    // Skip conflict files
    if (filePath.endsWith('.remote.md')) {
      skipped.push({ path: filePath, reason: 'conflict file (.remote.md)' });
      continue;
    }

    // Validate frontmatter - must have id and type to be a work item
    try {
      const absPath = join(root, filePath);
      const content = readFileSync(absPath, 'utf-8');
      const { data } = matter(content);

      if (!data.type) {
        skipped.push({ path: filePath, reason: 'no type in frontmatter (not a work item)' });
        continue;
      }

      const validTypes = ['Epic', 'Feature', 'Story', 'Bug', 'Task', 'Issue'];
      if (!validTypes.includes(data.type)) {
        skipped.push({ path: filePath, reason: `unknown type "${data.type}"` });
        continue;
      }

      if (data.id == null) {
        skipped.push({ path: filePath, reason: 'no id in frontmatter' });
        continue;
      }

      // Validate title is present
      if (!data.title || !String(data.title).trim()) {
        skipped.push({ path: filePath, reason: 'empty title (required by ADO)' });
        continue;
      }

      // Validate state if present
      const validStates = ['New', 'Active', 'Resolved', 'Closed', 'Removed'];
      if (data.state && !validStates.includes(data.state)) {
        skipped.push({ path: filePath, reason: `invalid state "${data.state}" (use: ${validStates.join(', ')})` });
        continue;
      }

      // Validate assignee format if present
      if (data.assignee && typeof data.assignee === 'string' && data.assignee.trim()) {
        const email = data.assignee.trim();
        if (!email.includes('@')) {
          skipped.push({ path: filePath, reason: `invalid assignee "${email}" (must be an email)` });
          continue;
        }
      }

      // Guardrail: validate folder structure
      const structureIssue = validateFolderStructure(filePath, config);
      if (structureIssue) {
        skipped.push({ path: filePath, reason: structureIssue });
        continue;
      }

      validFiles.push(filePath);
    } catch {
      skipped.push({ path: filePath, reason: 'cannot parse frontmatter' });
    }
  }

  if (skipped.length) {
    console.log(chalk.yellow(`\n  Skipped ${skipped.length} file${skipped.length !== 1 ? 's' : ''}:`));
    for (const s of skipped) console.log(chalk.dim(`    ${s.path} - ${s.reason}`));
  }

  if (!validFiles.length) {
    console.log(chalk.yellow('\n  No valid work items to push.\n'));
    return;
  }

  // Validate headings before pushing
  const headingWarnings = [];
  for (const filePath of validFiles) {
    const warnings = validateHeadings(join(root, filePath));
    for (const w of warnings) {
      headingWarnings.push({ file: filePath, ...w });
    }
  }

  if (headingWarnings.length) {
    console.log(chalk.yellow('\n  Heading warnings (unrecognized sections will be ignored by ADO):\n'));
    console.log(chalk.yellow('  +' + '-'.repeat(40) + '+' + '-'.repeat(50) + '+'));
    console.log(chalk.yellow('  | File' + ' '.repeat(35) + '| Issue' + ' '.repeat(44) + '|'));
    console.log(chalk.yellow('  +' + '-'.repeat(40) + '+' + '-'.repeat(50) + '+'));
    for (const w of headingWarnings) {
      const file = w.file.length > 38 ? '...' + w.file.slice(-35) : w.file.padEnd(38);
      const issue = w.wrongType
        ? `"## ${w.heading}" not valid for ${w.type} type`
        : w.suggestion
          ? `"## ${w.heading}" -> did you mean "## ${w.suggestion}"?`
          : `"## ${w.heading}" (not an ADO field)`;
      const issueStr = issue.length > 48 ? issue.slice(0, 45) + '...' : issue.padEnd(48);
      console.log(chalk.yellow(`  | ${file} | ${issueStr} |`));
    }
    console.log(chalk.yellow('  +' + '-'.repeat(40) + '+' + '-'.repeat(50) + '+'));
    console.log(chalk.yellow('\n  Valid headings per type:'));
    console.log(chalk.yellow('    Epic/Task/Issue:     ## Description'));
    console.log(chalk.yellow('    Feature/Story:       ## Description, ## Acceptance Criteria'));
    console.log(chalk.yellow('    Bug:                 ## Repro Steps, ## System Info'));
    console.log(chalk.yellow('  Fix the headings or remove unknown sections.\n'));
    return;
  }

  console.log(chalk.bold(`\n  Pushing ${validFiles.length} item${validFiles.length !== 1 ? 's' : ''} to ADO...\n`));

  // Sort pending items by type so parents are created before children:
  // Epic -> Feature -> Story/Bug/Task (already-tracked items keep original order)
  const TYPE_ORDER = { Epic: 0, Feature: 1, Story: 2, Bug: 2, Task: 2, Issue: 2 };
  validFiles.sort((a, b) => {
    const pa = markdownToFields(join(root, a));
    const pb = markdownToFields(join(root, b));
    const oa = pa.id === 'pending' ? (TYPE_ORDER[pa.type] ?? 3) : -1;
    const ob = pb.id === 'pending' ? (TYPE_ORDER[pb.type] ?? 3) : -1;
    return oa - ob;
  });

  // Track newly created IDs so child items can resolve placeholder parents
  const createdFeatureIds = []; // ordered list of feature IDs created in this push
  const createdIdByType = new Map(); // last created id per type (for EPIC placeholder)

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const filePath of validFiles) {
    try {
      const parsed = markdownToFields(join(root, filePath));
      const { id, type, fields } = parsed;
      let { parent } = parsed;

      // Map short type names back to ADO types
      const adoType = type === 'Story' ? 'User Story' : type;

      if (id === 'pending') {
        // Resolve placeholder parents (FEAT, EPIC, FEAT-1, FEAT-2, etc.) to real ADO IDs
        if (parent) {
          const parentStr = String(parent).trim();

          if (/^FEAT(-\d+)?$/i.test(parentStr)) {
            // FEAT or FEAT-1 -> index into features created in this push (1-based, FEAT = index 0)
            const match = parentStr.match(/^FEAT-(\d+)$/i);
            const idx = match ? parseInt(match[1], 10) - 1 : 0;
            const resolvedId = createdFeatureIds[idx];
            if (resolvedId) {
              parent = resolvedId;
            } else {
              console.log(chalk.yellow(`  Warning: could not resolve parent ${parentStr} for ${filePath} - push the feature first`));
              parent = null;
            }
          } else if (/^EPIC$/i.test(parentStr)) {
            const resolvedId = createdIdByType.get('Epic');
            if (resolvedId) {
              parent = resolvedId;
            } else {
              console.log(chalk.yellow(`  Warning: could not resolve parent EPIC for ${filePath} - push the epic first`));
              parent = null;
            }
          }
        }

        // Create new work item
        process.stdout.write(`  Creating ${adoType}: ${fields.title}... `);

        const createFields = { ...fields };

        const result = await ado.createWorkItem(adoType, createFields, config.orgUrl, config.project);
        const newId = result.id;

        // Write back the real ID to the file
        const fileContent = readFileSync(join(root, filePath), 'utf-8');
        const updated_content = fileContent.replace(/^id:\s*pending$/m, `id: ${newId}`);
        writeFileSync(join(root, filePath), updated_content, 'utf-8');

        // Rename pending folder or file to real ID (e.g. FEAT-pending-slug -> FEAT-XXXXXXX-slug)
        let finalFilePath = filePath;
        const absFilePath = join(root, filePath);
        const folderName = basename(dirname(absFilePath));

        if (folderName.includes('-pending-')) {
          // Folder-based item (Epic, Feature): rename the folder
          const newFolderName = folderName.replace('-pending-', `-${newId}-`);
          const oldFolderAbs = dirname(absFilePath);
          const newFolderAbs = join(dirname(oldFolderAbs), newFolderName);
          try {
            renameSync(oldFolderAbs, newFolderAbs);
            finalFilePath = join(relative(root, newFolderAbs), basename(filePath));
            const stagedNow = readStaged(root);
            writeStaged(root, stagedNow.map(s => s === filePath ? finalFilePath : s));
          } catch { /* non-fatal */ }
        } else if (basename(filePath).includes('-pending-')) {
          // Flat file item (Story, Bug, Task): rename the file
          const newFileName = basename(filePath).replace('-pending-', `-${newId}-`);
          const newAbsFilePath = join(dirname(absFilePath), newFileName);
          try {
            renameSync(absFilePath, newAbsFilePath);
            finalFilePath = relative(root, newAbsFilePath);
            const stagedNow = readStaged(root);
            writeStaged(root, stagedNow.map(s => s === filePath ? finalFilePath : s));
          } catch { /* non-fatal */ }
        }

        // Add parent relation if specified
        if (parent) {
          await addParentLink(newId, parent, config.orgUrl, config.project);
        }

        // Track created ID for child resolution
        if (type === 'Feature') createdFeatureIds.push(newId);
        createdIdByType.set(type, newId);

        // Update refs with final path
        refs[newId] = {
          path: finalFilePath,
          rev: result.rev,
          hash: createHash('sha256').update(updated_content).digest('hex'),
          fields: result.fields,
        };

        console.log(chalk.green(`ID ${newId}`));
        created++;
      } else {
        // Update existing work item - only push changed fields
        const ref = refs[id];
        const changedFields = {};

        for (const [key, value] of Object.entries(fields)) {
          const adoField = ado.FIELD_MAP[key] || key;
          const refValue = ref?.fields?.[adoField];

          // Rich-text fields: always include if present - refs store HTML, file has markdown,
          // so string comparison would always differ anyway; being explicit avoids skipping
          if (['description', 'acceptanceCriteria', 'reproSteps', 'systemInfo'].includes(key)) {
            if (value != null && value !== '') changedFields[key] = value;
          } else if (String(value) !== String(refValue ?? '')) {
            changedFields[key] = value;
          }
        }

        const hasParentToLink = parsed.parent && !isNaN(Number(parsed.parent));

        if (Object.keys(changedFields).length === 0 && !hasParentToLink) {
          console.log(chalk.dim(`  Skipped ${filePath} (no changes)`));
          continue;
        }

        let result;
        if (Object.keys(changedFields).length > 0) {
          process.stdout.write(`  Updating ID ${id}: ${Object.keys(changedFields).join(', ')}... `);
          result = await ado.updateWorkItem(id, changedFields, config.orgUrl, config.project);
        } else {
          process.stdout.write(`  Linking parent for ID ${id}... `);
          result = ref; // no field update needed, use existing ref
        }

        // Link parent relation if set (ADO stores this as a relation, not a field)
        // addParentLink ignores "already linked" errors silently
        if (hasParentToLink) {
          await addParentLink(id, parsed.parent, config.orgUrl, config.project);
        }

        // Read back the file content to hash what's actually on disk
        const pushedContent = readFileSync(join(root, filePath), 'utf-8');

        // Rename pending folder/file if it was never renamed (pushed before 0.3.35)
        let finalUpdatePath = filePath;
        const absUpdatePath = join(root, filePath);
        const updateFolderName = basename(dirname(absUpdatePath));
        if (updateFolderName.includes('-pending-')) {
          const newFolderName = updateFolderName.replace('-pending-', `-${id}-`);
          const oldFolderAbs = dirname(absUpdatePath);
          const newFolderAbs = join(dirname(oldFolderAbs), newFolderName);
          try {
            renameSync(oldFolderAbs, newFolderAbs);
            finalUpdatePath = join(relative(root, newFolderAbs), basename(filePath));
            const stagedNow = readStaged(root);
            writeStaged(root, stagedNow.map(s => s === filePath ? finalUpdatePath : s));
          } catch { /* non-fatal */ }
        } else if (basename(filePath).includes('-pending-')) {
          const newFileName = basename(filePath).replace('-pending-', `-${id}-`);
          const newAbsPath = join(dirname(absUpdatePath), newFileName);
          try {
            renameSync(absUpdatePath, newAbsPath);
            finalUpdatePath = relative(root, newAbsPath);
            const stagedNow = readStaged(root);
            writeStaged(root, stagedNow.map(s => s === filePath ? finalUpdatePath : s));
          } catch { /* non-fatal */ }
        }

        // Update refs with new state
        refs[id] = {
          path: finalUpdatePath,
          rev: result?.rev ?? ref?.rev,
          hash: createHash('sha256').update(pushedContent).digest('hex'),
          fields: result?.fields ?? ref?.fields,
        };

        console.log(chalk.green('done'));
        updated++;
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      if (msg.includes('identity') || msg.includes('AssignedTo')) {
        console.log(chalk.red(`\n  Error: ${filePath} - invalid assignee (user not found in ADO)`));
      } else {
        console.log(chalk.red(`\n  Error: ${filePath} - ${msg}`));
      }
      errors++;
    }
  }

  // Save updated refs
  writeRefs(root, refs);

  // Clear staged list (only if we pushed from staging)
  if (!file) {
    writeStaged(root, []);
  }

  // Summary
  console.log(chalk.bold('\n  Push complete:'));
  if (created) console.log(chalk.green(`    Created: ${created}`));
  if (updated) console.log(chalk.green(`    Updated: ${updated}`));
  if (errors) console.log(chalk.red(`    Errors:  ${errors}`));
  console.log();
}

/**
 * Validate file lives under proper folder structure.
 * Returns a reason string if invalid, null if OK.
 * Same logic as add.js but returns flat strings for the skipped list.
 */
function validateFolderStructure(filePath, config) {
  if (!filePath.startsWith('areas/')) {
    return 'file is outside the areas/ directory';
  }

  const parts = filePath.split('/');
  if (parts.length < 4) return null;

  const VALID_BUCKETS = ['backlog', 'iterations'];
  const innerParts = parts.slice(1);

  const bucketIdx = innerParts.findIndex((p) => VALID_BUCKETS.includes(p));

  if (bucketIdx === -1) {
    for (const part of innerParts) {
      for (const c of VALID_BUCKETS) {
        const dist = levenshtein(part.toLowerCase(), c);
        if (dist > 0 && dist <= 3) {
          return `folder "${part}" looks like a misspelling of "${c}" - rename it first`;
        }
      }
    }
    return 'file is not inside a backlog/ or iterations/ folder';
  }

  if (config?.allowFolderEdits) return null;

  // Validate area path
  if (config?.areas?.length) {
    const areaSegments = innerParts.slice(0, bucketIdx);
    if (areaSegments.length > 0) {
      const localAreaPath = areaSegments.join('/');
      const knownAreas = config.areas.map((a) => {
        const n = a.replace(/\\/g, '/');
        const i = n.indexOf('/');
        return i === -1 ? '' : n.slice(i + 1);
      }).filter(Boolean);

      if (!knownAreas.includes(localAreaPath)) {
        return `area path "${localAreaPath}" is not in the project (set allowFolderEdits in config to override)`;
      }
    }
  }

  // Validate iteration path
  if (innerParts[bucketIdx] === 'iterations' && config?.iterations?.length) {
    const iterSegments = innerParts.slice(bucketIdx + 1, -1);
    if (iterSegments.length > 0) {
      const localIterPath = iterSegments.join('/');
      const knownIters = config.iterations.map((i) => {
        const n = i.replace(/\\/g, '/');
        const idx = n.indexOf('/');
        return idx === -1 ? '' : n.slice(idx + 1);
      }).filter(Boolean);

      const matches = knownIters.some((ki) => ki === localIterPath || ki.startsWith(localIterPath + '/'));
      if (!matches) {
        return `iteration path "${localIterPath}" is not in the project (set allowFolderEdits in config to override)`;
      }
    }
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

async function addParentLink(childId, parentId, orgUrl, project) {
  try {
    const axios = (await import('axios')).default;
    const secrets = await import('../core/secrets.js');
    const pat = await secrets.get('ado-pat');
    const headers = {
      'Authorization': `Basic ${Buffer.from(':' + pat).toString('base64')}`,
      'Content-Type': 'application/json-patch+json',
    };
    // ADO relation URLs require 'workItems' (capital I) - lowercase silently fails
    const parentUrl = `${orgUrl}/${encodeURIComponent(project)}/_apis/wit/workItems/${parentId}`;
    await axios.patch(
      `${orgUrl}/${encodeURIComponent(project)}/_apis/wit/workitems/${childId}?api-version=7.1`,
      [{
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: parentUrl,
        },
      }],
      { headers },
    );
  } catch (err) {
    const msg = err.response?.data?.message || err.message || '';
    // "already exists" or "duplicate" is not a real error - ignore
    if (!msg.toLowerCase().includes('already') && !msg.toLowerCase().includes('duplicate')) {
      console.log(chalk.yellow(`  Warning: could not link parent ${parentId} -> ${childId}: ${msg}`));
    }
  }
}
