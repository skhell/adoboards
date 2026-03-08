import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, isAbsolute, resolve } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import globalConfig from '../core/config.js';
import { readConfig, readRefs, findProjectRoot } from '../core/state.js';

export default function reportCommand(opts = {}) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const config = readConfig(root);
  const projectName = config.project || 'Project';

  // Collect all work items from areas/
  const areasDir = join(root, 'areas');
  const allFiles = findMdRecursive(areasDir, root);
  const items = [];

  for (const relPath of allFiles) {
    try {
      const content = readFileSync(join(root, relPath), 'utf-8');
      const { data } = matter(content);
      if (!data.type) continue;
      items.push({ ...data, path: relPath });
    } catch {
      // Skip unreadable
    }
  }

  // Find target sprint
  const targetSprint = opts.sprint ? findSprintByName(items, opts.sprint) : findCurrentSprint(items, config);

  let markdown;
  if (targetSprint) {
    markdown = printSprintReport(items, targetSprint, projectName);
  } else {
    markdown = printOverviewReport(items, projectName);
  }

  // Save report to configured directory
  const reportsDir = resolveReportsDir(root);
  mkdirSync(reportsDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const slug = targetSprint
    ? targetSprint.split('\\').pop().replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
    : 'overview';
  const fileName = `${date}-${slug}.md`;
  const filePath = join(reportsDir, fileName);

  writeFileSync(filePath, markdown, 'utf-8');
  console.log(chalk.dim(`  Saved to: ${filePath}\n`));
}

function resolveReportsDir(root) {
  const configured = globalConfig.get('reportsDir') || 'reports';
  if (isAbsolute(configured)) return configured;
  return resolve(root, configured);
}

function findSprintByName(items, sprintQuery) {
  const query = String(sprintQuery).toLowerCase();
  const iterations = new Set();
  for (const item of items) {
    if (item.iteration) iterations.add(item.iteration);
  }
  // Match by sprint number or partial name
  for (const iter of iterations) {
    if (iter.toLowerCase().includes(query) || iter.toLowerCase().includes(`sprint-${query}`) || iter.toLowerCase().includes(`sprint ${query}`)) {
      return iter;
    }
  }
  return null;
}

function findCurrentSprint(items, config) {
  // Find the iteration with the most Active items (likely current sprint)
  const iterationCounts = {};
  for (const item of items) {
    if (!item.iteration || !item.iteration.trim()) continue;
    if (item.state === 'Active' || item.state === 'New') {
      iterationCounts[item.iteration] = (iterationCounts[item.iteration] || 0) + 1;
    }
  }

  let best = null;
  let bestCount = 0;
  for (const [iter, count] of Object.entries(iterationCounts)) {
    if (count > bestCount) {
      bestCount = count;
      best = iter;
    }
  }
  return best;
}

function printSprintReport(items, sprint, projectName) {
  const sprintItems = items.filter((i) => i.iteration === sprint);
  const stories = sprintItems.filter((i) => ['Story', 'Bug', 'Task'].includes(i.type));

  // Group by state
  const byState = {};
  for (const item of stories) {
    const state = item.state || 'Unknown';
    if (!byState[state]) byState[state] = [];
    byState[state].push(item);
  }

  const totalPoints = stories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
  const donePoints = (byState['Closed'] || []).reduce((sum, s) => sum + (s.storyPoints || 0), 0)
    + (byState['Resolved'] || []).reduce((sum, s) => sum + (s.storyPoints || 0), 0);
  const activePoints = (byState['Active'] || []).reduce((sum, s) => sum + (s.storyPoints || 0), 0);
  const newPoints = (byState['New'] || []).reduce((sum, s) => sum + (s.storyPoints || 0), 0);

  const pctDone = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;
  const bar = buildBar(pctDone);
  const sprintShort = sprint.split('\\').pop();

  // Console output
  const barColor = pctDone >= 80 ? chalk.green : pctDone >= 50 ? chalk.yellow : chalk.red;
  console.log(chalk.bold(`\n  Sprint Report: ${sprintShort}\n`));
  console.log(chalk.dim(`  Iteration: ${sprint}`));
  console.log(chalk.dim(`  Project: ${projectName}\n`));
  console.log(`  Progress: ${barColor(bar)} ${pctDone}%`);
  console.log(chalk.dim(`  ${donePoints}/${totalPoints} story points completed\n`));

  console.log(chalk.bold('  Summary'));
  console.log(`  ${chalk.green('Done:    ')} ${(byState['Closed'] || []).length + (byState['Resolved'] || []).length} items (${donePoints} pts)`);
  console.log(`  ${chalk.yellow('Active:  ')} ${(byState['Active'] || []).length} items (${activePoints} pts)`);
  console.log(`  ${chalk.cyan('New:     ')} ${(byState['New'] || []).length} items (${newPoints} pts)`);
  if (byState['Removed']?.length) {
    console.log(`  ${chalk.red('Removed: ')} ${byState['Removed'].length} items`);
  }
  console.log();

  const stateOrder = ['Active', 'New', 'Resolved', 'Closed', 'Removed'];
  const stateColors = { Active: chalk.yellow, New: chalk.cyan, Resolved: chalk.green, Closed: chalk.green, Removed: chalk.red };

  for (const state of stateOrder) {
    const stateItems = byState[state];
    if (!stateItems?.length) continue;
    const color = stateColors[state] || chalk.white;
    console.log(color(`  ${state} (${stateItems.length}):`));
    for (const item of stateItems) {
      const pts = item.storyPoints ? ` (${item.storyPoints} pts)` : '';
      const assignee = item.assignee ? chalk.dim(` -> ${item.assignee}`) : '';
      const id = item.id === 'pending' ? chalk.dim('pending') : chalk.dim(`#${item.id}`);
      console.log(`    ${id} ${item.title}${pts}${assignee}`);
    }
    console.log();
  }

  const noPoints = stories.filter((s) => !s.storyPoints && s.state !== 'Closed' && s.state !== 'Removed');
  const noAssignee = stories.filter((s) => !s.assignee && s.state !== 'Closed' && s.state !== 'Removed');
  if (noPoints.length || noAssignee.length) {
    console.log(chalk.bold('  Attention'));
    if (noPoints.length) console.log(chalk.yellow(`  ${noPoints.length} item(s) without story points`));
    if (noAssignee.length) console.log(chalk.yellow(`  ${noAssignee.length} item(s) without assignee`));
    console.log();
  }

  console.log(chalk.dim('  Generated from local files - no API calls.'));

  // Build markdown for file
  const md = [];
  md.push(`# Sprint Report: ${sprintShort}`);
  md.push(`\n**Iteration:** ${sprint}`);
  md.push(`**Project:** ${projectName}`);
  md.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  md.push(`\n## Progress\n`);
  md.push(`${bar} ${pctDone}% - ${donePoints}/${totalPoints} story points completed\n`);
  md.push(`| Status | Items | Points |`);
  md.push(`|---|---|---|`);
  md.push(`| Done | ${(byState['Closed'] || []).length + (byState['Resolved'] || []).length} | ${donePoints} |`);
  md.push(`| Active | ${(byState['Active'] || []).length} | ${activePoints} |`);
  md.push(`| New | ${(byState['New'] || []).length} | ${newPoints} |`);
  if (byState['Removed']?.length) md.push(`| Removed | ${byState['Removed'].length} | - |`);
  md.push('');

  for (const state of stateOrder) {
    const stateItems = byState[state];
    if (!stateItems?.length) continue;
    md.push(`\n### ${state} (${stateItems.length})\n`);
    for (const item of stateItems) {
      const pts = item.storyPoints ? ` (${item.storyPoints} pts)` : '';
      const assignee = item.assignee ? ` - ${item.assignee}` : '';
      const id = item.id === 'pending' ? 'pending' : `#${item.id}`;
      md.push(`- ${id} ${item.title}${pts}${assignee}`);
    }
  }

  if (noPoints.length || noAssignee.length) {
    md.push('\n## Attention\n');
    if (noPoints.length) md.push(`- ${noPoints.length} item(s) without story points`);
    if (noAssignee.length) md.push(`- ${noAssignee.length} item(s) without assignee`);
  }

  md.push('\n---\n*Generated by adoboards from local files.*\n');
  return md.join('\n');
}

function printOverviewReport(items, projectName) {
  const stories = items.filter((i) => ['Story', 'Bug', 'Task'].includes(i.type));
  const epics = items.filter((i) => i.type === 'Epic');
  const features = items.filter((i) => i.type === 'Feature');

  const byIteration = {};
  const backlog = [];

  for (const item of stories) {
    if (item.iteration && item.iteration.trim()) {
      if (!byIteration[item.iteration]) byIteration[item.iteration] = [];
      byIteration[item.iteration].push(item);
    } else {
      backlog.push(item);
    }
  }

  console.log(chalk.bold(`\n  Project Overview: ${projectName}\n`));
  console.log(chalk.dim(`  Total: ${items.length} work items (${epics.length} epics, ${features.length} features, ${stories.length} stories/bugs/tasks)\n`));

  const sortedIterations = Object.keys(byIteration).sort();
  for (const iter of sortedIterations) {
    const iterItems = byIteration[iter];
    const total = iterItems.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const done = iterItems.filter((s) => s.state === 'Closed' || s.state === 'Resolved');
    const donePoints = done.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const pct = total > 0 ? Math.round((donePoints / total) * 100) : 0;
    const bar = buildBar(pct);
    const iterShort = iter.split('\\').pop();
    const barColor = pct >= 80 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red;
    console.log(`  ${iterShort.padEnd(20)} ${barColor(bar)} ${pct}% (${donePoints}/${total} pts, ${iterItems.length} items)`);
  }

  if (backlog.length) {
    console.log(chalk.dim(`\n  Backlog: ${backlog.length} items (${backlog.reduce((sum, s) => sum + (s.storyPoints || 0), 0)} pts)`));
  }

  console.log(chalk.dim('\n  Use --sprint <name|number> for a detailed sprint report.'));
  console.log(chalk.dim('  Generated from local files - no API calls.'));

  // Build markdown for file
  const md = [];
  md.push(`# Project Overview: ${projectName}`);
  md.push(`\n**Date:** ${new Date().toISOString().slice(0, 10)}`);
  md.push(`**Total:** ${items.length} work items (${epics.length} epics, ${features.length} features, ${stories.length} stories/bugs/tasks)\n`);
  md.push(`| Sprint | Progress | Points | Items |`);
  md.push(`|---|---|---|---|`);

  for (const iter of sortedIterations) {
    const iterItems = byIteration[iter];
    const total = iterItems.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const done = iterItems.filter((s) => s.state === 'Closed' || s.state === 'Resolved');
    const donePoints = done.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const pct = total > 0 ? Math.round((donePoints / total) * 100) : 0;
    const iterShort = iter.split('\\').pop();
    md.push(`| ${iterShort} | ${pct}% | ${donePoints}/${total} | ${iterItems.length} |`);
  }

  if (backlog.length) {
    md.push(`\n**Backlog:** ${backlog.length} items (${backlog.reduce((sum, s) => sum + (s.storyPoints || 0), 0)} pts)`);
  }

  md.push('\n---\n*Generated by adoboards from local files.*\n');
  return md.join('\n');
}

function buildBar(pct) {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  return `[${'='.repeat(filled)}${' '.repeat(empty)}]`;
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
