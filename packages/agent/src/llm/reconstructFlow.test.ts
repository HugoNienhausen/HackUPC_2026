import { describe, it, expect, vi } from 'vitest';
import {
  isPlausibleSequenceDiagram,
  reconstructFlow,
} from './reconstructFlow.js';
import { LlmClient, type AnthropicLike } from './client.js';
import type { Component, Endpoint } from '@devmap/schema';

const STUB_COMP: Component = {
  id: 'visits.web.VisitResource',
  fqn: 'org.springframework.samples.petclinic.visits.web.VisitResource',
  simpleName: 'VisitResource',
  kind: 'controller',
  microservice: 'visits-service',
  filePath: 'visits/web/VisitResource.java',
  annotations: ['@RestController'],
  publicMethods: [],
  summary: 'sums',
  core: true,
  loc: 50,
};

const STUB_ENDPOINT: Endpoint = {
  method: 'GET',
  path: '/pets/visits',
  gatewayPath: '/api/visit/pets/visits',
  componentId: 'visits.web.VisitResource',
  handlerMethod: 'read',
  microservice: 'visits-service',
};

const FALLBACK = 'sequenceDiagram\n  Client->>Server: hello';

describe('isPlausibleSequenceDiagram', () => {
  it('accepts a valid stub', () => {
    expect(isPlausibleSequenceDiagram('sequenceDiagram\n  A->>B: hi')).toBe(true);
  });

  it('rejects strings without "sequenceDiagram"', () => {
    expect(isPlausibleSequenceDiagram('flowchart LR\n  A-->B')).toBe(false);
    expect(isPlausibleSequenceDiagram('  no diagram here  ')).toBe(false);
  });

  it('rejects sequenceDiagram without arrows', () => {
    expect(isPlausibleSequenceDiagram('sequenceDiagram\n  participant A')).toBe(false);
  });

  it('rejects empty / non-string input', () => {
    expect(isPlausibleSequenceDiagram('')).toBe(false);
    // @ts-expect-error testing runtime fallback
    expect(isPlausibleSequenceDiagram(null)).toBe(false);
  });
});

describe('reconstructFlow', () => {
  it('parses { mermaid, narrative, steps, feature_summary } from mocked Sonnet', async () => {
    const fake: AnthropicLike = {
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                mermaid: 'sequenceDiagram\n  Client->>Gateway: GET /api/visit/pets/visits\n  Gateway->>Visits: lb',
                narrative:
                  'Client hits the gateway which proxies to visits-service. The repository performs a SELECT and the result returns up the stack.',
                steps: [
                  { index: 1, actor: 'Client', action: 'GET /api/visit/pets/visits', componentId: 'visits.web.VisitResource' },
                  { index: 2, actor: 'VisitResource', action: 'findByPetIdIn', componentId: 'visits.model.VisitRepository' },
                ],
                feature_summary: 'Veterinary visit records aggregated by the gateway.',
              }),
            },
          ],
        })),
      },
    };
    const client = new LlmClient({ client: fake });
    const r = await reconstructFlow({
      featureName: 'visits',
      featureSummary: 'old',
      coreComponents: [STUB_COMP],
      crossServiceCalls: [],
      gatewayRoutes: [],
      entryEndpoints: [STUB_ENDPOINT],
      fallbackMermaid: FALLBACK,
      fallbackNarrative: 'fallback prose',
      client,
    });
    expect(r).not.toBeNull();
    expect(r!.mermaid).toMatch(/^sequenceDiagram/);
    expect(r!.narrative.length).toBeGreaterThan(40);
    expect(r!.steps).toHaveLength(2);
    expect(r!.featureSummary).toMatch(/Veterinary/);
  });

  it('falls back to structural diagram when Sonnet returns malformed mermaid', async () => {
    const fake: AnthropicLike = {
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                mermaid: 'flowchart LR\n  notarrows',
                narrative: 'narrative still good',
                steps: [],
              }),
            },
          ],
        })),
      },
    };
    const warnSpy = vi.fn();
    const client = new LlmClient({ client: fake });
    const r = await reconstructFlow({
      featureName: 'visits',
      featureSummary: 'old',
      coreComponents: [STUB_COMP],
      crossServiceCalls: [],
      gatewayRoutes: [],
      entryEndpoints: [],
      fallbackMermaid: FALLBACK,
      fallbackNarrative: 'fallback prose',
      client,
      warn: warnSpy,
    });
    expect(r).not.toBeNull();
    expect(r!.mermaid).toBe(FALLBACK);
    expect(r!.narrative).toBe('narrative still good');
    expect(warnSpy.mock.calls.some((c) => /did not validate/.test(c[0] as string))).toBe(true);
  });

  it('returns null when LLM is disabled', async () => {
    const client = new LlmClient({ noLlm: true });
    const r = await reconstructFlow({
      featureName: 'x',
      featureSummary: '',
      coreComponents: [],
      crossServiceCalls: [],
      gatewayRoutes: [],
      entryEndpoints: [],
      fallbackMermaid: FALLBACK,
      fallbackNarrative: '',
      client,
    });
    expect(r).toBeNull();
  });

  it('returns null AND warns when Sonnet throws', async () => {
    const fake: AnthropicLike = {
      messages: {
        create: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    };
    const warnSpy = vi.fn();
    const client = new LlmClient({ client: fake });
    const r = await reconstructFlow({
      featureName: 'x',
      featureSummary: '',
      coreComponents: [],
      crossServiceCalls: [],
      gatewayRoutes: [],
      entryEndpoints: [],
      fallbackMermaid: FALLBACK,
      fallbackNarrative: '',
      client,
      warn: warnSpy,
    });
    expect(r).toBeNull();
    expect(warnSpy.mock.calls[0]![0]).toMatch(/reconstructFlow failed/);
  });
});
