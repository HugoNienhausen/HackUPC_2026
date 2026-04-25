import type { ClassRecord } from '../index/types.js';
import type { Component } from '@devmap/schema';
import { isInnerClass, viewKind } from './kindRemap.js';

export const SUMMARY_PLACEHOLDER = '[summary pending — phase 3.5]';

export interface BuildComponentsInput {
  classes: ClassRecord[];
  seedFqns: Set<string>;
  expandedFqns: Set<string>;
}

export function buildComponents({
  classes,
  seedFqns,
  expandedFqns,
}: BuildComponentsInput): Component[] {
  const allFqns = new Set(classes.map((c) => c.fqn));
  const inScope = new Set([...seedFqns, ...expandedFqns]);
  const byFqn = new Map(classes.map((c) => [c.fqn, c]));

  const out: Component[] = [];
  for (const fqn of inScope) {
    const c = byFqn.get(fqn);
    if (!c) continue;
    if (c.flags.bootstrap || c.flags.crossCutting) continue;
    if (isInnerClass(c, allFqns)) continue;

    const id = c.fqn.replace(/^org\.springframework\.samples\.petclinic\./, '');
    out.push({
      id,
      fqn: c.fqn,
      simpleName: c.simpleName,
      kind: viewKind(c),
      microservice: c.microservice ?? '(unknown)',
      filePath: c.relativePath,
      loc: c.loc,
      annotations: c.annotations,
      publicMethods: c.methods.map((m) => ({
        name: m.name,
        signature: m.signature,
        annotations: m.annotations,
        lineStart: m.line,
      })),
      summary: SUMMARY_PLACEHOLDER,
      core: seedFqns.has(fqn),
    });
  }

  out.sort((a, b) => {
    if (a.core !== b.core) return a.core ? -1 : 1;
    return a.fqn.localeCompare(b.fqn);
  });
  return out;
}
