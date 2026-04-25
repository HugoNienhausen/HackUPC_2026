// Visual encoding rule (Phase 4a):
//   COLOR signals "crosses service boundary"  (slate = intra-service,
//                                                indigo = cross-service)
//   LINE STYLE signals mechanism within cross-service
//                                                solid = direct HTTP call
//                                                dashed = dynamic discovery
//                                                dotted = gateway routing
//
// Single source of truth — node code, edge code, and legend all read from
// here so they can never drift.

export type EdgeKind = 'import' | 'http' | 'discovery' | 'gateway-route';

interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  label: string;
}

export const EDGE_STYLES: Record<EdgeKind, EdgeStyle> = {
  import: { stroke: '#94a3b8', strokeWidth: 1, label: 'import' },
  http: { stroke: '#6366f1', strokeWidth: 2.5, label: 'http' },
  discovery: { stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '6 4', label: 'discovery' },
  'gateway-route': { stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '2 4', label: 'gateway-route' },
};

export function styleForEdge(kind: EdgeKind | undefined): EdgeStyle {
  return EDGE_STYLES[kind ?? 'import'] ?? EDGE_STYLES.import;
}
