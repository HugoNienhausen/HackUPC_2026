import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Component, Endpoint } from '@devmap/schema';
import type { Edge as IndexEdge } from '../index/types.js';
import type { LlmClient } from './client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(HERE, '../../prompts/reconstruct-flow.md');

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

interface FlowStepRaw {
  index?: number;
  actor?: string;
  action?: string;
  componentId?: string;
  details?: string;
}

export interface ReconstructResult {
  mermaid: string;
  narrative: string;
  steps: { index: number; actor: string; action: string; componentId: string; details?: string }[];
  featureSummary: string;
}

interface ReconstructInput {
  featureName: string;
  featureSummary: string;
  coreComponents: Component[];
  crossServiceCalls: IndexEdge[];
  gatewayRoutes: { id?: string; target: string; predicates?: string[] }[];
  entryEndpoints: Endpoint[];
  fallbackMermaid: string;
  fallbackNarrative: string;
  client: LlmClient;
  warn?: (msg: string) => void;
}

/**
 * Lightweight Mermaid sequenceDiagram check (Phase 5 precision #1).
 * Strict parse lives in the web's MermaidView via the mermaid lib; this
 * server-side check is just a structural sanity gate so we don't ship
 * obviously broken syntax to the cache.
 */
export function isPlausibleSequenceDiagram(src: string): boolean {
  if (typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed.startsWith('sequenceDiagram')) return false;
  if (!trimmed.includes('->>')) return false;
  return true;
}

export async function reconstructFlow(
  input: ReconstructInput,
): Promise<ReconstructResult | null> {
  const warn = input.warn ?? ((m) => process.stderr.write(m + '\n'));
  if (!input.client.isLive()) return null;

  const compactComponents = input.coreComponents.map((c) => ({
    id: c.id,
    fqn: c.fqn,
    simpleName: c.simpleName,
    kind: c.kind,
    microservice: c.microservice,
    annotations: c.annotations,
    publicMethods: (c.publicMethods ?? []).map((m) => ({
      name: m.name,
      signature: m.signature,
      annotations: m.annotations,
    })),
    summary: c.summary,
  }));

  const compactCalls = input.crossServiceCalls
    .filter((e) => e.type === 'http' || e.type === 'discovery')
    .map((e) => ({
      caller: e.from,
      target: e.to,
      type: e.type,
      sourceFile: e.sourceFile,
      sourceLine: e.sourceLine,
    }));

  const compactRoutes = input.gatewayRoutes.map((r) => ({
    id: r.id,
    target: r.target,
    predicate: (r.predicates ?? []).find((p) => p.startsWith('Path=')) ?? '',
  }));

  const template = await loadTemplate();
  const prompt = fillTemplate(template, {
    feature_name: input.featureName,
    feature_summary: input.featureSummary,
    core_components: JSON.stringify(compactComponents, null, 2),
    cross_service_calls: JSON.stringify(compactCalls, null, 2),
    gateway_routes: JSON.stringify(compactRoutes, null, 2),
    entry_endpoints: JSON.stringify(input.entryEndpoints, null, 2),
  });

  type Raw = {
    mermaid?: string;
    narrative?: string;
    steps?: FlowStepRaw[];
    feature_summary?: string;
    featureSummary?: string;
  };

  let raw: Raw | null;
  try {
    raw = await input.client.completeJson<Raw>({
      model: 'judgment',
      user:
        prompt +
        '\n\nALSO produce a refreshed `feature_summary` (1-2 sentences, narrative tone) for the whole feature. Include it as `feature_summary` in the JSON alongside mermaid/narrative/steps.',
      maxTokens: 3000,
      temperature: 0.2,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[devmap] reconstructFlow failed: ${msg} — keeping structural diagram from view builder`);
    return null;
  }
  if (!raw) return null;

  let mermaid = typeof raw.mermaid === 'string' ? raw.mermaid : '';
  if (!isPlausibleSequenceDiagram(mermaid)) {
    warn(
      '[devmap] reconstructFlow: LLM mermaid did not validate (missing sequenceDiagram or ->>) — falling back to structural diagram',
    );
    mermaid = input.fallbackMermaid;
  }

  const narrative = typeof raw.narrative === 'string' ? raw.narrative.trim() : input.fallbackNarrative;

  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .filter((s): s is Required<Pick<FlowStepRaw, 'actor' | 'action' | 'componentId'>> & FlowStepRaw =>
          Boolean(s && s.actor && s.action && s.componentId),
        )
        .map((s, i) => ({
          index: typeof s.index === 'number' ? s.index : i + 1,
          actor: s.actor!,
          action: s.action!,
          componentId: s.componentId!,
          ...(s.details ? { details: s.details } : {}),
        }))
    : [];

  const featureSummary =
    typeof raw.feature_summary === 'string'
      ? raw.feature_summary
      : typeof raw.featureSummary === 'string'
        ? raw.featureSummary
        : input.featureSummary;

  return {
    mermaid,
    narrative,
    steps,
    featureSummary,
  };
}
