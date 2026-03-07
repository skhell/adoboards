import { readFileSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import matter from 'gray-matter';
import * as ado from '../api/ado.js';
import { readRefs, writeRefs, readStaged, writeStaged, readConfig } from '../core/state.js';
import { markdownToFields, validateHeadings } from '../core/mapper.js';

export default async function pushCommand(file) {
  const config = readConfig('.');
  if (!config) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const refs = readRefs('.');
  let filesToPush;

  if (file) {
    // Push specific file
    filesToPush = [file];
  } else {
    // Push all staged files
    filesToPush = readStaged('.');
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

    // Validate frontmatter — must have id and type to be a work item
    try {
      const content = readFileSync(filePath, 'utf-8');
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

      validFiles.push(filePath);
    } catch {
      skipped.push({ path: filePath, reason: 'cannot parse frontmatter' });
    }
  }

  if (skipped.length) {
    console.log(chalk.yellow(`\n  Skipped ${skipped.length} file${skipped.length !== 1 ? 's' : ''}:`));
    for (const s of skipped) console.log(chalk.dim(`    ${s.path} — ${s.reason}`));
  }

  if (!validFiles.length) {
    console.log(chalk.yellow('\n  No valid work items to push.\n'));
    return;
  }

  // Validate headings before pushing
  const headingWarnings = [];
  for (const filePath of validFiles) {
    const warnings = validateHeadings(filePath);
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

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const filePath of validFiles) {
    try {
      const parsed = markdownToFields(filePath);
      const { id, type, fields, parent } = parsed;

      // Map short type names back to ADO types
      const adoType = type === 'Story' ? 'User Story' : type;

      if (id === 'pending') {
        // Create new work item
        process.stdout.write(`  Creating ${adoType}: ${fields.title}... `);

        // Add parent link if specified
        const createFields = { ...fields };

        const result = await ado.createWorkItem(adoType, createFields, config.orgUrl, config.project);
        const newId = result.id;

        // Write back the real ID to the file
        const content = readFileSync(filePath, 'utf-8');
        const updated_content = content.replace(/^id:\s*pending$/m, `id: ${newId}`);
        writeFileSync(filePath, updated_content, 'utf-8');

        // Add parent relation if specified
        if (parent) {
          await addParentLink(newId, parent, config.orgUrl, config.project);
        }

        // Update refs
        refs[newId] = {
          path: filePath,
          rev: result.rev,
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

          // Compare values, handling type differences
          if (String(value) !== String(refValue ?? '')) {
            changedFields[key] = value;
          }
        }

        if (Object.keys(changedFields).length === 0) {
          console.log(chalk.dim(`  Skipped ${filePath} (no changes)`));
          continue;
        }

        process.stdout.write(`  Updating ID ${id}: ${Object.keys(changedFields).join(', ')}... `);
        const result = await ado.updateWorkItem(id, changedFields, config.orgUrl, config.project);

        // Update refs with new state
        refs[id] = {
          path: filePath,
          rev: result.rev,
          fields: result.fields,
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
  writeRefs('.', refs);

  // Clear staged list (only if we pushed from staging)
  if (!file) {
    writeStaged('.', []);
  }

  // Summary
  console.log(chalk.bold('\n  Push complete:'));
  if (created) console.log(chalk.green(`    Created: ${created}`));
  if (updated) console.log(chalk.green(`    Updated: ${updated}`));
  if (errors) console.log(chalk.red(`    Errors:  ${errors}`));
  console.log();
}

async function addParentLink(childId, parentId, orgUrl, project) {
  try {
    await ado.updateWorkItem(childId, {}, orgUrl, project);
    // Parent linking uses a relation, not a field patch
    // We need a special patch operation for this
    const axios = (await import('axios')).default;
    const secrets = await import('../core/secrets.js');
    const pat = await secrets.get('ado-pat');
    const headers = {
      'Authorization': `Basic ${Buffer.from(':' + pat).toString('base64')}`,
      'Content-Type': 'application/json-patch+json',
    };
    const parentUrl = `${orgUrl}/${encodeURIComponent(project)}/_apis/wit/workitems/${parentId}`;
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
  } catch {
    // Parent link failed - non-fatal, item was still created
  }
}
