import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, parse as parsePath } from 'node:path';

const ADOBOARDS_DIR = '.adoboards';

/**
 * Walk up from basePath to find the nearest directory containing .adoboards/.
 * Returns the project root path or null if not found.
 */
export function findProjectRoot(basePath) {
  let dir = resolve(basePath);
  while (true) {
    if (existsSync(join(dir, ADOBOARDS_DIR))) return dir;
    const parent = parsePath(dir).dir;
    if (parent === dir) return null;
    dir = parent;
  }
}

function ensureDir(basePath) {
  const dir = join(basePath, ADOBOARDS_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function readConfig(basePath) {
  const root = findProjectRoot(basePath);
  if (!root) return null;
  return readJson(join(root, ADOBOARDS_DIR, 'config.json'));
}

export function writeConfig(basePath, data) {
  ensureDir(basePath);
  writeJson(join(basePath, ADOBOARDS_DIR, 'config.json'), data);
}

export function readRefs(basePath) {
  const root = findProjectRoot(basePath);
  if (!root) return {};
  return readJson(join(root, ADOBOARDS_DIR, 'refs.json')) || {};
}

export function writeRefs(basePath, data) {
  const root = findProjectRoot(basePath) || basePath;
  ensureDir(root);
  writeJson(join(root, ADOBOARDS_DIR, 'refs.json'), data);
}

export function readStaged(basePath) {
  const root = findProjectRoot(basePath);
  if (!root) return [];
  return readJson(join(root, ADOBOARDS_DIR, 'staged.json')) || [];
}

export function writeStaged(basePath, data) {
  const root = findProjectRoot(basePath) || basePath;
  ensureDir(root);
  writeJson(join(root, ADOBOARDS_DIR, 'staged.json'), data);
}
