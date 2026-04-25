import { describe, it, expect } from 'vitest';
import { buildAdjacency, expand, pickGatewayOriginClass } from './expand.js';
import type { ClassRecord, Edge } from '../index/types.js';

function mk(p: Partial<ClassRecord> & { fqn: string; simpleName: string }): ClassRecord {
  return {
    fqn: p.fqn,
    simpleName: p.simpleName,
    package: p.package ?? '',
    microservice: p.microservice ?? null,
    sourceFile: p.sourceFile ?? `/abs/${p.simpleName}.java`,
    relativePath: p.relativePath ?? `${p.simpleName}.java`,
    kind: p.kind ?? 'other',
    annotations: p.annotations ?? [],
    imports: p.imports ?? [],
    methods: p.methods ?? [],
    loc: p.loc ?? 1,
    flags: p.flags ?? { bootstrap: false, crossCutting: false },
  };
}

describe('expand — synthetic 3-node graph: depth=1 vs depth=2', () => {
  it('depth=1 visits direct neighbors only; depth=2 reaches the second hop', () => {
    const classes = [
      mk({ fqn: 'a.A', simpleName: 'A', microservice: 'svc' }),
      mk({ fqn: 'a.B', simpleName: 'B', microservice: 'svc' }),
      mk({ fqn: 'a.C', simpleName: 'C', microservice: 'svc' }),
    ];
    const edges: Edge[] = [
      { from: 'svc', to: 'svc', type: 'import', via: 'a.A -> a.B' },
      { from: 'svc', to: 'svc', type: 'import', via: 'a.B -> a.C' },
    ];
    const r1 = expand(['a.A'], classes, edges, 1);
    expect([...r1.expanded].sort()).toEqual(['a.B']);
    const r2 = expand(['a.A'], classes, edges, 2);
    expect([...r2.expanded].sort()).toEqual(['a.B', 'a.C']);
  });

  it('seed FQNs that are flagged are dropped from seed', () => {
    const classes = [
      mk({
        fqn: 'a.MetricConfig',
        simpleName: 'MetricConfig',
        microservice: 'svc',
        flags: { bootstrap: false, crossCutting: true },
      }),
    ];
    const r = expand(['a.MetricConfig'], classes, [], 1);
    expect(r.seed.size).toBe(0);
  });
});

describe('expand — controller-targeted cross-service rule', () => {
  it('http edge: source class is adjacent to controllers in target service, NOT to DTOs', () => {
    const classes = [
      mk({ fqn: 'a.Caller', simpleName: 'Caller', microservice: 'a', relativePath: 'a/Caller.java' }),
      mk({ fqn: 'b.BController', simpleName: 'BController', microservice: 'b', kind: 'controller' }),
      mk({ fqn: 'b.BDto', simpleName: 'BDto', microservice: 'b', kind: 'other' }),
    ];
    const edges: Edge[] = [
      { from: 'a', to: 'b', type: 'http', sourceFile: 'a/Caller.java' },
    ];
    const adj = buildAdjacency(classes, edges);
    expect(adj.get('a.Caller')).toBeDefined();
    expect([...adj.get('a.Caller')!].sort()).toEqual(['b.BController']);
    expect(adj.get('b.BDto')).toBeUndefined();
  });

  it('gateway-route: routed controller can step INTO origin at depth=1; origin does NOT extend back out (asymmetric)', () => {
    const classes = [
      mk({
        fqn: 'gw.ApiGatewayController',
        simpleName: 'ApiGatewayController',
        microservice: 'api-gateway',
        kind: 'controller',
      }),
      mk({
        fqn: 'gw.FallbackController',
        simpleName: 'FallbackController',
        microservice: 'api-gateway',
        kind: 'controller',
      }),
      mk({ fqn: 'v.VisitResource', simpleName: 'VisitResource', microservice: 'visits-service', kind: 'controller' }),
      mk({ fqn: 'c.PetResource', simpleName: 'PetResource', microservice: 'customers-service', kind: 'controller' }),
    ];
    const edges: Edge[] = [
      { from: 'api-gateway', to: 'visits-service', type: 'gateway-route' },
      { from: 'api-gateway', to: 'customers-service', type: 'gateway-route' },
    ];
    const origin = pickGatewayOriginClass(classes);
    expect(origin?.fqn).toBe('gw.ApiGatewayController');

    const adj = buildAdjacency(classes, edges);
    // VR can step into AGC (gateway-route incoming).
    expect([...(adj.get('v.VisitResource') ?? new Set())].sort()).toEqual([
      'gw.ApiGatewayController',
    ]);
    // AGC has no outgoing gateway-route edges — won't bridge to PetResource.
    expect(adj.get('gw.ApiGatewayController')).toBeUndefined();

    // Depth=1 from VR reaches AGC; depth=2 from VR does NOT reach PetResource.
    const r1 = expand(['v.VisitResource'], classes, edges, 1);
    expect([...r1.expanded].sort()).toEqual(['gw.ApiGatewayController']);
    const r2 = expand(['v.VisitResource'], classes, edges, 2);
    expect([...r2.expanded].sort()).toEqual(['gw.ApiGatewayController']);
  });

  it('pickGatewayOriginClass falls back to alphabetically-first controller if none contain "gateway"', () => {
    const classes = [
      mk({ fqn: 'a.ZController', simpleName: 'ZController', microservice: 'api-gateway', kind: 'controller' }),
      mk({ fqn: 'a.AController', simpleName: 'AController', microservice: 'api-gateway', kind: 'controller' }),
    ];
    const origin = pickGatewayOriginClass(classes);
    expect(origin?.simpleName).toBe('AController');
  });
});
