import { Database, AlertTriangle, KeyRound } from 'lucide-react';
import type { Feature } from '@devmap/schema';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MermaidView } from '@/components/MermaidView';

interface Props {
  feature: Feature;
}

interface CrossServiceFk {
  entity: string;
  field: string;
  target: string;
  joinColumn: string;
}

function collectCrossServiceFks(feature: Feature): CrossServiceFk[] {
  const out: CrossServiceFk[] = [];
  for (const e of feature.persistence.entities) {
    for (const f of e.fields) {
      if (f.relation?.kind === 'ForeignKeyByValue' && f.relation.target) {
        out.push({
          entity: e.simpleName,
          field: f.name,
          target: f.relation.target,
          joinColumn: f.relation.joinColumn ?? f.column ?? f.name,
        });
      }
    }
  }
  return out;
}

function MermaidFallback() {
  return (
    <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <CardTitle className="text-base">ER diagram failed to render</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Falling back to the operations table below.
      </CardContent>
    </Card>
  );
}

function FkCallouts({ fks }: { fks: CrossServiceFk[] }) {
  if (fks.length === 0) return null;
  return (
    <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          <CardTitle className="text-base">Cross-service references</CardTitle>
        </div>
        <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
          Foreign keys held by value (denormalized) — the source-of-truth entity
          lives in another microservice. JPA enforces nothing here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {fks.map((fk) => (
            <li
              key={`${fk.entity}.${fk.field}`}
              className="rounded-md border border-amber-300/60 bg-white/60 p-3 dark:bg-amber-950/40"
            >
              <span className="font-mono">
                {fk.entity}.{fk.field}
              </span>{' '}
              references{' '}
              <span className="font-mono font-semibold">{fk.target}</span> —
              denormalized cross-service foreign key, no JPA relationship. Join
              column: <code className="font-mono">{fk.joinColumn}</code>.
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function PersistenceTab({ feature }: Props) {
  const { mermaidER, entities, operations } = feature.persistence;
  const fks = collectCrossServiceFks(feature);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2">
            <Database className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Persistence</h2>
            <p className="text-sm text-muted-foreground">
              ER diagram of feature entities and their relationships.
            </p>
          </div>
        </header>

        <FkCallouts fks={fks} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Entities ({entities.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MermaidView
              source={mermaidER}
              fallback={<MermaidFallback />}
              className="rounded-md border bg-white p-4"
            />
          </CardContent>
        </Card>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Inferred SQL operations
            </h3>
            <Badge variant="outline">{operations.length} ops</Badge>
          </div>
          <div className="overflow-hidden rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[12ch]">Entity</TableHead>
                  <TableHead className="w-[28ch]">Method</TableHead>
                  <TableHead>Inferred SQL</TableHead>
                  <TableHead className="w-[8ch] text-right">Custom?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.map((op, i) => (
                  <TableRow key={`${op.entity}:${op.method}:${i}`}>
                    <TableCell className="font-mono text-xs">{op.entity}</TableCell>
                    <TableCell className="font-mono text-xs">{op.method}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {op.inferredSql}
                    </TableCell>
                    <TableCell className="text-right">
                      {op.custom ? (
                        <Badge>Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
