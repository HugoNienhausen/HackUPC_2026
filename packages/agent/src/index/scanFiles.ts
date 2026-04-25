import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
}

const SKIP_DIRS = new Set([
  'target',
  'build',
  'node_modules',
  '.git',
  '.idea',
  '.vscode',
  '.mvn',
  'docker',
  'docs',
]);

export async function scanFiles(repoRoot: string): Promise<ScannedFile[]> {
  const root = path.resolve(repoRoot);
  const out: ScannedFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name === 'test' || entry.name === 'tests') continue;
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        out.push({
          absolutePath: full,
          relativePath: path.relative(root, full),
        });
      }
    }
  }

  await walk(root);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}
