import { promises as fs } from 'node:fs';
import path from 'node:path';

const MODULE_DIR_RE = /^spring-petclinic-(.+)$/;

export async function detectMicroservices(repoRoot: string): Promise<string[]> {
  const root = path.resolve(repoRoot);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const services: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = e.name.match(MODULE_DIR_RE);
    if (m) services.push(m[1]!);
  }
  services.sort();
  return services;
}

export function microserviceFromPath(
  repoRoot: string,
  filePath: string,
): string | null {
  const root = path.resolve(repoRoot);
  const abs = path.resolve(filePath);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const first = rel.split(path.sep)[0];
  if (!first) return null;
  const m = first.match(MODULE_DIR_RE);
  return m ? m[1]! : null;
}
