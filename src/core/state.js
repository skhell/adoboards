import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ADOBOARDS_DIR = '.adoboards';

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
  return readJson(join(basePath, ADOBOARDS_DIR, 'config.json'));
}

export function writeConfig(basePath, data) {
  ensureDir(basePath);
  writeJson(join(basePath, ADOBOARDS_DIR, 'config.json'), data);
}

export function readRefs(basePath) {
  return readJson(join(basePath, ADOBOARDS_DIR, 'refs.json')) || {};
}

export function writeRefs(basePath, data) {
  ensureDir(basePath);
  writeJson(join(basePath, ADOBOARDS_DIR, 'refs.json'), data);
}

export function readStaged(basePath) {
  return readJson(join(basePath, ADOBOARDS_DIR, 'staged.json')) || [];
}

export function writeStaged(basePath, data) {
  ensureDir(basePath);
  writeJson(join(basePath, ADOBOARDS_DIR, 'staged.json'), data);
}
