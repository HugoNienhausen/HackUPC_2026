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
import { NOOP_PROGRESS, type Progress } from './progress.js';
import {
  discoverUseCasesCached,
  type UseCase,
  type EndpointLike,
} from './llm/discoverUseCases.js';
import { scopeUseCaseCached } from './llm/scopeUseCase.js';

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
  /** Phase progress reporter (TTY spinner / silent). Defaults to no-op. */
  progress?: Progress;
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
  const progress = opts.progress ?? NOOP_PROGRESS;

  if (!opts.refresh) {
    const hit = await readCache<Feature>(cacheLoc);
    if (hit) {
      const parsed = FeatureSchema.safeParse(hit);
      if (parsed.success) {
        progress.info(`✓ Cache hit: ${cacheLoc.file}`);
        return parsed.data;
      }
      process.stderr.write(
        `[devmap] cache file at ${cacheLoc.file} failed schema validation — rebuilding\n`,
      );
    }
  }

  progress.start('Scanning Java sources…');
  const idx = await runIndex(repo);
  progress.succeed(
    `Indexed ${idx.classes.length} classes across ${idx.microservices.length} services ({t})`,
  );

  progress.start(`Identifying components for "${opts.feature}"…`);
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
  const coreCount = components0.filter((c) => c.core).length;
  const peripheryCount = components0.length - coreCount;
  progress.succeed(
    `Located ${coreCount} core + ${peripheryCount} periphery candidates ({t})`,
  );

  progress.start('Building dependency graph…');
  const dependencies = buildDependencies({
    components: components0,
    classes: idx.classes,
    edges: idx.edges,
  });
  const crossServiceEdges = dependencies.edges.filter((e: { from: string; to: string }) => {
    const from = components0.find((c) => c.id === e.from)?.microservice;
    const to = components0.find((c) => c.id === e.to)?.microservice;
    return Boolean(from && to && from !== to);
  }).length;
  progress.succeed(
    `Mapped ${dependencies.edges.length} edges (${crossServiceEdges} cross-service) ({t})`,
  );

  const gatewayRoutes = await loadGatewayRoutes(repo);
  const endpoints = buildEndpoints({
    components: components0,
    classes: idx.classes,
    gatewayRoutes,
  });

  progress.start('Detecting persistence model…');
  const persistence = buildPersistence({
    components: components0,
    classes: idx.classes,
  });
  type EntityField = { relation?: { kind: string } | null };
  type EntityRow = { fields: EntityField[] };
  const fkByValueCount = (persistence.entities as EntityRow[]).reduce(
    (acc: number, e: EntityRow) =>
      acc + e.fields.filter((f) => f.relation?.kind === 'ForeignKeyByValue').length,
    0,
  );
  progress.succeed(
    `Found ${persistence.entities.length} entities, ${fkByValueCount} cross-service FKs ({t})`,
  );

  const featureName = opts.feature;
  const displayName =
    opts.displayName ??
    featureName.charAt(0).toUpperCase() + featureName.slice(1);
  let featureMeta = {
    name: featureName,
    displayName,
    summary: `Auto-generated structural artifact for the "${featureName}" feature.`,
  };

  progress.start('Generating component summaries (Claude Haiku, parallel)…');
  const summaries = await summarizeComponents({
    components: components0,
    classes: idx.classes,
    edges: dependencies.edges,
    feature: { name: featureMeta.name, summary: featureMeta.summary },
    client: llm,
  });
  let components = applySummaries(components0, summaries);
  progress.succeed(`Wrote ${summaries.size} summaries ({t})`);

  // Structural flow first — used as the fallback for reconstructFlow.
  const structuralFlow = buildFlow({
    components,
    edges: dependencies.edges,
  });

  progress.start('Reconstructing request flow (Claude Sonnet)…');
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

  if (reconstructed) {
    progress.succeed(`Generated narrative + sequence ({t})`);
  } else {
    progress.succeed(`Used structural fallback ({t})`);
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

/**
 * Use-case mode (the v2 pipeline). Resolves a use-case id from the discover
 * output, asks Sonnet to scope the request flow exactly, and builds a
 * feature.json scoped to ONLY the classes/edges/entities/endpoints that
 * participate in that flow. No lexical match. No 1-hop expansion.
 */
export interface OrchestrateUseCaseOptions {
  useCaseId: string;
  repo: string;
  llm?: boolean;
  refresh?: boolean;
  workspaceRoot?: string;
  progress?: Progress;
}

export class UseCaseNotFoundError extends Error {
  constructor(public readonly useCaseId: string, public readonly available: string[]) {
    super(`Use-case "${useCaseId}" not found in discover output.`);
    this.name = 'UseCaseNotFoundError';
  }
}

function endpointToLike(e: ReturnType<typeof buildEndpoints>[number], controllerName: string): EndpointLike {
  return {
    method: e.method,
    path: e.path,
    handler: `${controllerName}.${e.handlerMethod}`,
    microservice: e.microservice,
    gatewayPath: e.gatewayPath ?? null,
  };
}

export async function orchestrateUseCase(
  opts: OrchestrateUseCaseOptions,
): Promise<Feature> {
  const repo = path.resolve(opts.repo);
  const workspaceRoot = opts.workspaceRoot ?? process.env.INIT_CWD ?? process.cwd();
  const cacheLoc = cacheLocation(workspaceRoot, repo, opts.useCaseId);
  const progress = opts.progress ?? NOOP_PROGRESS;

  if (!opts.refresh) {
    const hit = await readCache<Feature>(cacheLoc);
    if (hit) {
      const parsed = FeatureSchema.safeParse(hit);
      if (parsed.success) {
        progress.info(`✓ Cache hit: ${cacheLoc.file}`);
        return parsed.data;
      }
    }
  }

  progress.start('Scanning Java sources…');
  const idx = await runIndex(repo);
  progress.succeed(
    `Indexed ${idx.classes.length} classes across ${idx.microservices.length} services ({t})`,
  );

  // Build the FULL endpoint list once; both discover and scope reference it.
  const allFqns = new Set(idx.classes.map((c) => c.fqn));
  const allComponents = buildComponents({
    classes: idx.classes,
    seedFqns: allFqns,
    expandedFqns: new Set(),
  });
  const compById = new Map(allComponents.map((c) => [c.id, c]));
  const gatewayRoutes = await loadGatewayRoutes(repo);
  const allEndpoints = buildEndpoints({
    components: allComponents,
    classes: idx.classes,
    gatewayRoutes,
  });
  const endpointLikes: EndpointLike[] = allEndpoints.map((e) => {
    const ctrl = compById.get(e.componentId)?.simpleName ?? e.componentId;
    return endpointToLike(e, ctrl);
  });

  const llm = new LlmClient({ noLlm: opts.llm === false });

  progress.start('Discovering use-cases (Claude Sonnet)…');
  const discover = await discoverUseCasesCached({
    classes: idx.classes,
    microservices: idx.microservices.map((m) => ({ name: m })),
    endpoints: endpointLikes,
    edges: idx.edges,
    client: llm,
    workspaceRoot,
    repoPath: repo,
    refresh: opts.refresh ?? false,
  });

  if (!discover) {
    throw new Error(
      'discover failed — live LLM is required for use-case mode. Set ANTHROPIC_API_KEY and rerun.',
    );
  }
  progress.succeed(`Found ${discover.useCases.length} use-cases ({t})`);

  const useCase: UseCase | undefined = discover.useCases.find((u) => u.id === opts.useCaseId);
  if (!useCase) {
    throw new UseCaseNotFoundError(
      opts.useCaseId,
      discover.useCases.map((u) => u.id),
    );
  }

  progress.start(`Scoping "${useCase.id}" (Claude Sonnet)…`);
  const scope = await scopeUseCaseCached({
    useCase,
    classes: idx.classes,
    endpoints: endpointLikes,
    edges: idx.edges,
    client: llm,
    workspaceRoot,
    repoPath: repo,
    refresh: opts.refresh ?? false,
  });

  if (!scope) {
    throw new Error(`scopeUseCase returned null for ${useCase.id} — check live LLM connectivity.`);
  }
  progress.succeed(
    `Scoped to ${scope.components.length} components (${scope.core.length} core) ({t})`,
  );

  // Filter the in-scope FQNs against the actual index. The LLM occasionally
  // hallucinates FQNs; only keep those that actually exist.
  const indexedFqns = allFqns;
  const inScopeFqns = new Set(scope.components.filter((f) => indexedFqns.has(f)));
  const coreFqns = new Set(scope.core.filter((f) => inScopeFqns.has(f)));
  const peripheryFqns = new Set([...inScopeFqns].filter((f) => !coreFqns.has(f)));

  progress.start('Building dependency graph…');
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
  const crossServiceEdges = dependencies.edges.filter(
    (e: { from: string; to: string }) => {
      const from = components0.find((c) => c.id === e.from)?.microservice;
      const to = components0.find((c) => c.id === e.to)?.microservice;
      return Boolean(from && to && from !== to);
    },
  ).length;
  progress.succeed(
    `Mapped ${dependencies.edges.length} edges (${crossServiceEdges} cross-service) ({t})`,
  );

  // Endpoints in scope: prefer the LLM's explicit list, fall back to filtering
  // by component id when the LLM didn't list any.
  const inScopeComponentIds = new Set(components0.map((c) => c.id));
  let endpoints = allEndpoints.filter((e) => inScopeComponentIds.has(e.componentId));
  if (scope.endpoints.length > 0) {
    const wantedKey = (m: string, p: string) => `${m.toUpperCase()} ${p}`;
    const wanted = new Set(scope.endpoints.map((e) => wantedKey(e.method, e.path)));
    const llmFiltered = endpoints.filter((e) => wanted.has(wantedKey(e.method, e.path)));
    if (llmFiltered.length > 0) endpoints = llmFiltered;
  }

  progress.start('Detecting persistence model…');
  // For persistence, restrict to the LLM's `entities` list when provided.
  const entityFqnSet = scope.entities.length > 0 ? new Set(scope.entities) : null;
  const personaComponents = entityFqnSet
    ? components0.filter((c) => c.kind !== 'entity' || entityFqnSet.has(c.fqn))
    : components0;
  const persistence = buildPersistence({
    components: personaComponents,
    classes: idx.classes,
  });
  type EntityField = { relation?: { kind: string } | null };
  type EntityRow = { fields: EntityField[] };
  const fkByValueCount = (persistence.entities as EntityRow[]).reduce(
    (acc: number, e: EntityRow) =>
      acc + e.fields.filter((f) => f.relation?.kind === 'ForeignKeyByValue').length,
    0,
  );
  progress.succeed(
    `Found ${persistence.entities.length} entities, ${fkByValueCount} cross-service FKs ({t})`,
  );

  let featureMeta = {
    name: useCase.id,
    displayName: useCase.name,
    summary: useCase.summary,
  };

  progress.start('Generating component summaries (Claude Haiku, parallel)…');
  const summaries = await summarizeComponents({
    components: components0,
    classes: idx.classes,
    edges: dependencies.edges,
    feature: { name: featureMeta.name, summary: featureMeta.summary },
    client: llm,
  });
  const components = applySummaries(components0, summaries);
  progress.succeed(`Wrote ${summaries.size} summaries ({t})`);

  const structuralFlow = buildFlow({
    components,
    edges: dependencies.edges,
  });

  progress.start('Reconstructing request flow (Claude Sonnet)…');
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
  progress.succeed(
    reconstructed ? `Generated narrative + sequence ({t})` : `Used structural fallback ({t})`,
  );

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
  try {
    await writeCache(cacheLoc, validated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[devmap] cache write failed: ${msg}\n`);
  }
  return validated;
}
