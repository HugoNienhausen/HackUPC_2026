import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

export const DEVMAP_VERSION = '1.0.0';

/**
 * Cache key composition (Phase 5 precision #3):
 *   sha1( absolute(repoPath) + git-HEAD-of-repo + devmapVersion )[0..8]
 *
 * Invalidates when:
 *   - the user runs against a different repo path
 *   - target repo's HEAD moves (a commit lands in PetClinic etc.)
 *   - our output schema/contract bumps devmapVersion
 *
 * If the target dir isn't a git repo (e.g. a tarball extract), HEAD falls
 * back to "no-git" so the cache still works but is coarser.
 */
export function cacheKey(repoPath: string): string {
  const abs = path.resolve(repoPath);
  let head = 'no-git';
  try {
    head = execSync('git rev-parse HEAD', {
      cwd: abs,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // not a git repo or git not available
  }
  return createHash('sha1')
    .update(`${abs}|${head}|${DEVMAP_VERSION}`)
    .digest('hex')
    .slice(0, 8);
}

function cacheDir(workspaceRoot: string): string {
  return path.resolve(workspaceRoot, '.devmap', 'cache');
}

export interface CacheLocation {
  dir: string;
  file: string;
}

export function cacheLocation(
  workspaceRoot: string,
  repoPath: string,
  feature: string,
): CacheLocation {
  const key = cacheKey(repoPath);
  const dir = path.join(cacheDir(workspaceRoot), key);
  return {
    dir,
    file: path.join(dir, `${feature}.json`),
  };
}

export async function readCache<T>(loc: CacheLocation): Promise<T | null> {
  try {
    const text = await fs.readFile(loc.file, 'utf8');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeCache(loc: CacheLocation, value: unknown): Promise<void> {
  await fs.mkdir(loc.dir, { recursive: true });
  await fs.writeFile(loc.file, JSON.stringify(value, null, 2), 'utf8');
}
