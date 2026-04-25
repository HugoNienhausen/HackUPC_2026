import { describe, it, expect, vi } from 'vitest';
import { applyIdentify, identifyFeature } from './identifyFeature.js';
import { LlmClient, type AnthropicLike } from './client.js';
import type { ClassRecord } from '../index/types.js';

function cls(p: Partial<ClassRecord> & { fqn: string; simpleName: string }): ClassRecord {
  return {
    fqn: p.fqn,
    simpleName: p.simpleName,
    package: p.package ?? '',
    microservice: p.microservice ?? null,
    sourceFile: p.sourceFile ?? '/dev/null',
    relativePath: p.relativePath ?? `${p.simpleName}.java`,
    kind: p.kind ?? 'other',
    annotations: p.annotations ?? [],
    imports: p.imports ?? [],
    methods: p.methods ?? [],
    loc: p.loc ?? 1,
    flags: p.flags ?? { bootstrap: false, crossCutting: false },
  };
}

describe('identifyFeature — Sonnet classification', () => {
  it('parses { core, periphery, rejected, missing_suspected, rationale } from a mocked Sonnet response', async () => {
    const fake: AnthropicLike = {
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                core: ['visits.web.VisitResource', 'visits.model.Visit'],
                periphery: ['api.application.CustomersServiceClient'],
                rejected: ['api.dto.OwnerDetails'],
                missing_suspected: [{ name: 'VisitsConfig', reason: 'never seen but referenced from VisitResource imports' }],
                rationale: 'Standard CRUD with cross-service aggregation.',
              }),
            },
          ],
        })),
      },
    };
    const warnSpy = vi.fn();
    const client = new LlmClient({ client: fake });
    const result = await identifyFeature({
      featureName: 'visits',
      candidates: [
        cls({ fqn: 'org.springframework.samples.petclinic.visits.web.VisitResource', simpleName: 'VisitResource' }),
      ],
      microservices: ['visits-service', 'api-gateway'],
      client,
      warn: warnSpy,
    });
    expect(result).not.toBeNull();
    expect(result!.core.has('visits.web.VisitResource')).toBe(true);
    expect(result!.periphery.has('api.application.CustomersServiceClient')).toBe(true);
    expect(result!.rejected.has('api.dto.OwnerDetails')).toBe(true);
    expect(result!.missingSuspected).toHaveLength(1);
    expect(result!.missingSuspected[0]!.name).toBe('VisitsConfig');
    // missing_suspected logged to stderr
    expect(warnSpy.mock.calls.some((c) => /missing/.test(c[0] as string))).toBe(true);
  });

  it('returns null when LLM is disabled (--no-llm or missing key)', async () => {
    const client = new LlmClient({ noLlm: true });
    const result = await identifyFeature({
      featureName: 'visits',
      candidates: [],
      microservices: [],
      client,
    });
    expect(result).toBeNull();
  });

  it('returns null AND logs a warning if Sonnet call throws (after its own retries)', async () => {
    const fake: AnthropicLike = {
      messages: {
        create: vi.fn(async () => {
          throw new Error('500 server error');
        }),
      },
    };
    const warnSpy = vi.fn();
    const client = new LlmClient({ client: fake });
    const result = await identifyFeature({
      featureName: 'visits',
      candidates: [],
      microservices: [],
      client,
      warn: warnSpy,
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]![0]).toMatch(/identifyFeature failed/);
  });
});

describe('applyIdentify — locked-decision discrepancy detection + rejected removal', () => {
  it('removes everything in `rejected` from the candidate list', () => {
    const cands = [
      cls({ fqn: 'org.springframework.samples.petclinic.a.A', simpleName: 'A' }),
      cls({ fqn: 'org.springframework.samples.petclinic.b.B', simpleName: 'B' }),
    ];
    const r = applyIdentify(cands, {
      core: new Set(['a.A']),
      periphery: new Set([]),
      rejected: new Set(['b.B']),
      missingSuspected: [],
      rationale: '',
    });
    expect(r.classes).toHaveLength(1);
    expect(r.classes[0]!.simpleName).toBe('A');
  });

  it('logs a discrepancy when CustomersServiceClient is classified as core', () => {
    const csc = cls({
      fqn: 'org.springframework.samples.petclinic.api.application.CustomersServiceClient',
      simpleName: 'CustomersServiceClient',
    });
    const warnSpy = vi.fn();
    const r = applyIdentify(
      [csc],
      {
        core: new Set(['api.application.CustomersServiceClient']),
        periphery: new Set([]),
        rejected: new Set([]),
        missingSuspected: [],
        rationale: 'orchestrates cross-service composition',
      },
      warnSpy,
    );
    expect(r.discrepancies).toHaveLength(1);
    expect(r.discrepancies[0]).toMatch(/CustomersServiceClient classified as core/);
    expect(warnSpy).toHaveBeenCalled();
    // RESPECTS the LLM — does NOT override the classification
    expect(r.coreSet.has('api.application.CustomersServiceClient')).toBe(true);
  });

  it('NO discrepancy when CustomersServiceClient is in periphery (the locked default)', () => {
    const csc = cls({
      fqn: 'org.springframework.samples.petclinic.api.application.CustomersServiceClient',
      simpleName: 'CustomersServiceClient',
    });
    const r = applyIdentify([csc], {
      core: new Set([]),
      periphery: new Set(['api.application.CustomersServiceClient']),
      rejected: new Set([]),
      missingSuspected: [],
      rationale: '',
    });
    expect(r.discrepancies).toHaveLength(0);
  });
});
