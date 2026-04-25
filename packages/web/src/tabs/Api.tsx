import { Network } from 'lucide-react';
import type { Feature } from '@devmap/schema';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { microserviceColor } from '@/lib/microserviceColors';

interface Props {
  feature: Feature;
}

const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800',
  POST: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-800',
  PUT: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
  PATCH: 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950 dark:text-purple-100 dark:border-purple-800',
  DELETE: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800',
};

function MethodBadge({ method }: { method: string }) {
  const cls = METHOD_STYLES[method] ?? 'border';
  return (
    <span
      className={`inline-flex w-[5ch] items-center justify-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${cls}`}
    >
      {method}
    </span>
  );
}

export function ApiTab({ feature }: Props) {
  const endpoints = feature.endpoints;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2">
            <Network className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">API</h2>
            <p className="text-sm text-muted-foreground">
              REST endpoints exposed by this feature.
            </p>
          </div>
        </header>

        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[8ch]">Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Gateway path</TableHead>
                <TableHead className="w-[18ch]">Handler</TableHead>
                <TableHead className="w-[18ch]">Service</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No endpoints in scope for this feature.
                  </TableCell>
                </TableRow>
              )}
              {endpoints.map((e, i) => (
                <TableRow key={`${e.method}:${e.path}:${i}`}>
                  <TableCell>
                    <MethodBadge method={e.method} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.path}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {e.gatewayPath ?? <span className="text-muted-foreground/50">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.handlerMethod ?? <span className="text-muted-foreground/50">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-l-4 font-mono text-[10px]"
                      style={{ borderLeftColor: microserviceColor(e.microservice) }}
                    >
                      {e.microservice}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Gateway path is the public URL through <code className="font-mono">api-gateway</code>.
          A dash (—) means the endpoint is on the gateway itself or has no proxied route.
        </p>
      </div>
    </div>
  );
}
