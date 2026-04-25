import { useMemo, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { Component, Feature } from '@devmap/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { microserviceColor } from '@/lib/microserviceColors';
import { ComponentSheet } from './ComponentSheet';

interface Props {
  feature: Feature;
}

function ComponentCard({ c, onClick }: { c: Component; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col gap-2 rounded-md border bg-card p-3 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
      style={{
        borderLeft: `${c.core ? '4px' : '2px'} solid ${microserviceColor(c.microservice)}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="truncate font-mono text-sm font-semibold">{c.simpleName}</h4>
        {c.core && <Badge className="shrink-0 text-[10px]">core</Badge>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {c.kind}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {c.microservice}
        </Badge>
      </div>
      {c.summary && (
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {c.summary}
        </p>
      )}
      <div className="mt-auto truncate font-mono text-[10px] text-muted-foreground/70">
        {c.filePath}
      </div>
    </button>
  );
}

export function ComponentsTab({ feature }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...feature.components].sort((a, b) => {
      if (a.core !== b.core) return a.core ? -1 : 1;
      const svc = a.microservice.localeCompare(b.microservice);
      if (svc !== 0) return svc;
      return a.simpleName.localeCompare(b.simpleName);
    });
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.simpleName.toLowerCase().includes(q) ||
        c.fqn.toLowerCase().includes(q) ||
        c.kind.toLowerCase().includes(q) ||
        c.microservice.toLowerCase().includes(q),
    );
  }, [feature.components, query]);

  const selected = useMemo(
    () => filtered.find((c) => c.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  const coreCount = feature.components.filter((c) => c.core).length;
  const peripheryCount = feature.components.length - coreCount;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2">
              <LayoutGrid className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Components</h2>
              <p className="text-sm text-muted-foreground">
                Detailed inventory of every class involved.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <Badge className="mr-1.5">{coreCount}</Badge>
              core
            </span>
            <span>
              <Badge variant="outline" className="mr-1.5">
                {peripheryCount}
              </Badge>
              periphery
            </span>
          </div>
        </header>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, FQN, kind, or microservice…"
          className="max-w-md"
        />

        {filtered.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No matches</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              No components match <code className="font-mono">{query}</code>.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((c) => (
              <ComponentCard key={c.id} c={c} onClick={() => setSelectedId(c.id)} />
            ))}
          </div>
        )}
      </div>

      <ComponentSheet
        component={selected}
        rootPath={feature.repository.rootPath}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}
