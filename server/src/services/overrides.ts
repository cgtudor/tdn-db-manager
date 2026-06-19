import fs from 'fs';
import path from 'path';

const isLinux = process.platform === 'linux';

export interface OverrideFile {
  name: string;
  size: number;
  mtime: number;
}

function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Resolve a user-supplied filename against an overrides directory, rejecting
 * any attempt to escape it (path separators, traversal). This is the main
 * security surface for upload/delete — every write/delete must go through it.
 */
export function resolveSafe(dir: string, name: string): string {
  if (!name || name === '.' || name === '..') {
    throw new Error('Invalid file name');
  }
  // Reject anything that isn't a bare filename (no separators, no traversal).
  if (name !== path.basename(name) || name.includes('/') || name.includes('\\')) {
    throw new Error('Invalid file name');
  }
  const base = path.resolve(ensureDir(dir));
  const resolved = path.resolve(base, name);
  if (resolved !== path.join(base, name) || !resolved.startsWith(base + path.sep)) {
    throw new Error('Invalid file name');
  }
  return resolved;
}

export function listFiles(dir: string): OverrideFile[] {
  const root = ensureDir(dir);
  const entries = fs.readdirSync(root);
  const results: OverrideFile[] = [];

  for (const name of entries) {
    const filePath = path.join(root, name);
    let stats: fs.Stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;
    results.push({ name, size: stats.size, mtime: stats.mtimeMs });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function writeFile(dir: string, name: string, data: Buffer): void {
  const target = resolveSafe(dir, name);
  fs.writeFileSync(target, data);
  if (isLinux) {
    try { fs.chmodSync(target, 0o666); } catch { /* best effort */ }
  }
}

export function deleteFile(dir: string, name: string): void {
  const target = resolveSafe(dir, name);
  if (!fs.existsSync(target)) {
    throw new Error(`File not found: ${name}`);
  }
  fs.unlinkSync(target);
}
