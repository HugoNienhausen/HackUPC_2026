// Stable per-microservice palette. Used as left-border accent on graph nodes
// AND as the chip color in the header. Single source of truth so visual
// identity is consistent across the UI.

const PALETTE: Record<string, string> = {
  'api-gateway': '#ef4444', // red-500
  'visits-service': '#3b82f6', // blue-500
  'customers-service': '#10b981', // emerald-500
  'vets-service': '#f59e0b', // amber-500
  'genai-service': '#a855f7', // purple-500
  'config-server': '#64748b', // slate-500
  'discovery-server': '#14b8a6', // teal-500
  'admin-server': '#ec4899', // pink-500
};

const FALLBACK = '#6b7280'; // gray-500

export function microserviceColor(name: string): string {
  return PALETTE[name] ?? FALLBACK;
}
