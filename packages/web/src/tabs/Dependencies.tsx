import { GitGraph } from 'lucide-react';
import type { Feature } from '@devmap/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DependenciesProps {
  feature: Feature;
}

// Phase 4a.2 stub — the React Flow graph + Sheet land in 4a.3.
export function DependenciesTab({ feature }: DependenciesProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2">
              <GitGraph className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Dependencies — wiring next</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Loaded {feature.components.length} components and{' '}
            {feature.dependencies.edges.length} edges across{' '}
            {feature.repository.microservices.length} microservices.
          </p>
          <p className="text-xs text-muted-foreground">
            React Flow + dagre layout + filter dropdown + click-to-Sheet land in Phase 4a.3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
