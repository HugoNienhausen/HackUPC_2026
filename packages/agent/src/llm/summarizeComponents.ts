import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Component } from '@devmap/schema';
import type { ClassRecord } from '../index/types.js';
import type { LlmClient } from './client.js';
import { SUMMARY_PLACEHOLDER } from '../views/components.js';

const MAX_SUMMARY_CHARS = 220;
const MAX_SNIPPET_LINES = 200;
const CONCURRENCY = 10;

const here = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(here, '../../prompts/summarize-component.md');

let cachedTemplate: string | null = null;
async function loadTemplate(): Promise<string> {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = await fs.readFile(PROMPT_PATH, 'utf8');
  return cachedTemplate;
}

interface NeighborInfo {
  fqn: string;
  simpleName: string;
}

function buildNeighborMap(
  components: Component[],
  edges: { from: string; to: string; type: string }[],
): Map<string, NeighborInfo[]> {
  const idToComp = new Map(components.map((c) => [c.id, c]));
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.type !== 'import') continue;
    if (!idToComp.has(e.from) || !idToComp.has(e.to)) continue;
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }
  const out = new Map<string, NeighborInfo[]>();
  for (const c of components) {
    const ids = [...(adj.get(c.id) ?? new Set<string>())];
    out.set(
      c.id,
      ids
        .map((id) => idToComp.get(id))
        .filter((x): x is Component => Boolean(x))
        .map((n) => ({ fqn: n.fqn, simpleName: n.simpleName })),
    );
  }
  return out;
}

function trimSnippet(source: string, maxLines = MAX_SNIPPET_LINES): string {
  const lines = source.split('\n');
  if (lines.length <= maxLines) return source;
  return lines.slice(0, maxLines).join('\n') + '\n// ... [truncated for prompt] ...';
}

function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    vars[k] !== undefined ? vars[k] : `{{${k}}}`,
  );
}

function trimSummary(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ');
  if (cleaned.length <= MAX_SUMMARY_CHARS) return cleaned;
  return cleaned.slice(0, MAX_SUMMARY_CHARS - 1).replace(/\s+\S*$/, '') + '…';
}

interface SummarizeInput {
  components: Component[];
  classes: ClassRecord[];
  edges: { from: string; to: string; type: string }[];
  feature: { name: string; summary: string };
  client: LlmClient;
  warn?: (msg: string) => void;
}

export async function summarizeComponents(
  input: SummarizeInput,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!input.client.isLive()) return out;

  const template = await loadTemplate();
  const classByFqn = new Map(input.classes.map((c) => [c.fqn, c]));
  const neighbors = buildNeighborMap(input.components, input.edges);
  const warn = input.warn ?? ((m) => process.stderr.write(m + '\n'));

  const queue: Component[] = [...input.components];
  const workers: Promise<void>[] = [];

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      try {
        const cls = classByFqn.get(c.fqn);
        let snippet = '// (source unavailable)';
        if (cls) {
          try {
            const raw = await fs.readFile(cls.sourceFile, 'utf8');
            snippet = trimSnippet(raw);
          } catch {
            // keep placeholder snippet
          }
        }
        const neighborList =
          (neighbors.get(c.id) ?? [])
            .slice(0, 8)
            .map((n) => `- ${n.simpleName} (${n.fqn})`)
            .join('\n') || '- (none)';

        const prompt = fillTemplate(template, {
          component_fqn: c.fqn,
          component_simple_name: c.simpleName,
          component_kind: c.kind,
          component_microservice: c.microservice,
          component_annotations: c.annotations.join(', ') || '(none)',
          neighbors: neighborList,
          file_snippet: snippet,
          feature_name: input.feature.name,
          feature_summary: input.feature.summary,
        });

        const text = await input.client.complete({
          model: 'summary',
          user: prompt,
          maxTokens: 200,
          temperature: 0.2,
        });
        if (text && text.length > 0) {
          out.set(c.id, trimSummary(text));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(
          `[devmap] summary failed for ${c.simpleName} (${c.fqn}): ${msg} — keeping placeholder`,
        );
      }
    }
  };

  for (let i = 0; i < Math.min(CONCURRENCY, input.components.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return out;
}

export function applySummaries(
  components: Component[],
  summaries: Map<string, string>,
): Component[] {
  return components.map((c) => {
    const s = summaries.get(c.id);
    return s ? { ...c, summary: s } : c;
  });
}

export { MAX_SUMMARY_CHARS, SUMMARY_PLACEHOLDER, trimSummary, trimSnippet };
