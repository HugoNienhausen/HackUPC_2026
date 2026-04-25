import type { ClassRecord, Edge as IndexEdge } from '../index/types.js';
import type { Component, DependenciesSchema } from '@devmap/schema';
import { z } from 'zod';

type Dependencies = z.infer<typeof DependenciesSchema>;

export interface BuildDependenciesInput {
  components: Component[];
  classes: ClassRecord[];
  edges: IndexEdge[];
}

const idForFqn = (fqn: string): string =>
  fqn.replace(/^org\.springframework\.samples\.petclinic\./, '');

export function buildDependencies({
  components,
  classes,
  edges,
}: BuildDependenciesInput): Dependencies {
  const componentIds = new Set(components.map((c) => c.id));
  const componentFqns = new Set(components.map((c) => c.fqn));
  const componentMicroservices = new Set(components.map((c) => c.microservice));

  const nodes: Dependencies['nodes'] = components.map((c) => ({
    id: c.id,
    label: c.simpleName,
    microservice: c.microservice,
    kind: c.kind,
    loc: c.loc ?? 0,
  }));

  const fqnByFile = new Map<string, string>();
  for (const c of classes) fqnByFile.set(c.relativePath, c.fqn);

  const out: Dependencies['edges'] = [];
  const seen = new Set<string>();
  const dedup = (key: string): boolean => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  for (const e of edges) {
    if (e.type === 'import') {
      if (!e.via) continue;
      const m = e.via.match(/^(\S+) -> (\S+)$/);
      if (!m) continue;
      const fromFqn = m[1]!;
      const toFqn = m[2]!;
      if (!componentFqns.has(fromFqn) || !componentFqns.has(toFqn)) continue;
      const from = idForFqn(fromFqn);
      const to = idForFqn(toFqn);
      if (!dedup(`import|${from}|${to}`)) continue;
      out.push({ from, to, type: 'import' });
      continue;
    }

    if (e.type === 'http' || e.type === 'discovery') {
      const sourceFqn = e.sourceFile ? fqnByFile.get(e.sourceFile) : undefined;
      if (!sourceFqn) continue;
      if (!componentFqns.has(sourceFqn)) continue;
      const from = idForFqn(sourceFqn);
      const to = e.to;
      if (!dedup(`${e.type}|${from}|${to}|${e.sourceLine ?? ''}`)) continue;
      out.push({
        from,
        to,
        type: e.type,
        ...(e.sourceFile ? { sourceFile: e.sourceFile } : {}),
        ...(e.sourceLine !== undefined ? { sourceLine: e.sourceLine } : {}),
      });
      continue;
    }

    if (e.type === 'gateway-route') {
      if (!componentMicroservices.has(e.from) && !componentMicroservices.has(e.to)) continue;
      const key = `gateway-route|${e.from}|${e.to}|${e.via ?? ''}`;
      if (!dedup(key)) continue;
      out.push({
        from: e.from,
        to: e.to,
        type: 'gateway-route',
        ...(e.via ? { label: `${e.via} -> lb://${e.to}` } : {}),
        ...(e.sourceFile ? { sourceFile: e.sourceFile } : {}),
      });
      continue;
    }
  }

  return { nodes, edges: out };
}
