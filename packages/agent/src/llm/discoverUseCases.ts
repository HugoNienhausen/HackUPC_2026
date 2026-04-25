import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClassRecord, Edge as IndexEdge } from '../index/types.js';
import type { LlmClient } from './client.js';
import { cacheLocation, readCache, writeCache } from './cache.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(HERE, '../../prompts/discover-use-cases.md');

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

export type UseCaseComplexity = 'single-service' | 'cross-service';

export interface UseCase {
  id: string;
  name: string;
  entryEndpoint: string;
  entryController: string;
  entryMicroservice: string;
  summary: string;
  complexity: UseCaseComplexity;
}

export interface DiscoverResult {
  useCases: UseCase[];
}

export interface EndpointLike {
  method: string;
  path: string;
  handler: string;
  microservice: string;
  gatewayPath: string | null;
}

export interface DiscoverInput {
  classes: ClassRecord[];
  microservices: { name: string; module?: string; port?: number | null }[];
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
  };
}

function isCrossService(e: IndexEdge): boolean {
  return e.from !== e.to && (e.type === 'http' || e.type === 'discovery' || e.type === 'gateway-route');
}

function shrinkEdge(e: IndexEdge) {
  return { from: e.from, to: e.to, type: e.type };
}

function sanitizeUseCase(raw: unknown): UseCase | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const entryEndpoint = typeof r.entryEndpoint === 'string' ? r.entryEndpoint.trim() : '';
  const entryController = typeof r.entryController === 'string' ? r.entryController.trim() : '';
  const entryMicroservice = typeof r.entryMicroservice === 'string' ? r.entryMicroservice.trim() : '';
  const summary = typeof r.summary === 'string' ? r.summary.trim() : '';
  const complexity =
    r.complexity === 'cross-service' || r.complexity === 'single-service'
      ? r.complexity
      : 'single-service';
  if (!id || !name || !entryEndpoint || !entryController) return null;
  return { id, name, entryEndpoint, entryController, entryMicroservice, summary, complexity };
}

export async function discoverUseCases(
  input: DiscoverInput,
): Promise<DiscoverResult | null> {
  const warn = input.warn ?? ((m) => process.stderr.write(m + '\n'));
  if (!input.client.isLive()) return null;

  // Pre-filter the classes index: drop bootstrap + crossCutting (the locked
  // decisions never apply to the LLM's view) so the prompt isn't padded.
  const visibleClasses = input.classes
    .filter((c) => !c.flags.bootstrap && !c.flags.crossCutting)
    .map(shrinkClass);

  const crossEdges = input.edges.filter(isCrossService).map(shrinkEdge);

  const template = await loadTemplate();
  const prompt = fillTemplate(template, {
    repo_summary: input.repoSummary ?? DEFAULT_REPO_SUMMARY,
    microservices: JSON.stringify(input.microservices, null, 2),
    classes_index: JSON.stringify(visibleClasses, null, 2),
    endpoints: JSON.stringify(input.endpoints, null, 2),
    cross_service_edges: JSON.stringify(crossEdges, null, 2),
  });

  type RawDiscover = { useCases?: unknown[] };
  let raw: RawDiscover | null;
  try {
    raw = await input.client.completeJson<RawDiscover>({
      model: 'judgment',
      user: prompt,
      maxTokens: 4000,
      temperature: 0.1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[devmap] discoverUseCases failed: ${msg}`);
    return null;
  }
  if (!raw) return null;

  const useCases = Array.isArray(raw.useCases)
    ? raw.useCases.map(sanitizeUseCase).filter((u): u is UseCase => u !== null)
    : [];

  // Stable de-dup by id, in case the LLM repeats one.
  const seen = new Set<string>();
  const dedup = useCases.filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));
  return { useCases: dedup.slice(0, 20) };
}

/**
 * Cache wrapper. Stores discover output at <ws>/.devmap/cache/<repo-hash>/discover.json.
 * `--refresh` forces re-call.
 */
export interface DiscoverCachedInput extends DiscoverInput {
  workspaceRoot: string;
  repoPath: string;
  refresh?: boolean;
}

export async function discoverUseCasesCached(
  input: DiscoverCachedInput,
): Promise<DiscoverResult | null> {
  const loc = cacheLocation(input.workspaceRoot, input.repoPath, 'discover');
  if (!input.refresh) {
    const hit = await readCache<DiscoverResult>(loc);
    if (hit && Array.isArray(hit.useCases)) return hit;
  }
  const fresh = await discoverUseCases(input);
  if (fresh) {
    try {
      await writeCache(loc, fresh);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[devmap] discover cache write failed: ${msg}\n`);
    }
  }
  return fresh;
}
