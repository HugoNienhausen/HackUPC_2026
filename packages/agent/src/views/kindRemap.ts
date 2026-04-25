import type { ClassRecord } from '../index/types.js';
import type { Kind } from '@devmap/schema';

export function viewKind(c: ClassRecord): Kind {
  const annos = new Set(c.annotations.map((a) => a.replace(/\(.*\)$/, '')));
  if (annos.has('@RestController') || annos.has('@Controller')) return 'controller';
  if (annos.has('@Service')) return 'service';
  if (annos.has('@Repository')) return 'repository';
  if (c.kind === 'repository') return 'repository';
  if (annos.has('@Entity')) return 'entity';
  if (annos.has('@Configuration')) return 'config';
  if (c.simpleName.endsWith('Application')) return 'application';
  if (c.simpleName.endsWith('Exception')) return 'exception';
  if (c.simpleName.endsWith('Mapper')) return 'mapper';
  if (c.simpleName.endsWith('Client')) return 'client';
  if (c.package.includes('.dto.') || c.package.endsWith('.dto')) return 'dto';
  return 'other';
}

export function isInnerClass(c: ClassRecord, allFqns: Set<string>): boolean {
  const lastDot = c.fqn.lastIndexOf('.');
  if (lastDot < 0) return false;
  const enclosing = c.fqn.slice(0, lastDot);
  return allFqns.has(enclosing);
}
