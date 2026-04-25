import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseFile, stripComments } from './parseClass.js';

const FIX = path.resolve(__dirname, '../../../../tests/fixtures/java');

async function readFix(name: string): Promise<string> {
  return fs.readFile(path.join(FIX, name), 'utf8');
}

describe('parseClass', () => {
  it('parses Visit (@Entity) with the entity kind and JPA annotations', async () => {
    const src = await readFix('Visit.java');
    const records = parseFile('/abs/Visit.java', 'visits/Visit.java', src, 'visits-service');
    const top = records[0]!;
    expect(top.simpleName).toBe('Visit');
    expect(top.fqn).toBe('org.springframework.samples.petclinic.visits.model.Visit');
    expect(top.kind).toBe('entity');
    expect(top.annotations).toEqual(expect.arrayContaining(['@Entity', '@Table']));
    expect(top.flags.bootstrap).toBe(false);
    expect(top.flags.crossCutting).toBe(false);
    const inner = records.find((r) => r.simpleName === 'VisitBuilder');
    expect(inner).toBeDefined();
  });

  it('parses VisitResource (@RestController) and lists 3 endpoints', async () => {
    const src = await readFix('VisitResource.java');
    const records = parseFile(
      '/abs/VisitResource.java',
      'visits/web/VisitResource.java',
      src,
      'visits-service',
    );
    const top = records[0]!;
    expect(top.simpleName).toBe('VisitResource');
    expect(top.kind).toBe('controller');
    expect(top.annotations).toEqual(expect.arrayContaining(['@RestController', '@Timed']));
    expect(top.methods.length).toBe(3);
    const verbs = top.methods.map((m) => m.httpMethod).sort();
    expect(verbs).toEqual(['GET', 'GET', 'POST']);
    expect(top.methods.map((m) => m.name).sort()).toEqual(['create', 'read', 'read']);
  });

  it('parses VisitRepository (interface + JpaRepository) as repository', async () => {
    const src = await readFix('VisitRepository.java');
    const records = parseFile(
      '/abs/VisitRepository.java',
      'visits/model/VisitRepository.java',
      src,
      'visits-service',
    );
    const top = records[0]!;
    expect(top.simpleName).toBe('VisitRepository');
    expect(top.kind).toBe('repository');
  });

  it('parses MetricConfig (@Configuration) and FLAGS it as cross-cutting', async () => {
    const src = await readFix('MetricConfig.java');
    const records = parseFile(
      '/abs/MetricConfig.java',
      'visits/config/MetricConfig.java',
      src,
      'visits-service',
    );
    const top = records[0]!;
    expect(top.simpleName).toBe('MetricConfig');
    expect(top.kind).toBe('configuration');
    expect(top.flags.crossCutting).toBe(true);
  });

  it('parses VisitsServiceApplication and FLAGS it as bootstrap (kind=application)', async () => {
    const src = await readFix('VisitsServiceApplication.java');
    const records = parseFile(
      '/abs/VisitsServiceApplication.java',
      'visits/VisitsServiceApplication.java',
      src,
      'visits-service',
    );
    const top = records[0]!;
    expect(top.simpleName).toBe('VisitsServiceApplication');
    expect(top.kind).toBe('application');
    expect(top.annotations).toEqual(
      expect.arrayContaining(['@SpringBootApplication', '@EnableDiscoveryClient']),
    );
    expect(top.flags.bootstrap).toBe(true);
  });

  it('stripComments removes // and /* */ but preserves strings and line count', () => {
    const src = `// hello\nclass A {\n  String s = "/* not a comment */";\n  /* block\n     comment */\n  int x;\n}`;
    const out = stripComments(src);
    expect(out.split('\n').length).toBe(src.split('\n').length);
    expect(out).toContain('"/* not a comment */"');
    expect(out).not.toContain('// hello');
  });
});
