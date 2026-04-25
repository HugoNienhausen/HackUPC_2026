import { useState } from 'react';
import { ExternalLink, Clipboard, Check } from 'lucide-react';
import type { Component } from '@devmap/schema';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { microserviceColor } from '@/lib/microserviceColors';

interface Props {
  component: Component | null;
  rootPath?: string;
  onOpenChange: (open: boolean) => void;
}

function buildAbsolutePath(rootPath: string | undefined, relPath: string): string {
  if (!rootPath) return relPath;
  const trimmedRoot = rootPath.replace(/\/+$/, '');
  const trimmedRel = relPath.replace(/^\/+/, '');
  return `${trimmedRoot}/${trimmedRel}`;
}

/**
 * The pre-warmed demo cache scrubs rootPath to a placeholder like "<repo>"
 * so it doesn't leak the dev's home directory when committed. When that
 * placeholder is detected we render the editor buttons as disabled with
 * a tooltip rather than emitting broken vscode:// links.
 */
function isAirplaneRootPath(rootPath: string | undefined): boolean {
  if (!rootPath) return false;
  return rootPath.startsWith('<') || !rootPath.startsWith('/');
}

function buildEditorUrl(scheme: 'vscode' | 'cursor', absPath: string, line?: number): string {
  const lineSuffix = line && line > 0 ? `:${line}` : '';
  return `${scheme}://file${absPath.startsWith('/') ? absPath : `/${absPath}`}${lineSuffix}`;
}

function OpenInEditor({
  absPath,
  relPath,
  line,
  airplane,
}: {
  absPath: string;
  relPath: string;
  line?: number;
  airplane: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const targetForCopy = airplane ? relPath : absPath;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetForCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };
  const vsUrl = buildEditorUrl('vscode', absPath, line);
  const cursorUrl = buildEditorUrl('cursor', absPath, line);
  const disabledTooltip = 'Disabled in airplane mode (demo cache has no absolute path)';
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {airplane ? (
          <>
            <Button size="sm" disabled className="gap-1.5" title={disabledTooltip}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open in VS Code
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled
              className="gap-1.5"
              title={disabledTooltip}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Cursor
            </Button>
          </>
        ) : (
          <>
            <Button asChild size="sm" className="gap-1.5">
              <a href={vsUrl}>
                <ExternalLink className="h-3.5 w-3.5" />
                Open in VS Code
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={cursorUrl}>
                <ExternalLink className="h-3.5 w-3.5" />
                Cursor
              </a>
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={onCopy}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Clipboard className="h-3.5 w-3.5" />
              Copy path
            </>
          )}
        </Button>
      </div>
      <code className="block break-all rounded bg-muted/50 px-2 py-1 font-mono text-[10px] text-muted-foreground">
        {relPath}
        {line && line > 0 ? `:${line}` : ''}
      </code>
      {airplane && (
        <p className="text-[10px] text-muted-foreground">{disabledTooltip}</p>
      )}
    </div>
  );
}

export function ComponentSheet({ component, rootPath, onOpenChange }: Props) {
  const open = component !== null;
  const absPath = component ? buildAbsolutePath(rootPath, component.filePath) : '';
  const line = component?.lineStart;
  const airplane = isAirplaneRootPath(rootPath);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px]">
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

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Source
                </h3>
                <OpenInEditor
                  absPath={absPath}
                  relPath={component.filePath}
                  line={line}
                  airplane={airplane}
                />
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
