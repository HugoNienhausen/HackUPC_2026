import { Workflow, AlertTriangle } from 'lucide-react';
import type { Feature } from '@devmap/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MermaidView } from '@/components/MermaidView';

interface Props {
  feature: Feature;
}

function NarrativeBlock({ narrative }: { narrative: string }) {
  if (!narrative.trim()) return null;
  return (
    <blockquote className="border-l-4 border-primary/30 bg-muted/30 px-4 py-3 text-sm italic leading-relaxed text-muted-foreground">
      {narrative}
    </blockquote>
  );
}

function MermaidFallback() {
  return (
    <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <CardTitle className="text-base">Sequence diagram failed to render</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Falling back to the step list below. The mermaid source is preserved in
        the artifact and will be regenerated on the next run.
      </CardContent>
    </Card>
  );
}

function StepCard({ index, actor, action, componentId, details }: {
  index: number;
  actor: string;
  action: string;
  componentId: string;
  details?: string;
}) {
  return (
    <li className="flex gap-3 rounded-md border bg-card p-3 shadow-sm">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {index}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold">{actor}</span>
          <span className="text-xs text-muted-foreground">{action}</span>
        </div>
        {details && (
          <div className="text-[11px] text-muted-foreground">{details}</div>
        )}
        <div className="font-mono text-[10px] text-muted-foreground/70">{componentId}</div>
      </div>
    </li>
  );
}

export function FlowTab({ feature }: Props) {
  const { mermaid: mermaidSrc, narrative, steps } = feature.flow;
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2">
            <Workflow className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Request flow</h2>
            <p className="text-sm text-muted-foreground">
              Sequence diagram of the request path through services and into the database.
            </p>
          </div>
        </header>

        <NarrativeBlock narrative={narrative} />

        <Card>
          <CardContent className="pt-6">
            <MermaidView
              source={mermaidSrc}
              fallback={<MermaidFallback />}
              className="rounded-md border bg-white p-4"
            />
          </CardContent>
        </Card>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Steps
            </h3>
            <Badge variant="outline">{steps.length} steps</Badge>
          </div>
          <ol className="space-y-2">
            {steps.map((s) => (
              <StepCard
                key={`${s.index}:${s.componentId}`}
                index={s.index}
                actor={s.actor}
                action={s.action}
                componentId={s.componentId}
                details={s.details}
              />
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
