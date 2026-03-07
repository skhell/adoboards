import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import * as ado from '../api/ado.js';
import { writeConfig, writeRefs } from '../core/state.js';
import {
  adoToMarkdown,
  workItemFileName,
  workItemDirPath,
  buildParentMap,
} from '../core/mapper.js';

/**
 * Parse an Azure DevOps URL into org URL and project name.
 * Supports:
 *   https://dev.azure.com/org/project
 *   https://org.visualstudio.com/project
 */
function parseAdoUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `Invalid URL: ${url}\n` +
      `  Expected: https://dev.azure.com/org/project\n` +
      `       or:  https://org.visualstudio.com/project`,
    );
  }

  const segments = parsed.pathname.split('/').filter(Boolean);

  // https://dev.azure.com/org/project -> segments = ['org', 'project']
  if (parsed.hostname === 'dev.azure.com') {
    if (segments.length < 2) {
      throw new Error(
        `URL must include org and project: https://dev.azure.com/org/project\n` +
        `  Got: ${url}`,
      );
    }
    const org = segments[0];
    const project = decodeURIComponent(segments[1]);
    const orgUrl = `${parsed.protocol}//${parsed.hostname}/${org}`;
    return { orgUrl, project };
  }

  // https://org.visualstudio.com/project -> segments = ['project']
  if (parsed.hostname.endsWith('.visualstudio.com')) {
    if (segments.length < 1) {
      throw new Error(
        `URL must include project: https://org.visualstudio.com/project\n` +
        `  Got: ${url}`,
      );
    }
    const project = decodeURIComponent(segments[0]);
    const orgUrl = `${parsed.protocol}//${parsed.hostname}`;
    return { orgUrl, project };
  }

  throw new Error(
    `Unrecognized Azure DevOps URL format: ${url}\n` +
    `  Expected: https://dev.azure.com/org/project\n` +
    `       or:  https://org.visualstudio.com/project`,
  );
}

export default async function cloneCommand(url, opts = {}) {
  const { orgUrl, project } = parseAdoUrl(url);
  const targetDir = project;

  if (existsSync(targetDir)) {
    console.error(chalk.red(`Directory "${targetDir}" already exists. Remove it or use a different name.`));
    process.exit(1);
  }

  // Default to current year if no --since specified
  const since = opts.all ? null : (opts.since || `${new Date().getFullYear()}-01-01`);
  const states = opts.all ? null : ['New', 'Active', 'Resolved'];
  const assignees = opts.assignee
    ? opts.assignee.split(',').map((a) => a.trim())
    : null;

  const filters = [];
  if (opts.area) filters.push(`area: ${opts.area}`);
  if (since) filters.push(`since: ${since}`);
  if (!opts.all) filters.push('states: New/Active/Resolved');
  if (assignees) filters.push(`assignee: ${assignees.join(', ')}`);
  if (opts.all) filters.push('all (no filters)');
  console.log(chalk.bold(`Cloning ${project} from ${orgUrl}...\n`));
  console.log(chalk.dim(`  Filters: ${filters.join(' | ')}\n`));

  // 1. Resolve current user identity
  let userEmail = '';
  process.stdout.write('  Resolving identity... ');
  try {
    const me = await ado.whoAmI(orgUrl);
    userEmail = me.email;
    console.log(chalk.green(userEmail || me.displayName || 'done'));
  } catch {
    console.log(chalk.yellow('skipped (non-fatal)'));
  }

  // 2. Fetch areas and iterations
  process.stdout.write('  Fetching areas... ');
  const areas = await ado.getAreas(orgUrl, project);
  console.log(chalk.green('done'));

  process.stdout.write('  Fetching iterations... ');
  const iterations = await ado.getIterations(orgUrl, project);
  console.log(chalk.green('done'));

  // 2. Fetch work items (scoped to area if provided)
  // ADO's UNDER operator fetches the area AND all children at any depth
  process.stdout.write('  Fetching work items... ');
  const workItems = await ado.getAllWorkItems(orgUrl, project, {
    area: opts.area,
    since,
    states,
    assignees,
  });
  console.log(chalk.green(`${workItems.length} items`));

  if (!workItems.length) {
    const hint = opts.area
      ? `\n  No work items found under area: ${opts.area}`
      : '\n  No work items found in this project.';
    console.log(chalk.yellow(hint));
    mkdirSync(targetDir, { recursive: true });
    writeConfig(targetDir, { orgUrl, project, lastSync: new Date().toISOString() });
    writeRefs(targetDir, {});
    console.log(chalk.green(`\n  Created ${targetDir}/ (empty project)\n`));
    return;
  }

  // 3. Build parent map for hierarchy resolution
  const parentMap = buildParentMap(workItems);

  // 4. Write markdown files and build refs
  const refs = {};
  let written = 0;

  for (const wi of workItems) {
    const type = wi.fields['System.WorkItemType'];
    const dirPath = workItemDirPath(wi, project, parentMap);
    const name = workItemFileName(wi);
    const fullDir = join(targetDir, dirPath);

    let filePath;
    if (type === 'Epic' || type === 'Feature') {
      const itemDir = join(fullDir, name);
      mkdirSync(itemDir, { recursive: true });
      filePath = join(itemDir, `${type.toLowerCase()}.md`);
    } else {
      mkdirSync(fullDir, { recursive: true });
      filePath = join(fullDir, `${name}.md`);
    }

    const markdown = adoToMarkdown(wi);
    writeFileSync(filePath, markdown, 'utf-8');

    const relPath = filePath.slice(targetDir.length + 1);
    refs[wi.id] = {
      path: relPath,
      rev: wi.rev,
      fields: wi.fields,
    };
    written++;
  }

  // 5. Create iteration folder structure for current year and future only
  const iterationPaths = flattenTree(iterations);
  const currentYear = new Date().getFullYear();
  const areaPaths = workItems.length
    ? [...new Set(workItems.map((wi) => {
        const ap = wi.fields['System.AreaPath'] || project;
        const rel = ap.startsWith(project + '\\')
          ? ap.slice(project.length + 1).replace(/\\/g, '/')
          : ap.replace(/\\/g, '/');
        return rel ? `areas/${rel}` : 'areas';
      }))]
    : ['areas'];

  for (const areaDir of areaPaths) {
    for (const iterPath of iterationPaths) {
      // Strip project name prefix from iteration path
      const iterRel = iterPath.startsWith(project + '\\')
        ? iterPath.slice(project.length + 1).replace(/\\/g, '/')
        : iterPath.replace(/\\/g, '/');
      if (!iterRel || iterRel === project) continue;

      // Skip past year iterations - look for year patterns like 2021, Y23, FY25, Q1 2025
      const yearMatch = iterRel.match(/(?:^|[^0-9])(?:(?:F?Y)(\d{2})|(20\d{2}))(?:[^0-9]|$)/i);
      if (yearMatch) {
        const year = yearMatch[2]
          ? Number(yearMatch[2])
          : 2000 + Number(yearMatch[1]);
        if (year < currentYear) continue;
      }

      const iterDir = join(targetDir, areaDir, 'iterations', iterRel);
      mkdirSync(iterDir, { recursive: true });
    }
  }

  // 6. Write state files
  const cloneConfig = {
    orgUrl,
    project,
    lastSync: new Date().toISOString(),
    areas: flattenTree(areas),
    iterations: flattenTree(iterations),
  };
  if (opts.area) cloneConfig.areaFilter = opts.area;
  if (since) cloneConfig.sinceFilter = since;
  if (!opts.all) cloneConfig.stateFilter = ['New', 'Active', 'Resolved'];
  if (assignees) cloneConfig.assigneeFilter = assignees;
  if (userEmail) cloneConfig.userEmail = userEmail;
  writeConfig(targetDir, cloneConfig);

  writeRefs(targetDir, refs);

  // Summary
  const counts = {};
  for (const wi of workItems) {
    const type = wi.fields['System.WorkItemType'];
    counts[type] = (counts[type] || 0) + 1;
  }

  console.log(chalk.bold(`\n  Wrote ${written} files to ${targetDir}/`));
  for (const [type, count] of Object.entries(counts)) {
    console.log(`    ${type}: ${chalk.cyan(count)}`);
  }
  console.log(chalk.dim(`\n  State saved to ${targetDir}/.adoboards/\n`));
}

function flattenTree(node, prefix = '') {
  const paths = [];
  const name = prefix ? `${prefix}\\${node.name}` : node.name;
  paths.push(name);
  if (node.children) {
    for (const child of node.children) {
      paths.push(...flattenTree(child, name));
    }
  }
  return paths;
}
