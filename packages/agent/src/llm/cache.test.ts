import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { cacheKey, cacheLocation, readCache, writeCache } from './cache.js';

describe('cache key + location', () => {
  it('cacheKey is stable across calls for the same repo', () => {
    const a = cacheKey(process.cwd());
    const b = cacheKey(process.cwd());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('cacheKey differs between two distinct repo paths', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-test-'));
    const a = cacheKey(process.cwd());
    const b = cacheKey(tmp);
    expect(a).not.toBe(b);
  });

  it('cacheLocation puts files under <ws>/.devmap/cache/<key>/<feature>.json', () => {
    const loc = cacheLocation('/ws', '/repo', 'visits');
    expect(loc.file.startsWith('/ws/.devmap/cache/')).toBe(true);
    expect(loc.file.endsWith('/visits.json')).toBe(true);
    expect(loc.dir.startsWith('/ws/.devmap/cache/')).toBe(true);
  });
});

describe('cache read/write round-trip', () => {
  it('writeCache + readCache returns the same payload', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-rw-'));
    const loc = cacheLocation(tmp, process.cwd(), 'demo');
    expect(await readCache(loc)).toBeNull();
    await writeCache(loc, { hello: 'world', n: 42 });
    expect(await readCache(loc)).toEqual({ hello: 'world', n: 42 });
  });

  it('readCache returns null for missing file', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-miss-'));
    const loc = cacheLocation(tmp, process.cwd(), 'nope');
    expect(await readCache(loc)).toBeNull();
  });
});
