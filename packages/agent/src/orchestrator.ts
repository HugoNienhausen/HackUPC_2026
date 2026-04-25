import path from 'node:path';
import { promises as fs } from 'node:fs';
import YAML from 'yaml';
import { FeatureSchema, type Feature } from '@devmap/schema';
import { runIndex } from './index/runIndex.js';
import { lexicalMatch } from './feature/lexicalMatch.js';
import { expand } from './feature/expand.js';
import { buildComponents } from './views/components.js';
import { buildDependencies } from './views/dependencies.js';
import { buildEndpoints, type GatewayRouteSpec } from './views/endpoints.js';
import { buildPersistence } from './views/persistence.js';
import { buildFlow } from './views/flow.js';
import { buildEvents } from './views/events.js';
import { extractGatewayRoutesFromYaml } from './index/edges.js';

export interface OrchestrateOptions {
  feature: string;
  repo: string;
  depth?: number;
  llm?: boolean;
  serve?: boolean;
  displayName?: string;
}

async function loadGatewayRoutes(repoRoot: string): Promise<GatewayRouteSpec[]> {
  const ymlPath = path.join(
    repoRoot,
    'spring-petclinic-api-gateway',
    'src',
    'main',
    'resources',
    'application.yml',
  );
  try {
    const text = await fs.readFile(ymlPath, 'utf8');
    return extractGatewayRoutesFromYaml(text).map((r) => ({
      target: r.target,
      predicates: r.predicates,
    }));
  } catch {
    return [];
  }
}

const KNOWN_PORTS: Record<string, number> = {
  'config-server': 8888,
  'discovery-server': 8761,
  'admin-server': 9090,
  'api-gateway': 8080,
  'customers-service': 8081,
  'visits-service': 8082,
  'vets-service': 8083,
  'genai-service': 8084,
};

function repoBlock(repoRoot: string, services: string[]): Feature['repository'] {
  return {
    name: path.basename(repoRoot),
    rootPath: repoRoot,
    language: 'java',
    framework: 'spring-boot',
    microservices: services.map((s) => ({
      name: s,
      module: `spring-petclinic-${s}`,
      port: KNOWN_PORTS[s] ?? null,
    })),
  };
}

export async function orchestrate(opts: OrchestrateOptions): Promise<Feature> {
  const repo = path.resolve(opts.repo);
  const idx = await runIndex(repo);

  const matches = lexicalMatch(idx.classes, opts.feature);
  const seedFqns = new Set(matches.map((m) => m.fqn));
  const expandResult = expand(seedFqns, idx.classes, idx.edges, opts.depth);

  const components = buildComponents({
    classes: idx.classes,
    seedFqns,
    expandedFqns: expandResult.expanded,
  });

  const dependencies = buildDependencies({
    components,
    classes: idx.classes,
    edges: idx.edges,
  });

  const gatewayRoutes = await loadGatewayRoutes(repo);
  const endpoints = buildEndpoints({
    components,
    classes: idx.classes,
    gatewayRoutes,
  });

  const persistence = buildPersistence({
    components,
    classes: idx.classes,
  });

  const flow = buildFlow({
    components,
    edges: dependencies.edges,
  });

  const events = buildEvents();

  const featureName = opts.feature;
  const displayName =
    opts.displayName ??
    featureName.charAt(0).toUpperCase() + featureName.slice(1);

  const artifact: Feature = {
    devmapVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    feature: {
      name: featureName,
      displayName,
      summary: `[summary pending — phase 3.5] Auto-generated structural artifact for the "${featureName}" feature.`,
    },
    repository: repoBlock(repo, idx.microservices),
    components,
    flow,
    dependencies,
    persistence,
    endpoints,
    events,
    ownership: { codeowners: [], recentContributors: [] },
  };

  return FeatureSchema.parse(artifact);
}
