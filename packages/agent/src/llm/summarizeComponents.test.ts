import { describe, it, expect, vi } from 'vitest';
import {
  summarizeComponents,
  applySummaries,
  trimSummary,
  trimSnippet,
  MAX_SUMMARY_CHARS,
} from './summarizeComponents.js';
import { LlmClient, type AnthropicLike } from './client.js';
import type { Component } from '@devmap/schema';

function comp(p: Partial<Component> & { id: string; simpleName: string }): Component {
  return {
    id: p.id,
    fqn: p.fqn ?? `org.x.${p.simpleName}`,
    simpleName: p.simpleName,
    kind: p.kind ?? 'other',
    microservice: p.microservice ?? 'visits-service',
    filePath: p.filePath ?? 'X.java',
    annotations: p.annotations ?? [],
    publicMethods: p.publicMethods ?? [],
    summary: p.summary ?? '[summary pending — phase 3.5]',
    core: p.core ?? false,
    loc: p.loc ?? 1,
  };
}

describe('summarizeComponents — pure helpers', () => {
  it('trimSummary strips wrapping quotes and collapses whitespace', () => {
    expect(trimSummary('  "hello   world"  ')).toBe('hello world');
    expect(trimSummary("'a\nb\nc'")).toBe('a b c');
  });

  it('trimSummary truncates to <= MAX_SUMMARY_CHARS preserving word boundary', () => {
    const long = 'word '.repeat(100);
    const out = trimSummary(long);
    expect(out.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
    expect(out.endsWith('…')).toBe(true);
  });

  it('trimSnippet caps to N lines', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `line${i}`).join('\n');
    const out = trimSnippet(lines, 100);
    expect(out.split('\n').length).toBe(101);
    expect(out).toContain('truncated for prompt');
  });
});

describe('summarizeComponents — Promise.all over mocked client', () => {
  it('returns one summary per component, distinct strings per fqn', async () => {
    const components = [
      comp({ id: 'visits.web.VisitResource', simpleName: 'VisitResource', kind: 'controller' }),
      comp({ id: 'api.application.VisitsServiceClient', simpleName: 'VisitsServiceClient', kind: 'client' }),
      comp({ id: 'visits.model.Visit', simpleName: 'Visit', kind: 'entity' }),
    ];
    const responses = new Map<string, string>([
      ['VisitResource', 'Exposes REST endpoints for visit CRUD scoped per pet.'],
      ['VisitsServiceClient', 'Wraps a load-balanced WebClient for visits-service calls.'],
      ['Visit', 'JPA entity persisting one visit row keyed by petId.'],
    ]);
    let callCount = 0;
    const fake: AnthropicLike = {
      messages: {
        create: vi.fn(async (params: any) => {
          callCount++;
          const userText = params.messages[0].content as string;
          for (const [name, ans] of responses.entries()) {
            if (userText.includes(name)) {
              return { content: [{ type: 'text', text: ans }] };
            }
          }
          return { content: [{ type: 'text', text: 'fallback' }] };
        }),
      },
    };
    const client = new LlmClient({ client: fake });
    const result = await summarizeComponents({
      components,
      classes: [],
      edges: [],
      feature: { name: 'visits', summary: 'visits feature' },
      client,
    });
    expect(callCount).toBe(3);
    expect(result.size).toBe(3);
    expect(result.get('visits.web.VisitResource')).toMatch(/REST endpoints/);
    const a = result.get('visits.web.VisitResource')!;
    const b = result.get('api.application.VisitsServiceClient')!;
    expect(a).not.toBe(b);
  });

  it('per-component failure: warns once and KEEPS placeholder for that component, others succeed', async () => {
    const components = [
      comp({ id: 'a.A', simpleName: 'A' }),
      comp({ id: 'b.B', simpleName: 'B' }),
    ];
    const fake: AnthropicLike = {
      messages: {
        create: vi.fn(async (params: any) => {
          const txt = params.messages[0].content as string;
          if (txt.includes('org.x.A')) throw new Error('boom for A');
          return { content: [{ type: 'text', text: 'B is fine' }] };
        }),
      },
    };
    const warnSpy = vi.fn();
    const client = new LlmClient({ client: fake, baseDelayMs: 1 });
    const result = await summarizeComponents({
      components,
      classes: [],
      edges: [],
      feature: { name: 'x', summary: 'y' },
      client,
      warn: warnSpy,
    });
    expect(result.has('a.A')).toBe(false);
    expect(result.get('b.B')).toBe('B is fine');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/A.*boom/);

    const merged = applySummaries(components, result);
    const a = merged.find((c) => c.id === 'a.A')!;
    const b = merged.find((c) => c.id === 'b.B')!;
    expect(a.summary).toMatch(/phase 3\.5/);
    expect(b.summary).toBe('B is fine');
  });

  it('isLive()===false short-circuits: empty Map, no SDK calls', async () => {
    const fake: AnthropicLike = {
      messages: { create: vi.fn(async () => ({ content: [] })) },
    };
    const client = new LlmClient({ client: fake, noLlm: true });
    const r = await summarizeComponents({
      components: [comp({ id: 'a', simpleName: 'A' })],
      classes: [],
      edges: [],
      feature: { name: 'x', summary: 'y' },
      client,
    });
    expect(r.size).toBe(0);
    expect((fake.messages.create as any).mock.calls).toHaveLength(0);
  });

  it('runs in parallel: 10 components with 50ms each finishes in ~one roundtrip wall-clock, not 10x', async () => {
    const components = Array.from({ length: 10 }, (_, i) =>
      comp({ id: `x.${i}`, simpleName: `X${i}` }),
    );
    const fake: AnthropicLike = {
      messages: {
        create: vi.fn(async (params: any) => {
          await new Promise((r) => setTimeout(r, 50));
          const txt = params.messages[0].content as string;
          const m = txt.match(/X\d+/);
          return { content: [{ type: 'text', text: `summary for ${m?.[0]}` }] };
        }),
      },
    };
    const client = new LlmClient({ client: fake });
    const start = Date.now();
    const r = await summarizeComponents({
      components,
      classes: [],
      edges: [],
      feature: { name: 'x', summary: 'y' },
      client,
    });
    const elapsed = Date.now() - start;
    expect(r.size).toBe(10);
    expect(elapsed).toBeLessThan(300);
  });
});
