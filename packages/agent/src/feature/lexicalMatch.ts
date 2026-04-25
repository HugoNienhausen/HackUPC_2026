import type { ClassRecord } from '../index/types.js';

export interface LexicalMatch {
  fqn: string;
  simpleName: string;
  microservice: string | null;
  score: number;
  hits: { name: boolean; package: boolean; path: boolean };
}

export function stemFor(featureName: string): string {
  return featureName.toLowerCase().replace(/s$/, '');
}

export function lexicalMatch(
  classes: ClassRecord[],
  featureName: string,
  threshold = 1,
): LexicalMatch[] {
  const stem = stemFor(featureName);
  const out: LexicalMatch[] = [];
  for (const c of classes) {
    if (c.flags.bootstrap || c.flags.crossCutting) continue;
    const name = c.simpleName.toLowerCase().includes(stem);
    const pkg = c.package.toLowerCase().includes(stem);
    const path = c.relativePath.toLowerCase().includes(stem);
    let score = 0;
    if (name) score += 3;
    if (pkg) score += 2;
    if (path) score += 1;
    if (score < threshold) continue;
    out.push({
      fqn: c.fqn,
      simpleName: c.simpleName,
      microservice: c.microservice,
      score,
      hits: { name, package: pkg, path },
    });
  }
  out.sort((a, b) => b.score - a.score || a.fqn.localeCompare(b.fqn));
  return out;
}
