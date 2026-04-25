import { useEffect, useId, useState } from 'react';
import { renderMermaid } from '@/lib/mermaidClient';

interface MermaidViewProps {
  source: string;
  /** Rendered HTML when parse/render fails. */
  fallback?: React.ReactNode;
  className?: string;
}

export function MermaidView({ source, fallback, className }: MermaidViewProps) {
  const baseId = useId().replace(/[:]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setErrored(false);
    renderMermaid(`mermaid-${baseId}`, source).then((res) => {
      if (cancelled) return;
      if (res) setSvg(res.svg);
      else setErrored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [source, baseId]);

  if (errored) {
    return <>{fallback ?? null}</>;
  }
  if (!svg) {
    return (
      <div className="flex min-h-[120px] items-center justify-center text-xs text-muted-foreground">
        Rendering diagram…
      </div>
    );
  }
  return (
    <div
      className={`overflow-auto ${className ?? ''}`}
      // mermaid emits trusted, sanitized SVG (securityLevel: 'strict').
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
