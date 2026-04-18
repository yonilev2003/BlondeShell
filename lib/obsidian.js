import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = join(__dirname, '..', 'obsidian', 'blondeshell-brain');

const SECTIONS = ['APIs', 'Rules', 'Patterns', 'Arcs', 'Mistakes', 'Changelog'];

function resolvePath(relative) {
  const p = join(VAULT_ROOT, relative);
  if (!p.startsWith(VAULT_ROOT)) throw new Error(`Path escapes vault: ${relative}`);
  return p;
}

export function readNote(relativePath) {
  const path = resolvePath(relativePath);
  if (!existsSync(path)) throw new Error(`Vault note not found: ${relativePath}`);
  return readFileSync(path, 'utf8');
}

export function writeNote(relativePath, content, { overwrite = true } = {}) {
  const path = resolvePath(relativePath);
  if (!overwrite && existsSync(path)) throw new Error(`Note exists and overwrite=false: ${relativePath}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

export function listSection(section) {
  const path = resolvePath(section);
  if (!existsSync(path)) return [];
  return readdirSync(path).filter(f => f.endsWith('.md'));
}

export function listAll() {
  const result = {};
  for (const section of SECTIONS) {
    result[section] = listSection(section);
  }
  return result;
}

export function findByTitle(query) {
  const needle = query.toLowerCase();
  const hits = [];
  for (const section of SECTIONS) {
    for (const file of listSection(section)) {
      if (file.toLowerCase().includes(needle)) {
        hits.push(`${section}/${file}`);
      }
    }
  }
  return hits;
}

export function loadAPIReference(name) {
  const filename = `${name}.md`;
  return readNote(`APIs/${filename}`);
}

export function vaultPath(relative = '') {
  return relative ? join(VAULT_ROOT, relative) : VAULT_ROOT;
}
