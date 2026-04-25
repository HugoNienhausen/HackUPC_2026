import type { Component } from '@devmap/schema';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { microserviceColor } from '@/lib/microserviceColors';

interface Props {
  component: Component | null;
  onOpenChange: (open: boolean) => void;
}

export function ComponentSheet({ component, onOpenChange }: Props) {
  const open = component !== null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[460px] sm:max-w-[460px]">
        {component && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: microserviceColor(component.microservice) }}
                />
                <SheetTitle className="font-mono">{component.simpleName}</SheetTitle>
              </div>
              <SheetDescription className="font-mono text-[11px] break-all">
                {component.fqn}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{component.kind}</Badge>
                <Badge variant="outline">{component.microservice}</Badge>
                {component.core ? (
                  <Badge>core</Badge>
                ) : (
                  <Badge variant="outline">periphery</Badge>
                )}
              </div>

              {component.summary && (
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Summary
                  </h3>
                  <p className="text-sm leading-relaxed">{component.summary}</p>
                </section>
              )}

              {component.annotations.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Annotations
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {component.annotations.map((a) => (
                      <Badge key={a} variant="outline" className="font-mono text-[10px]">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {component.publicMethods && component.publicMethods.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Public methods ({component.publicMethods.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {component.publicMethods.map((m, i) => {
                      const verb = (m.annotations ?? []).find((a) =>
                        /Mapping/.test(a),
                      );
                      return (
                        <li key={i} className="rounded-md border bg-muted/30 p-2">
                          <div className="font-mono text-[12px] font-medium">{m.signature}</div>
                          {verb && (
                            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                              {verb}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section className="text-[10px] text-muted-foreground">
                <span className="font-mono">{component.filePath}</span>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
