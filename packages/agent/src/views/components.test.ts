import { describe, it, expect } from 'vitest';
import { buildComponents } from './components.js';
import { viewKind } from './kindRemap.js';
import type { ClassRecord } from '../index/types.js';

function mk(p: Partial<ClassRecord> & { fqn: string; simpleName: string }): ClassRecord {
  return {
    fqn: p.fqn,
    simpleName: p.simpleName,
    package: p.package ?? '',
    microservice: p.microservice ?? null,
    sourceFile: p.sourceFile ?? '/abs/x.java',
    relativePath: p.relativePath ?? `${p.simpleName}.java`,
    kind: p.kind ?? 'other',
    annotations: p.annotations ?? [],
    imports: p.imports ?? [],
    methods: p.methods ?? [],
    loc: p.loc ?? 1,
    flags: p.flags ?? { bootstrap: false, crossCutting: false },
  };
}

describe('viewKind — annotation-priority remap (locked order)', () => {
  it('VisitsServiceClient: @Component + ends "Client" → client (annotations win, lexical fallback applies)', () => {
    const c = mk({
      fqn: 'a.VisitsServiceClient',
      simpleName: 'VisitsServiceClient',
      annotations: ['@Component'],
      package: 'a.application',
    });
    expect(viewKind(c)).toBe('client');
  });

  it('@RestController beats lexical "Controller" suffix anyway, gives controller', () => {
    expect(viewKind(mk({ fqn: 'a.X', simpleName: 'X', annotations: ['@RestController'] }))).toBe('controller');
  });

  it('@Service wins over name-ends-in-Client', () => {
    const c = mk({ fqn: 'a.NotAClient', simpleName: 'WrappedServiceClient', annotations: ['@Service'] });
    expect(viewKind(c)).toBe('service');
  });

  it('@Entity → entity', () => {
    expect(viewKind(mk({ fqn: 'a.Visit', simpleName: 'Visit', annotations: ['@Entity'] }))).toBe('entity');
  });

  it('@Configuration → config (renamed from parseClass kind="configuration")', () => {
    expect(viewKind(mk({ fqn: 'a.X', simpleName: 'X', annotations: ['@Configuration'] }))).toBe('config');
  });

  it('Repository interface (parseClass kind="repository") → repository even without @Repository', () => {
    expect(viewKind(mk({ fqn: 'a.VisitRepository', simpleName: 'VisitRepository', kind: 'repository' }))).toBe('repository');
  });

  it('Suffix Mapper / Exception / Application', () => {
    expect(viewKind(mk({ fqn: 'a.OwnerMapper', simpleName: 'OwnerMapper' }))).toBe('mapper');
    expect(viewKind(mk({ fqn: 'a.NotFoundException', simpleName: 'NotFoundException' }))).toBe('exception');
    expect(viewKind(mk({ fqn: 'a.VisitsServiceApplication', simpleName: 'VisitsServiceApplication' }))).toBe('application');
  });

  it('package contains .dto. → dto', () => {
    expect(
      viewKind(mk({ fqn: 'a.dto.OwnerDetails', simpleName: 'OwnerDetails', package: 'a.dto' })),
    ).toBe('dto');
    expect(
      viewKind(mk({ fqn: 'b.api.dto.Visits', simpleName: 'Visits', package: 'b.api.dto' })),
    ).toBe('dto');
  });

  it('fallback → other', () => {
    expect(viewKind(mk({ fqn: 'a.RandomThing', simpleName: 'RandomThing' }))).toBe('other');
  });
});

describe('buildComponents', () => {
  const classes = [
    mk({
      fqn: 'org.x.Visit',
      simpleName: 'Visit',
      microservice: 'visits-service',
      annotations: ['@Entity'],
      package: 'org.x',
    }),
    mk({
      fqn: 'org.x.MetricConfig',
      simpleName: 'MetricConfig',
      microservice: 'visits-service',
      annotations: ['@Configuration'],
      flags: { bootstrap: false, crossCutting: true },
    }),
    mk({
      fqn: 'org.x.VisitsServiceApplication',
      simpleName: 'VisitsServiceApplication',
      microservice: 'visits-service',
      annotations: ['@SpringBootApplication'],
      kind: 'application',
      flags: { bootstrap: true, crossCutting: false },
    }),
    mk({
      fqn: 'org.x.Visit.VisitBuilder',
      simpleName: 'VisitBuilder',
      microservice: 'visits-service',
    }),
    mk({
      fqn: 'org.x.api.application.CustomersServiceClient',
      simpleName: 'CustomersServiceClient',
      microservice: 'api-gateway',
      annotations: ['@Component'],
    }),
  ];

  it('locked decisions: filters MetricConfig (cross-cutting) and *Application (bootstrap)', () => {
    const seed = new Set(['org.x.Visit']);
    const expanded = new Set([
      'org.x.MetricConfig',
      'org.x.VisitsServiceApplication',
      'org.x.api.application.CustomersServiceClient',
    ]);
    const out = buildComponents({ classes, seedFqns: seed, expandedFqns: expanded });
    const fqns = out.map((c) => c.fqn);
    expect(fqns).toContain('org.x.Visit');
    expect(fqns).toContain('org.x.api.application.CustomersServiceClient');
    expect(fqns).not.toContain('org.x.MetricConfig');
    expect(fqns).not.toContain('org.x.VisitsServiceApplication');
  });

  it('CustomersServiceClient.core === false (locked decision: periphery for visits)', () => {
    const seed = new Set(['org.x.Visit']);
    const expanded = new Set(['org.x.api.application.CustomersServiceClient']);
    const out = buildComponents({ classes, seedFqns: seed, expandedFqns: expanded });
    const csc = out.find((c) => c.simpleName === 'CustomersServiceClient');
    expect(csc?.core).toBe(false);
  });

  it('Inner classes (VisitBuilder under Visit) are filtered from components', () => {
    const seed = new Set(['org.x.Visit']);
    const expanded = new Set(['org.x.Visit.VisitBuilder']);
    const out = buildComponents({ classes, seedFqns: seed, expandedFqns: expanded });
    expect(out.find((c) => c.simpleName === 'VisitBuilder')).toBeUndefined();
  });

  it('summary placeholder is set', () => {
    const seed = new Set(['org.x.Visit']);
    const out = buildComponents({ classes, seedFqns: seed, expandedFqns: new Set() });
    expect(out[0]!.summary).toMatch(/phase 3\.5/);
  });
});
