import { writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import chalk from 'chalk';
import * as ado from '../api/ado.js';
import { readConfig, writeConfig, readRefs, writeRefs } from '../core/state.js';
import { adoToMarkdown, workItemFileName, workItemDirPath, buildParentMap } from '../core/mapper.js';
import matter from 'gray-matter';
import { readFileSync } from 'node:fs';

export default async function pullCommand() {
  const config = readConfig('.');
  if (!config) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const refs = readRefs('.');
  const lastSync = config.lastSync;

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
    writeConfig('.', config);
    return;
  }

  const parentMap = buildParentMap(workItems);

  let updatedCount = 0;
  let newCount = 0;
  let conflicts = 0;

  for (const wi of workItems) {
    const id = wi.id;
    const ref = refs[id];

    if (ref && existsSync(ref.path)) {
      // Existing item - check for local modifications before overwriting
      const localContent = readFileSync(ref.path, 'utf-8');
      const { data: localFm } = matter(localContent);

      const hasLocalEdits = localFm.title !== ref.fields['System.Title'] ||
        localFm.state !== ref.fields['System.State'];

      const hasRemoteChanges = wi.rev !== ref.rev;

      if (hasLocalEdits && hasRemoteChanges) {
        console.log(chalk.yellow(`  Conflict: ${ref.path} (modified locally and remotely)`));
        // Write remote version with .remote suffix so user can diff
        const remotePath = ref.path.replace(/\.md$/, '.remote.md');
        const markdown = adoToMarkdown(wi);
        writeFileSync(remotePath, markdown, 'utf-8');
        console.log(chalk.yellow(`    Remote version saved as: ${remotePath}`));
        conflicts++;
        continue;
      }

      if (hasRemoteChanges) {
        // Overwrite local with remote
        const markdown = adoToMarkdown(wi);
        writeFileSync(ref.path, markdown, 'utf-8');
        refs[id] = { path: ref.path, rev: wi.rev, fields: wi.fields };
        updatedCount++;
      }
    } else {
      // New item from remote - write to correct location
      const type = wi.fields['System.WorkItemType'];
      const dirPath = workItemDirPath(wi, config.project, parentMap);
      const name = workItemFileName(wi);

      let filePath;
      if (type === 'Epic' || type === 'Feature') {
        const itemDir = `${dirPath}/${name}`;
        mkdirSync(itemDir, { recursive: true });
        filePath = `${itemDir}/${type.toLowerCase()}.md`;
      } else {
        mkdirSync(dirPath, { recursive: true });
        filePath = `${dirPath}/${name}.md`;
      }

      const markdown = adoToMarkdown(wi);
      writeFileSync(filePath, markdown, 'utf-8');
      refs[id] = { path: filePath, rev: wi.rev, fields: wi.fields };
      newCount++;
    }
  }

  // Update state
  config.lastSync = new Date().toISOString();
  writeConfig('.', config);
  writeRefs('.', refs);

  // Summary
  console.log(chalk.bold('\n  Pull complete:'));
  if (updatedCount) console.log(chalk.green(`    Updated: ${updatedCount}`));
  if (newCount) console.log(chalk.green(`    New:     ${newCount}`));
  if (conflicts) console.log(chalk.yellow(`    Conflicts: ${conflicts} (check .remote.md files)`));
  if (!updatedCount && !newCount && !conflicts) console.log(chalk.dim('    No changes.'));
  console.log();
}
