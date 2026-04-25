import { EDGE_STYLES, type EdgeKind } from './edgeStyles';

const ORDER: EdgeKind[] = ['import', 'http', 'discovery', 'gateway-route'];

export function EdgeLegend() {
  return (
    <div className="rounded-md border bg-card/95 p-2 text-[11px] shadow-sm backdrop-blur-sm">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Edge types
      </div>
      <div className="flex flex-col gap-1">
        {ORDER.map((kind) => {
          const s = EDGE_STYLES[kind];
          return (
            <div key={kind} className="flex items-center gap-2">
              <svg width="44" height="8" className="overflow-visible">
                <line
                  x1="2"
                  y1="4"
                  x2="42"
                  y2="4"
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                  strokeDasharray={s.strokeDasharray}
                  strokeLinecap="round"
                />
              </svg>
              <span className="font-mono text-[10px] text-foreground">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
