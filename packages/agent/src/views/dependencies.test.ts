import { describe, it, expect } from 'vitest';
import { buildDependencies } from './dependencies.js';
import type { ClassRecord, Edge as IndexEdge } from '../index/types.js';
import type { Component } from '@devmap/schema';

function comp(p: Partial<Component> & { id: string; fqn: string; simpleName: string }): Component {
  return {
    id: p.id,
    fqn: p.fqn,
    simpleName: p.simpleName,
    kind: p.kind ?? 'other',
    microservice: p.microservice ?? 'visits-service',
    filePath: p.filePath ?? 'x.java',
    annotations: p.annotations ?? [],
    publicMethods: p.publicMethods ?? [],
    summary: p.summary ?? '',
    core: p.core ?? false,
    loc: p.loc ?? 1,
  };
}

function cls(p: Partial<ClassRecord> & { fqn: string; simpleName: string }): ClassRecord {
  return {
    fqn: p.fqn,
    simpleName: p.simpleName,
    package: p.package ?? '',
    microservice: p.microservice ?? null,
    sourceFile: p.sourceFile ?? '/abs',
    relativePath: p.relativePath ?? `${p.simpleName}.java`,
    kind: p.kind ?? 'other',
    annotations: p.annotations ?? [],
    imports: p.imports ?? [],
    methods: p.methods ?? [],
    loc: p.loc ?? 1,
    flags: p.flags ?? { bootstrap: false, crossCutting: false },
  };
}

describe('buildDependencies — edge subsetting to feature scope', () => {
  it('drops import edges where either endpoint is not in components', () => {
    const components = [
      comp({ id: 'a.A', fqn: 'a.A', simpleName: 'A' }),
      comp({ id: 'a.B', fqn: 'a.B', simpleName: 'B' }),
    ];
    const classes = [cls({ fqn: 'a.A', simpleName: 'A' }), cls({ fqn: 'a.B', simpleName: 'B' })];
    const edges: IndexEdge[] = [
      { from: 'svc', to: 'svc', type: 'import', via: 'a.A -> a.B' },
      { from: 'svc', to: 'svc', type: 'import', via: 'a.A -> a.NotInScope' },
    ];
    const r = buildDependencies({ components, classes, edges });
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]).toMatchObject({ from: 'a.A', to: 'a.B', type: 'import' });
  });

  it('http edges: kept only when source class is a component; preserves sourceFile/Line', () => {
    const components = [
      comp({
        id: 'api.application.CustomersServiceClient',
        fqn: 'org.springframework.samples.petclinic.api.application.CustomersServiceClient',
        simpleName: 'CustomersServiceClient',
        microservice: 'api-gateway',
      }),
    ];
    const classes = [
      cls({
        fqn: 'org.springframework.samples.petclinic.api.application.CustomersServiceClient',
        simpleName: 'CustomersServiceClient',
        microservice: 'api-gateway',
        relativePath: 'gateway/CustomersServiceClient.java',
      }),
    ];
    const edges: IndexEdge[] = [
      {
        from: 'api-gateway',
        to: 'customers-service',
        type: 'http',
        sourceFile: 'gateway/CustomersServiceClient.java',
        sourceLine: 37,
      },
    ];
    const r = buildDependencies({ components, classes, edges });
    expect(r.edges).toEqual([
      {
        from: 'api.application.CustomersServiceClient',
        to: 'customers-service',
        type: 'http',
        sourceFile: 'gateway/CustomersServiceClient.java',
        sourceLine: 37,
      },
    ]);
  });

  it('gateway-route edges: kept when either endpoint is a component microservice; carry the route predicate label', () => {
    const components = [comp({ id: 'visits.Visit', fqn: 'org.x.Visit', simpleName: 'Visit', microservice: 'visits-service' })];
    const edges: IndexEdge[] = [
      { from: 'api-gateway', to: 'visits-service', type: 'gateway-route', via: 'Path=/api/visit/**', sourceFile: 'application.yml' },
      { from: 'api-gateway', to: 'vets-service', type: 'gateway-route', via: 'Path=/api/vet/**', sourceFile: 'application.yml' },
    ];
    const r = buildDependencies({ components, classes: [], edges });
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]!.type).toBe('gateway-route');
    expect(r.edges[0]!.label).toContain('Path=/api/visit/**');
  });

  it('nodes mirror the components array (one per component)', () => {
    const components = [
      comp({ id: 'a.A', fqn: 'a.A', simpleName: 'A', kind: 'controller', loc: 50 }),
      comp({ id: 'a.B', fqn: 'a.B', simpleName: 'B', kind: 'entity', loc: 30 }),
    ];
    const r = buildDependencies({ components, classes: [], edges: [] });
    expect(r.nodes).toHaveLength(2);
    expect(r.nodes[0]).toEqual({ id: 'a.A', label: 'A', microservice: 'visits-service', kind: 'controller', loc: 50 });
  });
});
