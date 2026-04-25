import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  buildPersistence,
  camelToSnake,
  detectFkByValue,
  extractFields,
  extractInterfaceMethods,
  extractRepoInfo,
  extractTableName,
  getClassBody,
} from './persistence.js';
import { stripComments } from '../index/parseClass.js';
import type { ClassRecord } from '../index/types.js';
import type { Component } from '@devmap/schema';

const FIX = path.resolve(__dirname, '../../../../tests/fixtures/java');

describe('persistence — primitives', () => {
  it('camelToSnake', () => {
    expect(camelToSnake('petId')).toBe('pet_id');
    expect(camelToSnake('visitDate')).toBe('visit_date');
    expect(camelToSnake('id')).toBe('id');
    expect(camelToSnake('createdAtUTC')).toBe('created_at_utc');
  });

  it('extractTableName from @Table(name="visits"), fallback to simpleName', () => {
    const stripped = stripComments(`@Entity\n@Table(name = "visits")\npublic class Visit {}`);
    expect(extractTableName(stripped, 'visit')).toBe('visits');
    expect(extractTableName(stripComments(`@Entity\nclass X {}`), 'x_default')).toBe(
      'x_default',
    );
  });
});

describe('persistence — Visit entity (real PetClinic fixture)', () => {
  it('extractFields finds id (PK), date, description, petId with correct types and annotations', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(path.join(FIX, 'Visit.java'), 'utf8');
    const stripped = stripComments(src);
    const body = getClassBody(stripped);
    const fields = extractFields(body);
    const names = fields.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['id', 'date', 'description', 'petId']));
    const id = fields.find((f) => f.name === 'id')!;
    expect(id.type).toBe('Integer');
    expect(id.annotations.some((a) => a.startsWith('@Id'))).toBe(true);
    const petId = fields.find((f) => f.name === 'petId')!;
    expect(petId.type).toBe('int');
    expect(petId.annotations.some((a) => a.includes('"pet_id"'))).toBe(true);
  });

  it('detectFkByValue: petId (int) with Pet entity in customers-service → ForeignKeyByValue', () => {
    const idx = new Map([['Pet', 'customers-service']]);
    const r = detectFkByValue('petId', 'int', 'visits-service', idx);
    expect(r).toEqual({
      kind: 'ForeignKeyByValue',
      target: 'Pet (customers-service)',
      joinColumn: 'pet_id',
    });
  });

  it('detectFkByValue: same-service target is NOT a cross-service FK', () => {
    const idx = new Map([['Pet', 'visits-service']]);
    expect(detectFkByValue('petId', 'int', 'visits-service', idx)).toBeUndefined();
  });

  it('detectFkByValue: no matching entity → undefined', () => {
    const idx = new Map<string, string>();
    expect(detectFkByValue('petId', 'int', 'visits-service', idx)).toBeUndefined();
  });

  it('detectFkByValue: non-FK type (String) → undefined', () => {
    const idx = new Map([['Pet', 'customers-service']]);
    expect(detectFkByValue('petId', 'String', 'visits-service', idx)).toBeUndefined();
  });
});

describe('persistence — VisitRepository', () => {
  it('extractRepoInfo returns { entity: "Visit", idType: "Integer" }', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(path.join(FIX, 'VisitRepository.java'), 'utf8');
    const info = extractRepoInfo(stripComments(src));
    expect(info).toEqual({ entity: 'Visit', idType: 'Integer' });
  });

  it('extractInterfaceMethods finds findByPetId and findByPetIdIn', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(path.join(FIX, 'VisitRepository.java'), 'utf8');
    const methods = extractInterfaceMethods(stripComments(src));
    const names = methods.map((m) => m.name).sort();
    expect(names).toEqual(['findByPetId', 'findByPetIdIn']);
    const inMethod = methods.find((m) => m.name === 'findByPetIdIn');
    expect(inMethod?.paramTypes).toBe('Collection<Integer>');
  });
});

describe('persistence — buildPersistence end-to-end on the Visit fixture', () => {
  it('emits Visit entity with petId FK + 4 operations (2 custom + save + findById)', () => {
    const visitClass: ClassRecord = {
      fqn: 'org.springframework.samples.petclinic.visits.model.Visit',
      simpleName: 'Visit',
      package: 'org.springframework.samples.petclinic.visits.model',
      microservice: 'visits-service',
      sourceFile: path.join(FIX, 'Visit.java'),
      relativePath: 'visits/model/Visit.java',
      kind: 'entity',
      annotations: ['@Entity', '@Table'],
      imports: [],
      methods: [],
      loc: 100,
      flags: { bootstrap: false, crossCutting: false },
    };
    const repoClass: ClassRecord = {
      fqn: 'org.springframework.samples.petclinic.visits.model.VisitRepository',
      simpleName: 'VisitRepository',
      package: 'org.springframework.samples.petclinic.visits.model',
      microservice: 'visits-service',
      sourceFile: path.join(FIX, 'VisitRepository.java'),
      relativePath: 'visits/model/VisitRepository.java',
      kind: 'repository',
      annotations: [],
      imports: [],
      methods: [],
      loc: 30,
      flags: { bootstrap: false, crossCutting: false },
    };
    const petClass: ClassRecord = {
      fqn: 'org.springframework.samples.petclinic.customers.model.Pet',
      simpleName: 'Pet',
      package: 'org.springframework.samples.petclinic.customers.model',
      microservice: 'customers-service',
      sourceFile: '/dev/null',
      relativePath: 'customers/model/Pet.java',
      kind: 'entity',
      annotations: ['@Entity'],
      imports: [],
      methods: [],
      loc: 50,
      flags: { bootstrap: false, crossCutting: false },
    };
    const components: Component[] = [
      {
        id: 'visits.model.Visit',
        fqn: visitClass.fqn,
        simpleName: 'Visit',
        kind: 'entity',
        microservice: 'visits-service',
        filePath: visitClass.relativePath,
        annotations: visitClass.annotations,
        publicMethods: [],
        summary: '',
        core: true,
        loc: 100,
      },
      {
        id: 'visits.model.VisitRepository',
        fqn: repoClass.fqn,
        simpleName: 'VisitRepository',
        kind: 'repository',
        microservice: 'visits-service',
        filePath: repoClass.relativePath,
        annotations: [],
        publicMethods: [],
        summary: '',
        core: true,
        loc: 30,
      },
    ];
    const r = buildPersistence({
      components,
      classes: [visitClass, repoClass, petClass],
    });
    expect(r.entities).toHaveLength(1);
    const visit = r.entities[0]!;
    expect(visit.simpleName).toBe('Visit');
    expect(visit.table).toBe('visits');
    const petId = visit.fields.find((f) => f.name === 'petId')!;
    expect(petId.relation).toEqual({
      kind: 'ForeignKeyByValue',
      target: 'Pet (customers-service)',
      joinColumn: 'pet_id',
    });
    expect(petId.column).toBe('pet_id');
    const id = visit.fields.find((f) => f.name === 'id')!;
    expect(id.primaryKey).toBe(true);

    const customMethods = r.operations.filter((o) => o.custom).map((o) => o.method);
    expect(customMethods.sort()).toEqual([
      'findByPetId(int)',
      'findByPetIdIn(Collection<Integer>)',
    ]);
    expect(r.operations.find((o) => o.method.startsWith('save'))?.custom).toBe(false);
    expect(r.operations.find((o) => o.method.startsWith('findById'))?.custom).toBe(false);

    expect(r.mermaidER).toContain('erDiagram');
    expect(r.mermaidER).toContain('VISIT');
    expect(r.mermaidER).toContain('PET ||..o{ VISIT');
    expect(r.mermaidER).toContain('FK_byValue');
  });
});
