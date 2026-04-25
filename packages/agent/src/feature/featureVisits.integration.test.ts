import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runIndex } from '../index/runIndex.js';
import { lexicalMatch } from './lexicalMatch.js';
import { expand } from './expand.js';

const PETCLINIC = '/Users/hugonienhausen/Desktop/spring-petclinic-microservices';
const FIXTURE = path.resolve(
  __dirname,
  '../../../../tests/fixtures/visits-ground-truth.json',
);

describe('feature visits — integration against PetClinic + ground-truth fixture', () => {
  it('lexical+expansion output covers expectedCore ∪ expectedPeriphery and excludes expectedAbsent', async () => {
    try {
      await fs.access(PETCLINIC);
    } catch {
      return;
    }
    const fixture = JSON.parse(await fs.readFile(FIXTURE, 'utf8')) as {
      expectedCore: { fqn: string }[];
      expectedPeriphery: { fqn: string }[];
      expectedAbsent: { fqn: string }[];
    };

    const idx = await runIndex(PETCLINIC);
    const matches = lexicalMatch(idx.classes, 'visits');
    const result = expand(
      matches.map((m) => m.fqn),
      idx.classes,
      idx.edges,
    );
    const present = new Set<string>([...result.seed, ...result.expanded]);

    const missingCore = fixture.expectedCore
      .map((c) => c.fqn)
      .filter((fqn) => !present.has(fqn));
    const missingPeriphery = fixture.expectedPeriphery
      .map((c) => c.fqn)
      .filter((fqn) => !present.has(fqn));
    const leakedAbsent = fixture.expectedAbsent
      .map((c) => c.fqn)
      .filter((fqn) => present.has(fqn));

    expect({ missingCore, missingPeriphery, leakedAbsent }).toEqual({
      missingCore: [],
      missingPeriphery: [],
      leakedAbsent: [],
    });
  });
});
