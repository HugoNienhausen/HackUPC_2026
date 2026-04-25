import { readFileSync } from 'node:fs';
import type { ClassRecord } from '../index/types.js';
import type { Component, Endpoint } from '@devmap/schema';
import { stripComments } from '../index/parseClass.js';

export interface GatewayRouteSpec {
  target: string;
  predicates: string[];
}

export interface BuildEndpointsInput {
  components: Component[];
  classes: ClassRecord[];
  gatewayRoutes: GatewayRouteSpec[];
}

const CLASS_REQUEST_MAPPING_RE =
  /@RequestMapping\s*\(\s*(?:value\s*=\s*)?"([^"]*)"\s*\)/;

function ensureLeadingSlash(p: string): string {
  if (!p) return '';
  return p.startsWith('/') ? p : `/${p}`;
}

function joinPath(base: string, path: string): string {
  const b = ensureLeadingSlash(base.replace(/\/$/, ''));
  const p = ensureLeadingSlash(path);
  if (!b) return p;
  if (!p || p === '/') return b;
  return b + p;
}

export function extractClassBasePath(source: string): string {
  const stripped = stripComments(source);
  const classDeclIdx = stripped.search(/\b(class|interface|record|enum)\s+[A-Z]/);
  const head = classDeclIdx > 0 ? stripped.slice(0, classDeclIdx) : stripped;
  const m = head.match(CLASS_REQUEST_MAPPING_RE);
  return m ? m[1]! : '';
}

export function gatewayPrefix(predicates: string[]): string {
  for (const p of predicates) {
    const m = p.match(/^Path=(.+)$/);
    if (!m) continue;
    return m[1]!.replace(/\/\*\*?$/, '').replace(/\/$/, '');
  }
  return '';
}

export function resolveGatewayPath(
  microservice: string,
  localPath: string,
  routes: GatewayRouteSpec[],
): string | null {
  if (microservice === 'api-gateway') return null;
  const route = routes.find((r) => r.target === microservice);
  if (!route) return null;
  const prefix = gatewayPrefix(route.predicates);
  if (!prefix) return null;
  return joinPath(prefix, localPath);
}

export function buildEndpoints({
  components,
  classes,
  gatewayRoutes,
}: BuildEndpointsInput): Endpoint[] {
  const classByFqn = new Map(classes.map((c) => [c.fqn, c]));
  const out: Endpoint[] = [];

  for (const comp of components) {
    if (comp.kind !== 'controller') continue;
    const cls = classByFqn.get(comp.fqn);
    if (!cls) continue;
    let basePath = '';
    try {
      const src = readFileSync(cls.sourceFile, 'utf8');
      basePath = extractClassBasePath(src);
    } catch {
      basePath = '';
    }
    for (const m of cls.methods) {
      if (!m.httpMethod) continue;
      const methodPath = m.httpPath ?? '';
      const localPath = joinPath(basePath, methodPath);
      const gatewayPath = resolveGatewayPath(comp.microservice, localPath, gatewayRoutes);
      out.push({
        method: m.httpMethod,
        path: localPath,
        gatewayPath,
        componentId: comp.id,
        handlerMethod: m.name,
        microservice: comp.microservice,
      });
    }
  }
  return out;
}
