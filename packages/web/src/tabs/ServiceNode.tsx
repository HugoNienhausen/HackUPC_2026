import { Handle, Position, type NodeProps } from '@xyflow/react';
import { microserviceColor } from '@/lib/microserviceColors';
import type { ServiceNodeData } from './dependenciesGraph';

export function ServiceNode({ data, selected }: NodeProps & { data: ServiceNodeData }) {
  const c = data.component;
  const color = microserviceColor(c.microservice);
  return (
    <div
      className={`flex h-full w-full flex-col justify-center rounded-md border bg-card px-3 py-2 text-card-foreground shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-muted-foreground/40" />
      <div className="truncate text-sm font-semibold leading-tight">{c.simpleName}</div>
      {data.synthetic ? (
        <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          microservice
        </div>
      ) : (
        <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {c.kind} · {c.microservice}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-muted-foreground/40" />
    </div>
  );
}
