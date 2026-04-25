import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Component, Feature } from '@devmap/schema';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ServiceNode } from './ServiceNode';
import { EdgeLegend } from './EdgeLegend';
import { ComponentSheet } from './ComponentSheet';
import {
  buildDependenciesGraph,
  type ServiceNodeData,
} from './dependenciesGraph';
import { styleForEdge, type EdgeKind } from './edgeStyles';

const NODE_TYPES = { serviceNode: ServiceNode };

const ALL = '__all__';

interface Props {
  feature: Feature;
}

function styleEdges(edges: Edge[]): Edge[] {
  return edges.map((e) => {
    const kind = (e.data as { edgeType?: EdgeKind } | undefined)?.edgeType;
    const s = styleForEdge(kind);
    return {
      ...e,
      style: {
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        strokeDasharray: s.strokeDasharray,
      },
      animated: kind === 'http',
      type: 'default',
    };
  });
}

export function DependenciesTab({ feature }: Props) {
  const built = useMemo(() => buildDependenciesGraph(feature), [feature]);
  const allMicroservices = useMemo(() => {
    const set = new Set<string>();
    for (const n of built.nodes) {
      const data = n.data as ServiceNodeData;
      if (data.component.microservice) set.add(data.component.microservice);
    }
    return [...set].sort();
  }, [built.nodes]);

  const [filter, setFilter] = useState<string>(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visibleNodes: Node[] = useMemo(() => {
    if (filter === ALL) return built.nodes;
    return built.nodes.filter(
      (n) => (n.data as ServiceNodeData).component.microservice === filter,
    );
  }, [built.nodes, filter]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () =>
      styleEdges(
        built.edges.filter(
          (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
        ),
      ),
    [built.edges, visibleNodeIds],
  );

  useEffect(() => {
    if (selectedId && !visibleNodeIds.has(selectedId)) setSelectedId(null);
  }, [visibleNodeIds, selectedId]);

  const selectedComponent: Component | null = useMemo(() => {
    if (!selectedId) return null;
    const n = built.nodes.find((x) => x.id === selectedId);
    return n ? (n.data as ServiceNodeData).component : null;
  }, [built.nodes, selectedId]);

  const onNodeClick: NodeMouseHandler = (_, n) => setSelectedId(n.id);

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-4 top-4 z-10">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[220px] bg-card">
            <SelectValue placeholder="Filter by microservice" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All microservices</SelectItem>
            {allMicroservices.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="absolute left-4 top-4 z-10">
        <EdgeLegend />
      </div>

      <ReactFlowProvider>
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            nodeColor={() => '#94a3b8'}
            maskColor="rgba(0,0,0,0.05)"
          />
        </ReactFlow>
      </ReactFlowProvider>

      <ComponentSheet
        component={selectedComponent}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}
