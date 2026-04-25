import path from 'node:path';
import { promises as fs } from 'node:fs';
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
import { LlmClient } from './llm/client.js';
import { summarizeComponents, applySummaries } from './llm/summarizeComponents.js';
import { applyIdentify, identifyFeature } from './llm/identifyFeature.js';
import { reconstructFlow } from './llm/reconstructFlow.js';
import { cacheLocation, readCache, writeCache } from './llm/cache.js';

export interface OrchestrateOptions {
  feature: string;
  repo: string;
  depth?: number;
  llm?: boolean;
  serve?: boolean;
  displayName?: string;
  /** Force re-call of all LLM steps even if a cache hit exists. */
  refresh?: boolean;
  /** Workspace root for cache writes — defaults to INIT_CWD or process.cwd(). */
  workspaceRoot?: string;
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
  const workspaceRoot = opts.workspaceRoot ?? process.env.INIT_CWD ?? process.cwd();
  const cacheLoc = cacheLocation(workspaceRoot, repo, opts.feature);

  if (!opts.refresh) {
    const hit = await readCache<Feature>(cacheLoc);
    if (hit) {
      const parsed = FeatureSchema.safeParse(hit);
      if (parsed.success) {
        process.stderr.write(`[devmap] cache hit: ${cacheLoc.file}\n`);
        return parsed.data;
      }
      process.stderr.write(
        `[devmap] cache file at ${cacheLoc.file} failed schema validation — rebuilding\n`,
      );
    }
  }

  const idx = await runIndex(repo);

  const matches = lexicalMatch(idx.classes, opts.feature);
  const seedFqns = new Set(matches.map((m) => m.fqn));
  const expandResult = expand(seedFqns, idx.classes, idx.edges, opts.depth);

  // Collect candidate ClassRecords (seed ∪ expanded) for the identifier.
  const candidateFqns = new Set<string>([...seedFqns, ...expandResult.expanded]);
  const candidates = idx.classes.filter((c) => candidateFqns.has(c.fqn));

  const llm = new LlmClient({ noLlm: opts.llm === false });

  // identifyFeature runs against the LEXICAL+EXPAND candidate set BEFORE the
  // view builders. If LLM is live and the call succeeds, we honor the
  // classification: rejected classes are removed from `candidates`, core/periphery
  // sets steer the components view's `core` flag.
  const identifyResult = await identifyFeature({
    featureName: opts.feature,
    candidates,
    microservices: idx.microservices,
    client: llm,
  });

  let coreFqns = seedFqns;
  let peripheryFqns = expandResult.expanded;
  if (identifyResult) {
    const applied = applyIdentify(candidates, identifyResult);
    // Translate the LLM's id-keyed sets back into FQN-keyed sets so the
    // existing buildComponents API doesn't change.
    const idToFqn = new Map(applied.classes.map((c) => [
      c.fqn.replace(/^org\.springframework\.samples\.petclinic\./, ''),
      c.fqn,
    ]));
    coreFqns = new Set(
      [...applied.coreSet]
        .map((id) => idToFqn.get(id))
        .filter((f): f is string => Boolean(f)),
    );
    peripheryFqns = new Set(
      [...applied.peripherySet]
        .map((id) => idToFqn.get(id))
        .filter((f): f is string => Boolean(f)),
    );
  }

  const components0 = buildComponents({
    classes: idx.classes,
    seedFqns: coreFqns,
    expandedFqns: peripheryFqns,
  });

  const dependencies = buildDependencies({
    components: components0,
    classes: idx.classes,
    edges: idx.edges,
  });

  const gatewayRoutes = await loadGatewayRoutes(repo);
  const endpoints = buildEndpoints({
    components: components0,
    classes: idx.classes,
    gatewayRoutes,
  });

  const persistence = buildPersistence({
    components: components0,
    classes: idx.classes,
  });

  const featureName = opts.feature;
  const displayName =
    opts.displayName ??
    featureName.charAt(0).toUpperCase() + featureName.slice(1);
  let featureMeta = {
    name: featureName,
    displayName,
    summary: `Auto-generated structural artifact for the "${featureName}" feature.`,
  };

  const summaries = await summarizeComponents({
    components: components0,
    classes: idx.classes,
    edges: dependencies.edges,
    feature: { name: featureMeta.name, summary: featureMeta.summary },
    client: llm,
  });
  let components = applySummaries(components0, summaries);

  // Structural flow first — used as the fallback for reconstructFlow.
  const structuralFlow = buildFlow({
    components,
    edges: dependencies.edges,
  });

  // Send ALL in-scope components (core + periphery) to reconstructFlow.
  // Periphery classes can still be on the request path — e.g. ApiGatewayController
  // orchestrates the visits aggregation despite being classified periphery for
  // the visits feature. The Component.core flag lets Sonnet prioritize.
  const reconstructed = await reconstructFlow({
    featureName: featureMeta.name,
    featureSummary: featureMeta.summary,
    coreComponents: components,
    crossServiceCalls: idx.edges,
    gatewayRoutes: gatewayRoutes.map((r) => ({ target: r.target, predicates: r.predicates })),
    entryEndpoints: endpoints,
    fallbackMermaid: structuralFlow.mermaid,
    fallbackNarrative: structuralFlow.narrative,
    client: llm,
  });

  const flow = reconstructed
    ? {
        mermaid: reconstructed.mermaid,
        narrative: reconstructed.narrative,
        steps: reconstructed.steps.length > 0 ? reconstructed.steps : structuralFlow.steps,
      }
    : structuralFlow;

  if (reconstructed?.featureSummary) {
    featureMeta = { ...featureMeta, summary: reconstructed.featureSummary };
  }

  const events = buildEvents();

  const artifact: Feature = {
    devmapVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    feature: featureMeta,
    repository: repoBlock(repo, idx.microservices),
    components,
    flow,
    dependencies,
    persistence,
    endpoints,
    events,
    ownership: { codeowners: [], recentContributors: [] },
  };

  const validated = FeatureSchema.parse(artifact);
  // Best-effort cache write — failures are non-fatal (e.g. read-only fs).
  try {
    await writeCache(cacheLoc, validated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[devmap] cache write failed: ${msg}\n`);
  }
  return validated;
}
