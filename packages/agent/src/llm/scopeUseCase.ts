import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClassRecord, Edge as IndexEdge } from '../index/types.js';
import type { LlmClient } from './client.js';
import { cacheLocation, readCache, writeCache } from './cache.js';
import type { UseCase } from './discoverUseCases.js';
import type { EndpointLike } from './discoverUseCases.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(HERE, '../../prompts/scope-use-case.md');

let cachedTemplate: string | null = null;
async function loadTemplate(): Promise<string> {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = await fs.readFile(PROMPT_PATH, 'utf8');
  return cachedTemplate;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    vars[k] !== undefined ? vars[k] : `{{${k}}}`,
  );
}

export interface ScopeResult {
  /** Every class FQN in the use-case's request flow. */
  components: string[];
  /** The spine subset of components. */
  core: string[];
  /** JPA entities the flow reads or writes. */
  entities: string[];
  /** Endpoints in scope (usually 1; aggregations may include downstream). */
  endpoints: { method: string; path: string }[];
  /** LLM's explanation of the path traced. */
  rationale: string;
}

export interface ScopeInput {
  useCase: UseCase;
  classes: ClassRecord[];
  endpoints: EndpointLike[];
  edges: IndexEdge[];
  client: LlmClient;
  repoSummary?: string;
  warn?: (msg: string) => void;
}

const DEFAULT_REPO_SUMMARY =
  'Spring Cloud microservices clone of PetClinic. Multiple services, synchronous HTTP via api-gateway with Eureka discovery and a circuit breaker. Polyglot persistence with JPA + H2 per service.';

function shrinkClass(c: ClassRecord) {
  return {
    fqn: c.fqn,
    simpleName: c.simpleName,
    microservice: c.microservice,
    kind: c.kind,
    annotations: c.annotations,
    methods: c.methods.map((m) => ({
      name: m.name,
      annotations: m.annotations,
      signature: m.signature,
    })),
    imports: c.imports,
  };
}

function shrinkEdge(e: IndexEdge) {
  return { from: e.from, to: e.to, type: e.type };
}

function isCrossService(e: IndexEdge): boolean {
  return e.from !== e.to && (e.type === 'http' || e.type === 'discovery' || e.type === 'gateway-route');
}

export async function scopeUseCase(input: ScopeInput): Promise<ScopeResult | null> {
  const warn = input.warn ?? ((m) => process.stderr.write(m + '\n'));
  if (!input.client.isLive()) return null;

  // Same pre-filter as discover: drop bootstrap + crossCutting before sending.
  const visibleClasses = input.classes
    .filter((c) => !c.flags.bootstrap && !c.flags.crossCutting)
    .map(shrinkClass);
  const crossEdges = input.edges.filter(isCrossService).map(shrinkEdge);

  const template = await loadTemplate();
  const prompt = fillTemplate(template, {
    repo_summary: input.repoSummary ?? DEFAULT_REPO_SUMMARY,
    use_case: JSON.stringify(input.useCase, null, 2),
    classes_index: JSON.stringify(visibleClasses, null, 2),
    endpoints: JSON.stringify(input.endpoints, null, 2),
    cross_service_edges: JSON.stringify(crossEdges, null, 2),
  });

  type RawScope = {
    components?: unknown[];
    core?: unknown[];
    entities?: unknown[];
    endpoints?: unknown[];
    rationale?: string;
  };
  let raw: RawScope | null;
  try {
    raw = await input.client.completeJson<RawScope>({
      model: 'judgment',
      user: prompt,
      maxTokens: 2500,
      temperature: 0.1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[devmap] scopeUseCase failed: ${msg}`);
    return null;
  }
  if (!raw) return null;

  const components = (Array.isArray(raw.components) ? raw.components : []).filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  const core = (Array.isArray(raw.core) ? raw.core : []).filter(
    (x): x is string => typeof x === 'string' && components.includes(x),
  );
  const entities = (Array.isArray(raw.entities) ? raw.entities : []).filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  const endpoints = (Array.isArray(raw.endpoints) ? raw.endpoints : [])
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const r = e as Record<string, unknown>;
      const method = typeof r.method === 'string' ? r.method.trim() : '';
      const p = typeof r.path === 'string' ? r.path.trim() : '';
      if (!method || !p) return null;
      return { method, path: p };
    })
    .filter((x): x is { method: string; path: string } => x !== null);

  return {
    components,
    core,
    entities,
    endpoints,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
  };
}

/**
 * Cache wrapper. Stores per-use-case scope at
 *   <ws>/.devmap/cache/<repo-hash>/<useCaseId>.scope.json
 * `--refresh` forces re-call.
 */
export interface ScopeUseCaseCachedInput extends ScopeInput {
  workspaceRoot: string;
  repoPath: string;
  refresh?: boolean;
}

export async function scopeUseCaseCached(
  input: ScopeUseCaseCachedInput,
): Promise<ScopeResult | null> {
  const loc = cacheLocation(input.workspaceRoot, input.repoPath, `${input.useCase.id}.scope`);
  if (!input.refresh) {
    const hit = await readCache<ScopeResult>(loc);
    if (hit && Array.isArray(hit.components)) return hit;
  }
  const fresh = await scopeUseCase(input);
  if (fresh) {
    try {
      await writeCache(loc, fresh);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[devmap] scope cache write failed: ${msg}\n`);
    }
  }
  return fresh;
}
