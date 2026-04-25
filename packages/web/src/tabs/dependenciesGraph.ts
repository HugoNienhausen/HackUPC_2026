import dagre from 'dagre';
import { Position, type Edge, type Node } from '@xyflow/react';
import type { Component, Feature } from '@devmap/schema';

export interface ServiceNodeData extends Record<string, unknown> {
  component: Component;
}

const NODE_MIN = { width: 100, height: 40 };
const NODE_MAX = { width: 200, height: 80 };

export function nodeSizeForLoc(loc: number | undefined): { width: number; height: number } {
  const n = loc ?? 0;
  const t = Math.max(0, Math.min(1, (n - 20) / 200));
  return {
    width: Math.round(NODE_MIN.width + (NODE_MAX.width - NODE_MIN.width) * t),
    height: Math.round(NODE_MIN.height + (NODE_MAX.height - NODE_MIN.height) * t),
  };
}

const COMPONENT_KIND_FALLBACK = new Set(['controller', 'service', 'repository', 'entity', 'client', 'config', 'dto', 'mapper', 'exception', 'application', 'other']);

interface DepsGraph {
  nodes: Node<ServiceNodeData>[];
  edges: Edge[];
}

export function buildDependenciesGraph(feature: Feature): DepsGraph {
  const componentByFqn = new Map(feature.components.map((c) => [c.fqn, c]));
  const componentById = new Map(feature.components.map((c) => [c.id, c]));
  const nodes: Node<ServiceNodeData>[] = feature.components.map((c) => {
    const size = nodeSizeForLoc(c.loc);
    return {
      id: c.id,
      type: 'serviceNode',
      data: { component: c },
      position: { x: 0, y: 0 },
      width: size.width,
      height: size.height,
    };
  });

  const edges: Edge[] = [];
  for (const e of feature.dependencies.edges) {
    const fromIsComponent = componentById.has(e.from) || componentByFqn.has(e.from);
    const toIsComponent = componentById.has(e.to) || componentByFqn.has(e.to);
    if (e.type === 'import') {
      if (!fromIsComponent || !toIsComponent) continue;
      edges.push({
        id: `e:${e.from}->${e.to}:import`,
        source: e.from,
        target: e.to,
        type: 'default',
        data: { edgeType: 'import' },
      });
      continue;
    }
    edges.push({
      id: `e:${e.from}->${e.to}:${e.type}:${e.sourceLine ?? ''}`,
      source: e.from,
      target: e.to,
      type: 'default',
      data: { edgeType: e.type, label: e.label, sourceFile: e.sourceFile, sourceLine: e.sourceLine },
      label: e.type === 'gateway-route' ? e.label : undefined,
    });
  }

  // Filter edges to only those whose endpoints are present as nodes (gateway-route
  // and http edges may target service-name strings which aren't class nodes; keep
  // them only if both endpoints actually exist).
  const nodeIds = new Set(nodes.map((n) => n.id));
  const knownEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Synthetic service nodes: if a cross-service edge points at a service name
  // (not a class id), add a placeholder pill node so the relationship is visible.
  const seenSyntheticIds = new Set<string>();
  const syntheticNodes: Node<ServiceNodeData>[] = [];
  for (const e of edges) {
    if (knownEdges.includes(e)) continue;
    for (const endpoint of [e.source, e.target]) {
      if (nodeIds.has(endpoint)) continue;
      if (seenSyntheticIds.has(endpoint)) continue;
      const fakeComponent: Component = {
        id: endpoint,
        fqn: endpoint,
        simpleName: endpoint,
        kind: 'other',
        microservice: endpoint,
        filePath: '(microservice cluster)',
        annotations: [],
        publicMethods: [],
        summary: 'Cross-service target — not in component scope.',
        core: false,
        loc: 0,
      };
      syntheticNodes.push({
        id: endpoint,
        type: 'serviceNode',
        data: { component: fakeComponent },
        position: { x: 0, y: 0 },
        width: NODE_MIN.width,
        height: NODE_MIN.height,
      });
      seenSyntheticIds.add(endpoint);
    }
  }

  const allNodes = [...nodes, ...syntheticNodes];
  const allNodeIds = new Set(allNodes.map((n) => n.id));
  const allEdges = edges.filter((e) => allNodeIds.has(e.source) && allNodeIds.has(e.target));

  return layoutLR(allNodes, allEdges);
}

function layoutLR(nodes: Node<ServiceNodeData>[], edges: Edge[]): DepsGraph {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: n.width ?? 140, height: n.height ?? 60 });
  }
  for (const e of edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  const positioned: Node<ServiceNodeData>[] = nodes.map((n) => {
    const layoutNode = g.node(n.id);
    return {
      ...n,
      position: {
        x: layoutNode.x - (n.width ?? 140) / 2,
        y: layoutNode.y - (n.height ?? 60) / 2,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
  return { nodes: positioned, edges };
}

export const _unused = COMPONENT_KIND_FALLBACK;
