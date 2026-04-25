import type { ClassRecord, Edge } from '../index/types.js';

export interface ExpandResult {
  seed: Set<string>;
  expanded: Set<string>;
  byService: Map<string, string[]>;
}

function isEligible(c: ClassRecord): boolean {
  return !c.flags.bootstrap && !c.flags.crossCutting;
}

export function pickGatewayOriginClass(
  classes: ClassRecord[],
): ClassRecord | null {
  const ctrls = classes.filter(
    (c) => c.microservice === 'api-gateway' && c.kind === 'controller' && isEligible(c),
  );
  if (ctrls.length === 0) return null;
  const named = ctrls
    .filter((c) => c.simpleName.toLowerCase().includes('gateway'))
    .sort((a, b) => a.simpleName.localeCompare(b.simpleName));
  if (named.length > 0) return named[0]!;
  return [...ctrls].sort((a, b) => a.simpleName.localeCompare(b.simpleName))[0]!;
}

export function buildAdjacency(
  classes: ClassRecord[],
  edges: Edge[],
): Map<string, Set<string>> {
  const eligible = new Set(classes.filter(isEligible).map((c) => c.fqn));
  const fqnByFile = new Map<string, string>();
  for (const c of classes) {
    if (isEligible(c)) fqnByFile.set(c.relativePath, c.fqn);
  }
  const controllersByService = new Map<string, string[]>();
  for (const c of classes) {
    if (!isEligible(c) || c.kind !== 'controller' || !c.microservice) continue;
    const list = controllersByService.get(c.microservice) ?? [];
    list.push(c.fqn);
    controllersByService.set(c.microservice, list);
  }

  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!eligible.has(a) || !eligible.has(b)) return;
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  for (const e of edges) {
    if (e.type !== 'import' || !e.via) continue;
    const m = e.via.match(/^(\S+) -> (\S+)$/);
    if (!m) continue;
    link(m[1]!, m[2]!);
  }

  for (const e of edges) {
    if (e.type !== 'http' && e.type !== 'discovery') continue;
    const sourceFqn = e.sourceFile ? fqnByFile.get(e.sourceFile) : undefined;
    if (!sourceFqn) continue;
    const targets = controllersByService.get(e.to) ?? [];
    for (const t of targets) link(sourceFqn, t);
  }

  const origin = pickGatewayOriginClass(classes);
  if (origin) {
    for (const e of edges) {
      if (e.type !== 'gateway-route') continue;
      const targets = controllersByService.get(e.to) ?? [];
      for (const t of targets) link(origin.fqn, t);
    }
  }

  return adj;
}

export function expand(
  seedFqns: Iterable<string>,
  classes: ClassRecord[],
  edges: Edge[],
  depth = 1,
): ExpandResult {
  const eligible = new Set(classes.filter(isEligible).map((c) => c.fqn));
  const seed = new Set<string>();
  for (const s of seedFqns) {
    if (eligible.has(s)) seed.add(s);
  }
  const adj = buildAdjacency(classes, edges);

  const visited = new Set<string>(seed);
  const expanded = new Set<string>();
  let frontier = new Set<string>(seed);
  for (let i = 0; i < depth; i++) {
    const next = new Set<string>();
    for (const fqn of frontier) {
      const ns = adj.get(fqn);
      if (!ns) continue;
      for (const n of ns) {
        if (visited.has(n)) continue;
        next.add(n);
        visited.add(n);
        expanded.add(n);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  const byFqn = new Map(classes.map((c) => [c.fqn, c]));
  const byService = new Map<string, string[]>();
  for (const fqn of visited) {
    const c = byFqn.get(fqn);
    const svc = c?.microservice ?? '(unknown)';
    if (!byService.has(svc)) byService.set(svc, []);
    byService.get(svc)!.push(fqn);
  }
  for (const list of byService.values()) list.sort();

  return { seed, expanded, byService };
}
