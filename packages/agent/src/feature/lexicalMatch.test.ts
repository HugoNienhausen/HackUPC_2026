import { describe, it, expect } from 'vitest';
import { lexicalMatch, stemFor } from './lexicalMatch.js';
import type { ClassRecord } from '../index/types.js';

function mk(partial: Partial<ClassRecord> & { fqn: string; simpleName: string }): ClassRecord {
  return {
    fqn: partial.fqn,
    simpleName: partial.simpleName,
    package: partial.package ?? '',
    microservice: partial.microservice ?? null,
    sourceFile: partial.sourceFile ?? '/tmp/x.java',
    relativePath: partial.relativePath ?? `${partial.simpleName}.java`,
    kind: partial.kind ?? 'other',
    annotations: partial.annotations ?? [],
    imports: partial.imports ?? [],
    methods: partial.methods ?? [],
    loc: partial.loc ?? 1,
    flags: partial.flags ?? { bootstrap: false, crossCutting: false },
  };
}

describe('lexicalMatch — scoring weights', () => {
  it('(a) simpleName match scores 3 in isolation', () => {
    const cls = [
      mk({ fqn: 'a.Visit', simpleName: 'Visit', package: 'a', relativePath: 'a/X.java' }),
    ];
    const [m] = lexicalMatch(cls, 'visits');
    expect(m).toMatchObject({ fqn: 'a.Visit', score: 3 });
    expect(m!.hits).toEqual({ name: true, package: false, path: false });
  });

  it('(b) package match scores 2 (and stacks with name)', () => {
    const cls = [
      mk({
        fqn: 'org.x.visits.model.Visit',
        simpleName: 'Visit',
        package: 'org.x.visits.model',
        relativePath: 'Visit.java',
      }),
    ];
    const [m] = lexicalMatch(cls, 'visits');
    // name(3) + package(2) = 5 (no path match, since "visits" stem is "visit" but path is "Visit.java")
    expect(m!.score).toBe(3 + 2 + 1);
    expect(m!.hits).toEqual({ name: true, package: true, path: true });
  });

  it('(c) path-only match scores 1', () => {
    const cls = [
      mk({
        fqn: 'a.b.Sibling',
        simpleName: 'Sibling',
        package: 'a.b',
        relativePath: 'spring-petclinic-visits-service/src/main/java/Sibling.java',
      }),
    ];
    const [m] = lexicalMatch(cls, 'visits');
    expect(m).toMatchObject({ fqn: 'a.b.Sibling', score: 1 });
    expect(m!.hits).toEqual({ name: false, package: false, path: true });
  });

  it('(d) flags.crossCutting filters BEFORE scoring (MetricConfig)', () => {
    const cls = [
      mk({
        fqn: 'a.visits.config.MetricConfig',
        simpleName: 'MetricConfig',
        package: 'a.visits.config',
        relativePath: 'visits/config/MetricConfig.java',
        flags: { bootstrap: false, crossCutting: true },
      }),
    ];
    expect(lexicalMatch(cls, 'visits')).toEqual([]);
  });

  it('(e) flags.bootstrap filters BEFORE scoring (VisitsServiceApplication)', () => {
    const cls = [
      mk({
        fqn: 'a.visits.VisitsServiceApplication',
        simpleName: 'VisitsServiceApplication',
        package: 'a.visits',
        relativePath: 'visits/VisitsServiceApplication.java',
        kind: 'application',
        flags: { bootstrap: true, crossCutting: false },
      }),
    ];
    expect(lexicalMatch(cls, 'visits')).toEqual([]);
  });

  it('(f) below threshold rejected', () => {
    const cls = [mk({ fqn: 'a.Vet', simpleName: 'Vet', package: 'a' })];
    expect(lexicalMatch(cls, 'visits')).toEqual([]);
  });

  it('stems trailing s: visits -> visit, owners -> owner', () => {
    expect(stemFor('visits')).toBe('visit');
    expect(stemFor('owners')).toBe('owner');
    expect(stemFor('Auth')).toBe('auth');
    expect(stemFor('issues')).toBe('issue');
  });

  it('output is sorted by score desc then fqn asc', () => {
    const cls = [
      mk({ fqn: 'a.b.Visits', simpleName: 'Visits', package: 'a.b' }),
      mk({ fqn: 'org.visits.Visit', simpleName: 'Visit', package: 'org.visits' }),
      mk({ fqn: 'a.b.VisitDetails', simpleName: 'VisitDetails', package: 'a.b' }),
    ];
    const out = lexicalMatch(cls, 'visits');
    expect(out.map((m) => m.fqn)).toEqual([
      'org.visits.Visit',
      'a.b.VisitDetails',
      'a.b.Visits',
    ]);
  });
});
