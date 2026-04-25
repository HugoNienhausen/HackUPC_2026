import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ClassRecord, Edge } from './types.js';
import { stripComments } from './parseClass.js';

const SERVICE_URL_RE = /\b(?:http|lb):\/\/([a-z][a-z0-9-]+)/g;
const DISCOVERY_RE =
  /\bdiscoveryClient\s*\.\s*getInstances\s*\(\s*"([^"]+)"\s*\)/g;

function depthArray(stripped: string): Int32Array {
  const depths = new Int32Array(stripped.length);
  let depth = 0;
  for (let i = 0; i < stripped.length; i++) {
    depths[i] = depth;
    const c = stripped[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return depths;
}

function lineOf(src: string, offset: number): number {
  let n = 1;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') n++;
  }
  return n;
}

export function extractHttpEdgesFromFile(
  rawContent: string,
  callerService: string | null,
  relativePath: string,
): Edge[] {
  const stripped = stripComments(rawContent);
  const depths = depthArray(stripped);
  const edges: Edge[] = [];

  SERVICE_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SERVICE_URL_RE.exec(stripped))) {
    const target = m[1]!;
    const offset = m.index;
    if ((depths[offset] ?? 0) < 2) continue;
    if (callerService && target === callerService) continue;
    edges.push({
      from: callerService ?? 'unknown',
      to: target,
      type: 'http',
      via: relativePath,
      sourceFile: relativePath,
      sourceLine: lineOf(stripped, offset),
    });
  }
  return edges;
}

export function extractDiscoveryEdgesFromFile(
  rawContent: string,
  callerService: string | null,
  relativePath: string,
): Edge[] {
  const stripped = stripComments(rawContent);
  const edges: Edge[] = [];

  DISCOVERY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DISCOVERY_RE.exec(stripped))) {
    const target = m[1]!;
    if (callerService && target === callerService) continue;
    edges.push({
      from: callerService ?? 'unknown',
      to: target,
      type: 'discovery',
      via: relativePath,
      sourceFile: relativePath,
      sourceLine: lineOf(stripped, m.index),
    });
  }
  return edges;
}

interface GatewayRoute {
  id?: string;
  uri?: string;
  predicates?: string[];
}

export function extractGatewayRoutesFromYaml(
  yamlText: string,
): { id: string; target: string; predicates: string[] }[] {
  const out: { id: string; target: string; predicates: string[] }[] = [];
  const docs = YAML.parseAllDocuments(yamlText);
  for (const doc of docs) {
    const obj = doc.toJS();
    const routes: GatewayRoute[] | undefined =
      obj?.spring?.cloud?.gateway?.server?.webflux?.routes ??
      obj?.spring?.cloud?.gateway?.routes;
    if (!Array.isArray(routes)) continue;
    for (const r of routes) {
      const uri = typeof r?.uri === 'string' ? r.uri : '';
      const m = uri.match(/^lb:\/\/([a-z][a-z0-9-]+)/);
      if (!m) continue;
      const preds: string[] = Array.isArray(r.predicates)
        ? r.predicates.map((p) => (typeof p === 'string' ? p : ''))
        : [];
      out.push({
        id: r.id ?? m[1]!,
        target: m[1]!,
        predicates: preds.filter(Boolean),
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((r) => {
    const k = `${r.id}|${r.target}|${r.predicates.join(',')}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function extractGatewayRouteEdges(
  repoRoot: string,
): Promise<Edge[]> {
  const candidate = path.join(
    repoRoot,
    'spring-petclinic-api-gateway',
    'src',
    'main',
    'resources',
    'application.yml',
  );
  let yamlText: string;
  try {
    yamlText = await fs.readFile(candidate, 'utf8');
  } catch {
    return [];
  }
  const routes = extractGatewayRoutesFromYaml(yamlText);
  return routes.map((r) => ({
    from: 'api-gateway',
    to: r.target,
    type: 'gateway-route',
    via: r.predicates.join(',') || `lb://${r.target}`,
    sourceFile: path.relative(repoRoot, candidate),
  }));
}

export function extractImportEdges(classes: ClassRecord[]): Edge[] {
  const fqnToService = new Map<string, string>();
  for (const c of classes) {
    if (c.microservice) fqnToService.set(c.fqn, c.microservice);
  }
  const out: Edge[] = [];
  const seen = new Set<string>();
  for (const c of classes) {
    if (!c.microservice) continue;
    for (const imp of c.imports) {
      const targetService = fqnToService.get(imp);
      if (!targetService) continue;
      const k = `${c.fqn}->${imp}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        from: c.microservice,
        to: targetService,
        type: 'import',
        via: `${c.fqn} -> ${imp}`,
      });
    }
  }
  return out;
}
