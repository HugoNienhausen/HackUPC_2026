import mermaid from 'mermaid';

let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
    fontFamily: 'inherit',
  });
  initialized = true;
}

/**
 * Render a Mermaid source string to SVG markup. Returns null on parse/render
 * failure so callers can fall back to a non-diagram representation.
 */
export async function renderMermaid(
  id: string,
  source: string,
): Promise<{ svg: string } | null> {
  ensureInit();
  try {
    await mermaid.parse(source);
  } catch {
    return null;
  }
  try {
    const result = await mermaid.render(id, source);
    return { svg: result.svg };
  } catch {
    return null;
  }
}
