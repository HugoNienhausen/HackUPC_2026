import type { Component, FlowSchema } from '@devmap/schema';
import type { z } from 'zod';

type Flow = z.infer<typeof FlowSchema>;
type FlowStep = Flow['steps'][number];
type DependencyEdge = {
  from: string;
  to: string;
  type: 'import' | 'http' | 'gateway-route' | 'discovery';
  label?: string;
};

export const FLOW_NARRATIVE_PLACEHOLDER =
  'Reconstruction pending — full narrative generated in Phase 5.';

function pickEntryController(components: Component[]): Component | undefined {
  const apiGwControllers = components.filter(
    (c) => c.kind === 'controller' && c.microservice === 'api-gateway',
  );
  const named = apiGwControllers
    .filter((c) => c.simpleName.toLowerCase().includes('gateway'))
    .sort((a, b) => a.simpleName.localeCompare(b.simpleName));
  if (named.length > 0) return named[0];
  if (apiGwControllers.length > 0) return apiGwControllers[0];
  return components.find((c) => c.kind === 'controller');
}

function alias(label: string): string {
  return label.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'X';
}

export interface BuildFlowInput {
  components: Component[];
  edges: DependencyEdge[];
}

export function buildFlow({ components, edges }: BuildFlowInput): Flow {
  const entry = pickEntryController(components);
  const steps: FlowStep[] = [];
  const lines: string[] = ['sequenceDiagram'];
  lines.push('  participant U as Client');

  if (!entry) {
    lines.push('  Note over U: no controller in scope');
    return {
      mermaid: lines.join('\n'),
      narrative: FLOW_NARRATIVE_PLACEHOLDER,
      steps,
    };
  }

  const seenAliases = new Set<string>();
  const declare = (label: string): string => {
    const a = alias(label);
    if (seenAliases.has(a)) return a;
    seenAliases.add(a);
    lines.push(`  participant ${a} as ${label}`);
    return a;
  };

  const entryAlias = declare(entry.simpleName);
  steps.push({
    index: 1,
    actor: 'Client',
    action: `enters via ${entry.simpleName}`,
    componentId: entry.id,
  });
  lines.push(`  U->>${entryAlias}: HTTP request`);

  const componentById = new Map(components.map((c) => [c.id, c]));
  const visitedComps = new Set<string>([entry.id]);
  let stepIdx = 2;
  let cursor: string = entry.id;

  for (let hop = 0; hop < 6; hop++) {
    const outgoingImports = edges
      .filter((e) => e.type === 'import' && e.from === cursor && !visitedComps.has(e.to))
      .filter((e) => {
        const t = componentById.get(e.to);
        return t && (t.kind === 'client' || t.kind === 'controller' || t.kind === 'repository');
      });
    if (outgoingImports.length === 0) break;
    outgoingImports.sort((a, b) => a.to.localeCompare(b.to));
    const next = outgoingImports[0]!;
    const target = componentById.get(next.to)!;
    const targetAlias = declare(target.simpleName);
    lines.push(`  ${alias(componentById.get(cursor)!.simpleName)}->>${targetAlias}: calls ${target.simpleName}`);
    steps.push({
      index: stepIdx++,
      actor: componentById.get(cursor)!.simpleName,
      action: `calls ${target.simpleName}`,
      componentId: target.id,
    });
    visitedComps.add(target.id);

    if (target.kind === 'client') {
      const httpEdge = edges.find(
        (e) => (e.type === 'http' || e.type === 'discovery') && e.from === target.id,
      );
      if (httpEdge) {
        const svcAlias = declare(httpEdge.to);
        lines.push(`  ${targetAlias}->>${svcAlias}: ${httpEdge.type === 'discovery' ? 'discovery' : 'HTTP'} ${httpEdge.label ?? ''}`.trimEnd());
        steps.push({
          index: stepIdx++,
          actor: target.simpleName,
          action: `${httpEdge.type} call to ${httpEdge.to}`,
          componentId: target.id,
          details: httpEdge.label ?? `${httpEdge.from} -> ${httpEdge.to}`,
        });
        const remoteController = components.find(
          (c) => c.kind === 'controller' && c.microservice === httpEdge.to,
        );
        if (remoteController && !visitedComps.has(remoteController.id)) {
          const rcAlias = declare(remoteController.simpleName);
          lines.push(`  ${svcAlias}->>${rcAlias}: dispatches to handler`);
          steps.push({
            index: stepIdx++,
            actor: httpEdge.to,
            action: `dispatched to ${remoteController.simpleName}`,
            componentId: remoteController.id,
          });
          visitedComps.add(remoteController.id);
          cursor = remoteController.id;
          continue;
        }
      }
      cursor = target.id;
      continue;
    }

    if (target.kind === 'repository') {
      const entityEdge = edges.find(
        (e) => e.type === 'import' && e.from === target.id,
      );
      if (entityEdge) {
        const entity = componentById.get(entityEdge.to);
        if (entity?.kind === 'entity' && !visitedComps.has(entity.id)) {
          const eAlias = declare('DB');
          lines.push(`  ${targetAlias}->>${eAlias}: SELECT/INSERT ${entity.simpleName}`);
          steps.push({
            index: stepIdx++,
            actor: target.simpleName,
            action: `persists ${entity.simpleName}`,
            componentId: entity.id,
          });
          visitedComps.add(entity.id);
        }
      }
      break;
    }

    cursor = target.id;
  }

  return {
    mermaid: lines.join('\n'),
    narrative: FLOW_NARRATIVE_PLACEHOLDER,
    steps,
  };
}
