import { describe, it, expect } from 'vitest';
import { buildFlow, FLOW_NARRATIVE_PLACEHOLDER } from './flow.js';
import type { Component } from '@devmap/schema';

function comp(p: Partial<Component> & { id: string; simpleName: string; kind: Component['kind']; microservice: string }): Component {
  return {
    id: p.id,
    fqn: p.fqn ?? p.id,
    simpleName: p.simpleName,
    kind: p.kind,
    microservice: p.microservice,
    filePath: p.filePath ?? `${p.simpleName}.java`,
    annotations: p.annotations ?? [],
    publicMethods: p.publicMethods ?? [],
    summary: p.summary ?? '',
    core: p.core ?? false,
    loc: p.loc ?? 1,
  };
}

describe('flow — structural sequence diagram', () => {
  it('returns a Mermaid sequenceDiagram with at least one ->> arrow + placeholder narrative', () => {
    const components = [
      comp({ id: 'gw.AGC', simpleName: 'ApiGatewayController', kind: 'controller', microservice: 'api-gateway' }),
      comp({ id: 'gw.VSC', simpleName: 'VisitsServiceClient', kind: 'client', microservice: 'api-gateway' }),
      comp({ id: 'v.VR', simpleName: 'VisitResource', kind: 'controller', microservice: 'visits-service' }),
      comp({ id: 'v.Repo', simpleName: 'VisitRepository', kind: 'repository', microservice: 'visits-service' }),
      comp({ id: 'v.Visit', simpleName: 'Visit', kind: 'entity', microservice: 'visits-service' }),
    ];
    const edges = [
      { from: 'gw.AGC', to: 'gw.VSC', type: 'import' as const },
      { from: 'gw.VSC', to: 'visits-service', type: 'http' as const, label: 'GET /pets/visits' },
      { from: 'v.VR', to: 'v.Repo', type: 'import' as const },
      { from: 'v.Repo', to: 'v.Visit', type: 'import' as const },
    ];
    const r = buildFlow({ components, edges });
    expect(r.mermaid).toMatch(/^sequenceDiagram\b/);
    expect(r.mermaid).toContain('->>');
    expect(r.narrative).toBe(FLOW_NARRATIVE_PLACEHOLDER);
    expect(r.steps.length).toBeGreaterThanOrEqual(2);
    const idxs = r.steps.map((s) => s.index);
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });

  it('falls back to a Note when no controller is in scope', () => {
    const r = buildFlow({ components: [], edges: [] });
    expect(r.mermaid).toContain('sequenceDiagram');
    expect(r.steps).toEqual([]);
  });
});
