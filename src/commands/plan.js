import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';
import { generate } from '../api/ai.js';
import { readConfig, readRefs, writeRefs, findProjectRoot } from '../core/state.js';

export default async function planCommand(opts = {}) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('Not an adoboards project. Run adoboards clone first.'));
    process.exit(1);
  }

  const config = readConfig(root);
  const refs = readRefs(root);

  // Validate team capacity is configured
  const teamSize = config.teamSize || Number(opts.teamSize);
  const velocity = config.velocityPerPerson || Number(opts.velocity);
  const sprintDays = config.sprintLengthDays || 14;

  if (!teamSize || !velocity) {
    console.error(chalk.red('  Team capacity not configured.'));
    console.error(chalk.red('  Run: adoboards config (set team size and velocity)'));
    console.error(chalk.red('  Or use: --team-size <n> --velocity <n>\n'));
    process.exit(1);
  }

  const totalCapacity = teamSize * velocity;

  // Collect unassigned stories (no iteration set)
  const areasDir = join(root, 'areas');
  const allFiles = findMdRecursive(areasDir, root);
  const unassigned = [];

  for (const relPath of allFiles) {
    try {
      const content = readFileSync(join(root, relPath), 'utf-8');
      const { data } = matter(content);

      if (!data.type || !['Story', 'Bug', 'Task'].includes(data.type)) continue;
      if (data.iteration && data.iteration.trim()) continue; // already assigned

      unassigned.push({
        path: relPath,
        id: data.id,
        title: data.title || '(untitled)',
        type: data.type,
        storyPoints: data.storyPoints || 0,
        businessValue: data.businessValue || 0,
        parent: data.parent || null,
      });
    } catch {
      // Skip unreadable files
    }
  }

  if (!unassigned.length) {
    console.log(chalk.dim('\n  No unassigned stories found. All items have iterations.\n'));
    return;
  }

  // Sort by business value (highest first)
  unassigned.sort((a, b) => (b.businessValue || 0) - (a.businessValue || 0));

  // Get available sprints from config iterations
  const iterations = config.iterations || [];
  const currentYear = new Date().getFullYear();
  const sprints = iterations
    .filter((iter) => {
      // Only future/current sprints (contains current year or later)
      const yearMatch = iter.match(/(20\d{2})/);
      return yearMatch ? Number(yearMatch[1]) >= currentYear : true;
    })
    .filter((iter) => {
      // Only leaf-level sprints (contain Sprint or similar)
      return /sprint|iteration/i.test(iter) || iter.split('\\').length >= 3;
    });

  const storiesText = unassigned.map((s) =>
    `- [${s.id}] "${s.title}" (${s.type}, ${s.storyPoints} pts, bv:${s.businessValue}, parent:${s.parent || 'none'})`
  ).join('\n');

  const sprintsText = sprints.length
    ? sprints.map((s) => `- ${s}`).join('\n')
    : '- (no sprints found in config - AI will suggest generic sprint names)';

  console.log(chalk.bold(`\n  Sprint Planning\n`));
  console.log(chalk.dim(`  Team: ${teamSize} people, ${velocity} pts/person/sprint`));
  console.log(chalk.dim(`  Capacity per sprint: ${totalCapacity} pts`));
  console.log(chalk.dim(`  Stories to plan: ${unassigned.length}`));
  console.log(chalk.dim(`  Total points: ${unassigned.reduce((sum, s) => sum + (s.storyPoints || 0), 0)}`));
  console.log(chalk.dim(`  Available sprints: ${sprints.length}\n`));

  process.stdout.write('  Calling AI for sprint distribution... ');

  let result;
  try {
    result = await generate('plan', {
      teamSize: String(teamSize),
      velocity: String(velocity),
      sprintDays: String(sprintDays),
      totalCapacity: String(totalCapacity),
      sprints: sprintsText,
      stories: storiesText,
    }, { provider: opts.provider });
  } catch (err) {
    console.log(chalk.red('failed'));
    console.error(chalk.red(`\n  ${err.message}\n`));
    process.exit(1);
  }
  console.log(chalk.green('done\n'));

  // Parse AI result
  let plan;
  try {
    // Extract JSON from response (might be wrapped in code fences)
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    plan = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(chalk.red(`  Failed to parse AI plan: ${err.message}`));
    console.error(chalk.dim('  AI response:'));
    console.error(chalk.dim(`  ${result.slice(0, 500)}\n`));
    process.exit(1);
  }

  // Display the plan
  console.log(chalk.bold('  Proposed Sprint Plan:\n'));

  // Group by sprint
  const bySpprint = {};
  for (const item of plan) {
    const sprint = item.sprint || 'backlog';
    if (!bySpprint[sprint]) bySpprint[sprint] = [];
    bySpprint[sprint].push(item);
  }

  for (const [sprint, items] of Object.entries(bySpprint)) {
    const pts = items.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const pct = Math.round((pts / totalCapacity) * 100);
    const bar = '='.repeat(Math.min(Math.round(pct / 5), 20));
    const color = pct > 80 ? chalk.red : pct > 60 ? chalk.yellow : chalk.green;

    console.log(chalk.bold(`  ${sprint}`) + chalk.dim(` (${pts}/${totalCapacity} pts, ${pct}%)`));
    console.log(color(`  [${bar.padEnd(20)}]`));
    for (const item of items) {
      console.log(chalk.dim(`    [${item.id}] ${item.title} (${item.storyPoints} pts) - ${item.reason || ''}`));
    }
    console.log();
  }

  if (!opts.apply) {
    console.log(chalk.dim('  Run with --apply to update iteration in files.\n'));
    return;
  }

  // Apply the plan - update iteration frontmatter in files
  let applied = 0;
  for (const item of plan) {
    if (!item.sprint) continue; // skip backlog items

    // Find the matching file
    const match = unassigned.find((s) =>
      String(s.id) === String(item.id) || s.title === item.title
    );
    if (!match) continue;

    try {
      const absPath = join(root, match.path);
      const content = readFileSync(absPath, 'utf-8');
      const updated = content.replace(/^iteration:\s*"?.*"?$/m, `iteration: "${item.sprint}"`);
      writeFileSync(absPath, updated, 'utf-8');
      applied++;
    } catch {
      console.log(chalk.yellow(`  Could not update: ${match.path}`));
    }
  }

  console.log(chalk.green(`  Applied sprint assignments to ${applied} files.`));
  console.log(chalk.dim(`  Run: adoboards add . && adoboards push\n`));
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
