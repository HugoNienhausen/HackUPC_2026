import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanFiles } from './scanFiles.js';

async function makeTempRepo(layout: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devmap-scan-'));
  for (const [rel, contents] of Object.entries(layout)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
  return root;
}

describe('scanFiles', () => {
  it('finds .java files recursively and skips target/, test/, node_modules/', async () => {
    const root = await makeTempRepo({
      'svc/src/main/java/A.java': 'class A {}',
      'svc/src/main/java/pkg/B.java': 'class B {}',
      'svc/src/test/java/ATest.java': 'class ATest {}',
      'svc/target/classes/A.class': 'binary',
      'svc/target/generated-sources/X.java': 'class X {}',
      'docs/notes.md': '# notes',
      'node_modules/dep/Y.java': 'class Y {}',
    });
    const files = await scanFiles(root);
    const rels = files.map((f) => f.relativePath).sort();
    expect(rels).toEqual([
      path.join('svc', 'src', 'main', 'java', 'A.java'),
      path.join('svc', 'src', 'main', 'java', 'pkg', 'B.java'),
    ]);
  });

  it('returns absolute and relative paths', async () => {
    const root = await makeTempRepo({ 'a/Foo.java': 'class Foo {}' });
    const [file] = await scanFiles(root);
    expect(file).toBeDefined();
    expect(path.isAbsolute(file!.absolutePath)).toBe(true);
    expect(file!.relativePath).toBe(path.join('a', 'Foo.java'));
  });

  it('runs against PetClinic in <2s', async () => {
    const repo = '/Users/hugonienhausen/Desktop/spring-petclinic-microservices';
    try {
      await fs.access(repo);
    } catch {
      return;
    }
    const start = Date.now();
    const files = await scanFiles(repo);
    const ms = Date.now() - start;
    expect(files.length).toBeGreaterThan(50);
    expect(ms).toBeLessThan(2000);
  });
});
