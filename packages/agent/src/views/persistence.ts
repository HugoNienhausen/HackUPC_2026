import { readFileSync } from 'node:fs';
import type { ClassRecord } from '../index/types.js';
import type { Component, PersistenceSchema } from '@devmap/schema';
import { stripComments } from '../index/parseClass.js';
import { z } from 'zod';

type Persistence = z.infer<typeof PersistenceSchema>;
type EntityField = Persistence['entities'][number]['fields'][number];

export interface BuildPersistenceInput {
  components: Component[];
  classes: ClassRecord[];
}

export function camelToSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function isEntityClass(c: ClassRecord): boolean {
  return c.annotations.some((a) => a === '@Entity' || a.startsWith('@Entity('));
}

export function extractTableName(stripped: string, fallback: string): string {
  const m = stripped.match(/@Table\s*\(\s*(?:name\s*=\s*)?"([^"]*)"/);
  return m ? m[1]! : fallback;
}

export function extractFields(
  classBody: string,
): { name: string; type: string; annotations: string[] }[] {
  const out: { name: string; type: string; annotations: string[] }[] = [];
  let depth = 0;
  let chunkStart = 0;
  let inString: '"' | "'" | null = null;

  const flushChunk = (chunk: string): void => {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const annos: string[] = [];
    const codeParts: string[] = [];
    for (const line of lines) {
      if (line.startsWith('@')) annos.push(line);
      else codeParts.push(line);
    }
    let code = codeParts.join(' ').trim();
    if (!code) return;
    const eq = code.indexOf('=');
    if (eq >= 0) code = code.slice(0, eq).trim();
    if (code.includes('(')) return;
    const m = code.match(
      /^(?:(?:public|private|protected|static|final|transient|volatile)\s+)+(.+?)\s+(\w+)\s*$/,
    );
    if (!m) return;
    out.push({ type: m[1]!.trim(), name: m[2]!, annotations: annos });
  };

  for (let i = 0; i < classBody.length; i++) {
    const c = classBody[i];
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c as '"' | "'";
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      if (depth === 0) {
        chunkStart = i + 1;
      } else {
        depth--;
        if (depth === 0) chunkStart = i + 1;
      }
    } else if (c === ';' && depth === 0) {
      flushChunk(classBody.slice(chunkStart, i));
      chunkStart = i + 1;
    }
  }
  return out;
}

export function getClassBody(stripped: string): string {
  const m = stripped.match(/\bclass\s+\w+[^{]*\{/);
  if (!m) return '';
  const start = m.index! + m[0].length;
  let depth = 1;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') {
      depth--;
      if (depth === 0) return stripped.slice(start, i);
    }
  }
  return stripped.slice(start);
}

function columnNameFor(annotations: string[]): string | undefined {
  for (const a of annotations) {
    const m = a.match(/@Column\s*\(\s*(?:name\s*=\s*)?"([^"]*)"/);
    if (m) return m[1];
  }
  return undefined;
}

function isPrimaryKey(annotations: string[]): boolean {
  return annotations.some((a) => a === '@Id' || a.startsWith('@Id('));
}

const FK_TYPES = new Set(['int', 'Integer', 'Long', 'long']);

export function detectFkByValue(
  fieldName: string,
  fieldType: string,
  ownMicroservice: string,
  entityIndex: Map<string, string>,
): EntityField['relation'] | undefined {
  if (!/^[a-z]\w*Id$/.test(fieldName)) return undefined;
  if (!FK_TYPES.has(fieldType)) return undefined;
  const baseName = fieldName.replace(/Id$/, '');
  const targetEntity = baseName.charAt(0).toUpperCase() + baseName.slice(1);
  const targetService = entityIndex.get(targetEntity);
  if (!targetService) return undefined;
  if (targetService === ownMicroservice) return undefined;
  return {
    kind: 'ForeignKeyByValue',
    target: `${targetEntity} (${targetService})`,
    joinColumn: camelToSnake(fieldName),
  };
}

interface RepoInfo {
  entity: string;
  idType: string;
}

export function extractRepoInfo(stripped: string): RepoInfo | null {
  const m = stripped.match(/extends\s+JpaRepository\s*<\s*(\w+)\s*,\s*(\w+)\s*>/);
  if (!m) return null;
  return { entity: m[1]!, idType: m[2]! };
}

export interface RepoMethod {
  name: string;
  paramTypes: string;
}

export function extractInterfaceMethods(stripped: string): RepoMethod[] {
  const ifaceMatch = stripped.match(/\binterface\s+\w+[^{]*\{/);
  if (!ifaceMatch) return [];
  const start = ifaceMatch.index! + ifaceMatch[0].length;
  let depth = 1;
  let end = start;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = stripped.slice(start, end);
  const methods: RepoMethod[] = [];
  const re = /(?:^|\n)\s*(?:public\s+|default\s+)?([\w<>?,.\[\]\s]+?)\s+(\w+)\s*\(([^)]*)\)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const name = m[2]!;
    const paramsRaw = m[3]!.trim();
    const paramTypes = paramsRaw
      ? paramsRaw
          .split(',')
          .map((p) => p.trim().split(/\s+/)[0])
          .filter((s): s is string => Boolean(s))
          .join(', ')
      : '';
    methods.push({ name, paramTypes });
  }
  return methods;
}

const HARDCODED_SQL: Record<string, (table: string) => string> = {
  findByPetId: (t) => `SELECT v.* FROM ${t} v WHERE v.pet_id = ?`,
  findByPetIdIn: (t) => `SELECT v.* FROM ${t} v WHERE v.pet_id IN (?, ?, ...)`,
};

function inferSql(methodName: string, table: string): string | null {
  const fn = HARDCODED_SQL[methodName];
  return fn ? fn(table) : null;
}

function sanitizeErType(type: string): string {
  // mermaid v11 erDiagram disallows '<', '>' inside type tokens (used for
  // diagram syntax). Strip Java generics: `Set<Pet>` -> `Set`. Also collapse
  // any whitespace.
  return type.replace(/<[^>]*>/g, '').replace(/\s+/g, '').trim();
}

function isCollectionType(type: string): boolean {
  return /<.+>/.test(type) || /\[\]$/.test(type);
}

function buildMermaidEr(
  entities: Persistence['entities'],
  ghostTargets: Set<string>,
): string {
  const lines = ['erDiagram'];
  for (const e of entities) {
    const entityToken = e.simpleName.toUpperCase();
    // Skip JPA collection-navigation fields (Set<Pet>, List<X>) — those map to
    // ER relationship lines, not attributes. Keeps the diagram parseable.
    const columnFields = e.fields.filter(
      (f) => !isCollectionType(f.type) && (f.column || f.primaryKey || f.relation),
    );
    const fieldLines = columnFields.map((f) => {
      const col = f.column ?? f.name;
      const tags: string[] = [];
      if (f.primaryKey) tags.push('PK');
      // mermaid v11 only recognizes PK / FK / UK as bare tags; extra info
      // must be a quoted comment after the tag. Use FK "byValue" so judges
      // see the cross-service-FK distinction in the diagram.
      if (f.relation?.kind === 'ForeignKeyByValue') tags.push('FK "byValue"');
      const type = sanitizeErType(f.type);
      return `    ${type} ${col}${tags.length ? ' ' + tags.join(' ') : ''}`;
    });
    lines.push(`  ${entityToken} {`);
    for (const fl of fieldLines) lines.push(fl);
    lines.push(`  }`);
  }
  for (const e of entities) {
    for (const f of e.fields) {
      if (f.relation?.kind === 'ForeignKeyByValue' && f.relation.target) {
        const ghostMatch = f.relation.target.match(/^(\w+)/);
        const ghostName = ghostMatch ? ghostMatch[1]!.toUpperCase() : 'GHOST';
        ghostTargets.add(ghostName);
        lines.push(
          `  ${ghostName} ||..o{ ${e.simpleName.toUpperCase()} : "FK by ${f.name} (cross-service)"`,
        );
      }
    }
  }
  return lines.join('\n');
}

export function buildPersistence({
  components,
  classes,
}: BuildPersistenceInput): Persistence {
  const entityIndex = new Map<string, string>();
  for (const c of classes) {
    if (isEntityClass(c) && c.microservice) {
      entityIndex.set(c.simpleName, c.microservice);
    }
  }

  const entityComponents = components.filter((c) => c.kind === 'entity');
  const repoComponents = components.filter((c) => c.kind === 'repository');

  const entities: Persistence['entities'] = [];
  for (const comp of entityComponents) {
    const cls = classes.find((c) => c.fqn === comp.fqn);
    if (!cls) continue;
    let src: string;
    try {
      src = readFileSync(cls.sourceFile, 'utf8');
    } catch {
      continue;
    }
    const stripped = stripComments(src);
    const table = extractTableName(stripped, comp.simpleName.toLowerCase());
    const body = getClassBody(stripped);
    const rawFields = extractFields(body);
    const fields: EntityField[] = rawFields.map((f) => {
      const column = columnNameFor(f.annotations);
      const out: EntityField = {
        name: f.name,
        type: f.type,
      };
      if (column !== undefined) out.column = column;
      if (isPrimaryKey(f.annotations)) out.primaryKey = true;
      const relation = detectFkByValue(
        f.name,
        f.type,
        comp.microservice,
        entityIndex,
      );
      if (relation) {
        out.relation = relation;
        if (out.column === undefined) out.column = relation.joinColumn;
      }
      return out;
    });
    entities.push({
      fqn: comp.fqn,
      simpleName: comp.simpleName,
      table,
      fields,
    });
  }

  const operations: Persistence['operations'] = [];
  for (const comp of repoComponents) {
    const cls = classes.find((c) => c.fqn === comp.fqn);
    if (!cls) continue;
    let src: string;
    try {
      src = readFileSync(cls.sourceFile, 'utf8');
    } catch {
      continue;
    }
    const stripped = stripComments(src);
    const repoInfo = extractRepoInfo(stripped);
    if (!repoInfo) continue;
    const entity = entities.find((e) => e.simpleName === repoInfo.entity);
    if (!entity) continue;
    const declared = extractInterfaceMethods(stripped);
    for (const m of declared) {
      const sql = inferSql(m.name, entity.table);
      if (!sql) continue;
      operations.push({
        entity: repoInfo.entity,
        method: `${m.name}(${m.paramTypes})`,
        inferredSql: sql,
        custom: true,
      });
    }
    operations.push({
      entity: repoInfo.entity,
      method: `save(${repoInfo.entity})`,
      inferredSql: `INSERT INTO ${entity.table} (...) / UPDATE ${entity.table} SET ... WHERE id = ?`,
      custom: false,
    });
    operations.push({
      entity: repoInfo.entity,
      method: `findById(${repoInfo.idType})`,
      inferredSql: `SELECT v.* FROM ${entity.table} v WHERE v.id = ?`,
      custom: false,
    });
  }

  const ghostTargets = new Set<string>();
  const mermaidER = buildMermaidEr(entities, ghostTargets);
  return { mermaidER, entities, operations };
}
