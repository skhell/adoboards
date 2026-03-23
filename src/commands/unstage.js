import { join, resolve, relative } from 'node:path';
import chalk from 'chalk';
import { readStaged, writeStaged, findProjectRoot } from '../core/state.js';

export async function unstage(files, opts) {
  const root = findProjectRoot('.');
  if (!root) {
    console.error(chalk.red('\n  Not inside an adoboards project. Run adoboards clone first.\n'));
    process.exit(1);
  }

  const stagedArr = readStaged(root);
  const before = stagedArr.length;

  const clearAll = files.length === 1 && files[0] === '.';

  if (clearAll) {
    writeStaged(root, []);
    if (before === 0) {
      console.log(chalk.yellow('\n  Nothing staged.\n'));
    } else {
      console.log(chalk.green(`\n  Unstaged ${before} file${before !== 1 ? 's' : ''}.\n`));
    }
    return;
  }

  // Unstage specific files
  const notFound = [];
  const toRemove = new Set();
  for (const file of files) {
    const abs = resolve(file);
    const rel = relative(root, abs);
    if (stagedArr.includes(rel)) {
      toRemove.add(rel);
    } else if (stagedArr.includes(file)) {
      toRemove.add(file);
    } else {
      notFound.push(file);
    }
  }

  const newStaged = stagedArr.filter(f => !toRemove.has(f));
  writeStaged(root, newStaged);

  const removed = before - newStaged.length;
  if (removed > 0) {
    console.log(chalk.green(`\n  Unstaged ${removed} file${removed !== 1 ? 's' : ''}.`));
  }
  if (notFound.length) {
    console.log(chalk.yellow(`\n  Not in staging area:`));
    for (const f of notFound) console.log(chalk.dim(`    ${f}`));
  }
  if (removed === 0 && !notFound.length) {
    console.log(chalk.yellow('\n  Nothing to unstage.'));
  }
  console.log();
}
