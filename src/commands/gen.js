import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import matter from 'gray-matter';
import { generate } from '../api/ai.js';
import { readConfig, findProjectRoot } from '../core/state.js';
import globalConfig from '../core/config.js';

/**
 * Resolve the idea argument to a string.
 * - Absolute path or ~/...: read file directly.
 * - Relative path (contains / or \): read relative to cwd.
 * - Name with or without .md (no path separators): look in ~/.adoboards/gen/YEAR/
 * - Otherwise: use as-is (inline idea text).
 */
function resolveIdea(idea) {
  const expanded = idea.startsWith('~/')
    ? join(homedir(), idea.slice(2))
    : idea;

  // Absolute or ~/
  if (isAbsolute(expanded) || idea.startsWith('~/')) {
    if (!existsSync(expanded)) {
      console.error(chalk.red(`Idea file not found: ${expanded}`));
      process.exit(1);
    }
    console.log(chalk.dim(`  Loading idea from: ${expanded}\n`));
    return readFileSync(expanded, 'utf-8').trim();
  }

  // Relative path (has separators) -> resolve from cwd
  if (/[/\\]/.test(idea)) {
    const resolved = join(process.cwd(), idea);
    if (!existsSync(resolved)) {
      console.error(chalk.red(`Idea file not found: ${resolved}`));
      process.exit(1);
    }
    console.log(chalk.dim(`  Loading idea from: ${resolved}\n`));
    return readFileSync(resolved, 'utf-8').trim();
  }

  // Name (with or without .md, no path separators) -> check cwd first, then ~/.adoboards/gen/YEAR/
  if (!/[/\\]/.test(idea)) {
    const name = idea.endsWith('.md') ? idea : `${idea}.md`;

    // 1. Current working directory
    const cwdPath = join(process.cwd(), name);
    if (existsSync(cwdPath)) {
      console.log(chalk.dim(`  Loading idea from: ${cwdPath}\n`));
      return readFileSync(cwdPath, 'utf-8').trim();
    }

    // 2. Global store ~/.adoboards/gen/YEAR/
    const year = new Date().getFullYear();
    for (let y = year; y >= year - 2; y--) {
      const ideaPath = join(homedir(), '.adoboards', 'gen', String(y), name);
      if (existsSync(ideaPath)) {
        console.log(chalk.dim(`  Loading idea from: ${ideaPath}\n`));
        return readFileSync(ideaPath, 'utf-8').trim();
      }
    }

    // .md name not found anywhere -> error
    if (idea.endsWith('.md')) {
      console.error(chalk.red(`Idea file not found: ${idea}`));
      console.error(chalk.dim(`  Looked in: ${process.cwd()} and ~/.adoboards/gen/${year}/`));
      process.exit(1);
    }
  }

  // Inline text
  return idea;
}

/**
 * Resolve the project root.
 * Priority: --project flag -> findProjectRoot(cwd) -> global defaultProjectPath config
 */
function resolveRoot(opts) {
  if (opts.project) {
    const p = opts.project.startsWith('~/')
      ? join(homedir(), opts.project.slice(2))
      : opts.project;
    return p;
  }
  const fromCwd = findProjectRoot('.');
  if (fromCwd) return fromCwd;

  const defaultPath = globalConfig.get('defaultProjectPath');
  if (defaultPath) {
    const p = defaultPath.startsWith('~/')
      ? join(homedir(), defaultPath.slice(2))
      : defaultPath;
    return p;
  }

  console.error(chalk.red('Not inside an adoboards project.'));
  console.error(chalk.dim('  cd into your project, use --project <path>, or set a default:'));
  console.error(chalk.dim('  adoboards config  (set "Default project path")'));
  process.exit(1);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Resolve the backlog output directory for a given area path.
 * Always places generated files in areas/{area}/backlog/ at project root,
 * regardless of where the user runs the command.
 */
function resolveBacklogDir(root, area, project) {
  const areaRel = area.startsWith(project + '\\')
    ? area.slice(project.length + 1).replace(/\\/g, '/')
    : area.replace(/\\/g, '/');
  return areaRel
    ? join(root, 'areas', areaRel, 'backlog')
    : join(root, 'areas', 'backlog');
}

export default async function genCommand(ideaArg, opts = {}) {
  const root = resolveRoot(opts);
  const idea = resolveIdea(ideaArg);
  const config = readConfig(root);
  const type = (opts.type || 'hierarchy').toLowerCase();
  const validTypes = ['hierarchy', 'epic', 'feature', 'story'];
  if (!validTypes.includes(type)) {
    console.error(chalk.red(`Invalid type: ${type}. Choose: ${validTypes.join(', ')}`));
    process.exit(1);
  }

  // Require parent for feature and story
  if ((type === 'feature' || type === 'story') && !opts.parent) {
    console.error(chalk.red(`--parent <id> is required for --type ${type}`));
    process.exit(1);
  }

  const area = opts.area || config.areaFilter || globalConfig.get('defaultArea') || config.project || '';
  const assignee = opts.assignee || config.userEmail || globalConfig.get('userEmail') || '';

  // Always output to areas/{area}/backlog/ unless --dir is explicitly given
  const outputDir = opts.dir || resolveBacklogDir(root, area, config.project);

  const variables = {
    idea,
    area,
    assignee,
    parent: opts.parent || '',
  };

  console.log(chalk.bold(`\n  Generating ${type} from your idea...\n`));
  console.log(chalk.dim(`  Idea: ${idea.length > 120 ? idea.slice(0, 120) + '…' : idea}`));
  console.log(chalk.dim(`  Type: ${type}`));
  console.log(chalk.dim(`  Area: ${area}`));
  console.log(chalk.dim(`  Output: ${outputDir}`));
  if (opts.parent) console.log(chalk.dim(`  Parent: ${opts.parent}`));
  console.log();

  process.stdout.write('  Calling AI... ');
  let result;
  try {
    result = await generate(`gen-${type}`, variables, { provider: opts.provider });
  } catch (err) {
    console.log(chalk.red('failed'));
    console.error(chalk.red(`\n  ${err.message}\n`));
    process.exit(1);
  }
  console.log(chalk.green('done\n'));

  // Parse the AI response into individual files
  const files = parseGeneratedFiles(result);

  if (!files.length) {
    console.error(chalk.red('  AI returned no valid work items. Try rephrasing your idea.\n'));
    console.error(chalk.dim('  Raw response preview:\n'));
    console.error(chalk.dim(result.slice(0, 500)));
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });

  let written = 0;

  for (const fileContent of files) {
    try {
      const { data } = matter(fileContent);
      if (!data.type || !data.title) {
        const missing = [!data.type && 'type', !data.title && 'title'].filter(Boolean).join(', ');
        console.log(chalk.yellow(`  Skipped (missing ${missing}): ${String(data.title || '?').slice(0, 40)}`));
        continue;
      }

      const prefix = {
        Epic: 'EPIC', Feature: 'FEAT', Story: 'STORY',
        'User Story': 'STORY', Bug: 'BUG', Task: 'TASK',
      }[data.type] || data.type.toUpperCase();

      const slug = slugify(data.title);

      let filePath;
      if (prefix === 'EPIC' || prefix === 'FEAT') {
        const folderName = `${prefix}-pending-${slug}`;
        const itemFile = prefix === 'EPIC' ? 'epic.md' : 'feature.md';
        const folderPath = join(outputDir, folderName);
        mkdirSync(folderPath, { recursive: true });
        filePath = join(folderPath, itemFile);
      } else {
        // Stories/Bugs/Tasks sit flat in backlog alongside feature folders
        filePath = join(outputDir, `${prefix}-pending-${slug}.md`);
      }

      if (existsSync(filePath)) {
        console.log(chalk.yellow(`  Skipped (exists): ${filePath.slice(outputDir.length + 1)}`));
        continue;
      }

      // Post-process: enforce assignee if AI left it blank, then re-serialize
      // frontmatter through gray-matter so format (tags, etc.) matches pull/clone output
      if (assignee && (!data.assignee || data.assignee === '')) {
        data.assignee = assignee;
      }
      const { content: bodyContent } = matter(fileContent);
      const finalContent = matter.stringify(bodyContent, data);

      writeFileSync(filePath, finalContent, 'utf-8');
      console.log(chalk.green(`  Created: ${filePath.slice(root.length + 1)}`));
      written++;
    } catch (err) {
      console.log(chalk.yellow(`  Skipped (parse error): ${err.message}`));
    }
  }

  console.log(chalk.bold(`\n  Generated ${written} file${written !== 1 ? 's' : ''}.`));
  console.log(chalk.dim(`  Review, edit if needed, then: adoboards add . && adoboards push\n`));
}

/**
 * Normalize a single frontmatter block:
 * 1. Ensure it has a closing --- (add one if missing)
 * 2. Remove task-list lines (- [ ] / - [x]) from inside YAML - they break the parser
 * 3. Escape lone backslashes in YAML string values (ADO paths use \)
 */
function normalizeFrontmatter(block) {
  if (!block.startsWith('---')) return block;

  const firstNl = block.indexOf('\n');
  if (firstNl === -1) return block;

  const afterOpen = block.slice(firstNl + 1); // everything after opening ---

  // Find closing ---
  const closeMatch = afterOpen.match(/^---[ \t]*$/m);

  let fmBody, bodyContent;
  if (closeMatch) {
    fmBody = afterOpen.slice(0, closeMatch.index);
    bodyContent = afterOpen.slice(closeMatch.index + closeMatch[0].length);
  } else {
    // No closing --- - treat everything as frontmatter, body is empty
    fmBody = afterOpen;
    bodyContent = '';
  }

  // Strip task-list items from YAML (- [ ] / - [x]) - invalid YAML flow sequence
  fmBody = fmBody
    .split('\n')
    .filter(line => !/^\s*-\s*\[[ x]\]/.test(line))
    .join('\n');

  // Escape lone backslashes in YAML string values
  fmBody = fmBody.replace(/\\(?!\\)/g, '\\\\');

  return '---\n' + fmBody + '\n---' + bodyContent;
}

/**
 * Parse AI response into individual markdown files.
 * Files are separated by ---FILE--- or by detecting multiple frontmatter blocks.
 */
function parseGeneratedFiles(text) {
  // Strip markdown code fences if AI wrapped the output
  text = text
    .replace(/^```(?:markdown|yaml|md)?\s*\n?/gim, '')
    .replace(/^```\s*$/gim, '')
    .trim();

  let blocks;

  // Try ---FILE--- separator first
  if (text.includes('---FILE---')) {
    blocks = text
      .split('---FILE---')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('---'));
  } else {
    // Split only on blank line before --- that starts a NEW frontmatter block
    // (i.e., --- followed by known YAML keys like id:, type:, title:)
    // This prevents splitting on the closing --- of the current frontmatter
    const parts = text.split(/\n\n(?=---\n(?:id|type|title|area|state|parent)\s*:)/);
    if (parts.length > 1) {
      blocks = parts.map((s) => s.trim()).filter((s) => s.startsWith('---'));
    } else {
      // Single file
      const trimmed = text.trim();
      blocks = trimmed.startsWith('---') ? [trimmed] : [];
    }
  }

  // Normalize each block: fix missing closing ---, strip task-list items from YAML, escape backslashes
  return blocks.map(normalizeFrontmatter);
}
