import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClassRecord } from '../index/types.js';
import type { LlmClient } from './client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(HERE, '../../prompts/identify-feature.md');

let cachedTemplate: string | null = null;
async function loadTemplate(): Promise<string> {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = await fs.readFile(PROMPT_PATH, 'utf8');
  return cachedTemplate;
}

interface ClassificationCandidate {
  id: string;
  fqn: string;
  simpleName: string;
  microservice: string | null;
  kind: string;
  annotations: string[];
  fileSnippet: string;
}

export interface IdentifyFeatureInput {
  featureName: string;
  candidates: ClassRecord[];
  microservices: string[];
  repoSummary?: string;
  client: LlmClient;
  warn?: (msg: string) => void;
}

export interface IdentifyFeatureResult {
  core: Set<string>;
  periphery: Set<string>;
  rejected: Set<string>;
  missingSuspected: { name: string; reason: string }[];
  rationale: string;
}

const DEFAULT_REPO_SUMMARY =
  'Spring Cloud microservices clone of PetClinic. Multiple services, synchronous HTTP via api-gateway with Eureka discovery and a circuit breaker. Polyglot persistence with JPA + H2 per service.';

const SNIPPET_LINES = 30;

function trimSnippet(source: string, maxLines = SNIPPET_LINES): string {
  const lines = source.split('\n');
  if (lines.length <= maxLines) return source;
  return lines.slice(0, maxLines).join('\n') + '\n// ... [truncated] ...';
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    vars[k] !== undefined ? vars[k] : `{{${k}}}`,
  );
}

function idForFqn(fqn: string): string {
  return fqn.replace(/^org\.springframework\.samples\.petclinic\./, '');
}

async function loadSnippet(c: ClassRecord): Promise<string> {
  try {
    const raw = await fs.readFile(c.sourceFile, 'utf8');
    return trimSnippet(raw);
  } catch {
    return '// (source unavailable)';
  }
}

export async function identifyFeature(
  input: IdentifyFeatureInput,
): Promise<IdentifyFeatureResult | null> {
  const warn = input.warn ?? ((m) => process.stderr.write(m + '\n'));
  if (!input.client.isLive()) return null;

  const candidatesData: ClassificationCandidate[] = await Promise.all(
    input.candidates.map(async (c) => ({
      id: idForFqn(c.fqn),
      fqn: c.fqn,
      simpleName: c.simpleName,
      microservice: c.microservice,
      kind: c.kind,
      annotations: c.annotations,
      fileSnippet: await loadSnippet(c),
    })),
  );

  const template = await loadTemplate();
  const prompt = fillTemplate(template, {
    feature_name: input.featureName,
    candidate_components: JSON.stringify(candidatesData, null, 2),
    microservices: JSON.stringify(input.microservices, null, 2),
    repo_summary: input.repoSummary ?? DEFAULT_REPO_SUMMARY,
  });

  type RawResult = {
    core?: string[];
    periphery?: string[];
    rejected?: string[];
    missing_suspected?: ({ name?: string; reason?: string } | string)[];
    rationale?: string;
  };

  let raw: RawResult | null;
  try {
    raw = await input.client.completeJson<RawResult>({
      model: 'judgment',
      user: prompt,
      maxTokens: 2000,
      temperature: 0.1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[devmap] identifyFeature failed: ${msg} — keeping lexical+expand classification`);
    return null;
  }
  if (!raw) return null;

  const core = new Set(Array.isArray(raw.core) ? raw.core : []);
  const periphery = new Set(Array.isArray(raw.periphery) ? raw.periphery : []);
  const rejected = new Set(Array.isArray(raw.rejected) ? raw.rejected : []);
  const missingSuspected = (Array.isArray(raw.missing_suspected) ? raw.missing_suspected : [])
    .map((entry) => {
      if (typeof entry === 'string') return { name: entry, reason: '' };
      return { name: entry.name ?? '?', reason: entry.reason ?? '' };
    })
    .filter((m) => m.name && m.name !== '?');

  if (missingSuspected.length > 0) {
    const names = missingSuspected.map((m) => m.name).join(', ');
    warn(`[devmap] LLM suggests these may be missing: ${names}`);
  }

  return {
    core,
    periphery,
    rejected,
    missingSuspected,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
  };
}

/**
 * Apply an IdentifyFeatureResult to a candidate ClassRecord array:
 *   - removes everything in `rejected`
 *   - tags returned records with their LLM bucket via the `core` flag
 *     (we keep the same flag the indexer uses to keep downstream code simple)
 *
 * Locked-decision discrepancy detection: if `CustomersServiceClient` is in
 * `core` (rather than periphery as the locked decision predicts), emit a
 * single-line warning so it shows up in the run output AND the CHANGELOG
 * later. The LLM's classification is RESPECTED — we don't override.
 */
export interface AppliedIdentify {
  classes: ClassRecord[];
  coreSet: Set<string>;
  peripherySet: Set<string>;
  rejectedSet: Set<string>;
  discrepancies: string[];
}

export function applyIdentify(
  candidates: ClassRecord[],
  result: IdentifyFeatureResult,
  warn: (msg: string) => void = (m) => process.stderr.write(m + '\n'),
): AppliedIdentify {
  const idOf = (c: ClassRecord) => idForFqn(c.fqn);
  const filtered = candidates.filter((c) => !result.rejected.has(idOf(c)));
  const discrepancies: string[] = [];

  for (const c of filtered) {
    const id = idOf(c);
    if (c.simpleName === 'CustomersServiceClient' && result.core.has(id)) {
      discrepancies.push(
        `CustomersServiceClient classified as core (locked decision predicted periphery). LLM rationale: ${result.rationale.slice(0, 140)}`,
      );
    }
  }

  if (discrepancies.length > 0) {
    for (const d of discrepancies) warn(`[devmap] locked-decision discrepancy: ${d}`);
  }

  return {
    classes: filtered,
    coreSet: result.core,
    peripherySet: result.periphery,
    rejectedSet: result.rejected,
    discrepancies,
  };
}
