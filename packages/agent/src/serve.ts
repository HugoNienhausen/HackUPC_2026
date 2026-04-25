import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import open from 'open';
import type { Feature } from '@devmap/schema';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export interface ServeOptions {
  feature: Feature;
  repoRoot: string;
  serverPort?: number;
  webPort?: number;
  openBrowser?: boolean;
  startVite?: boolean;
}

export interface ServeHandles {
  serverPort: number;
  webPort: number;
  webUrl: string;
  apiUrl: string;
  stop: () => Promise<void>;
}

export function buildApp(feature: Feature, repoRoot: string): Express {
  const app = express();

  app.get('/feature.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(feature);
  });

  app.get('/repo/*splat', (req, res) => {
    const rel = (req.params as { splat?: string[] | string }).splat;
    const relPath = Array.isArray(rel) ? rel.join('/') : rel ?? '';
    if (!relPath) {
      res.status(400).type('text/plain').send('missing path');
      return;
    }
    if (relPath.includes('..')) {
      res.status(400).type('text/plain').send('invalid path');
      return;
    }
    const full = path.resolve(repoRoot, relPath);
    if (!full.startsWith(path.resolve(repoRoot))) {
      res.status(400).type('text/plain').send('escape');
      return;
    }
    res.sendFile(full, (err) => {
      if (err && !res.headersSent) res.status(404).type('text/plain').send('not found');
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, components: feature.components.length });
  });

  return app;
}

export async function startServer(opts: ServeOptions): Promise<ServeHandles> {
  const serverPort = opts.serverPort ?? 3000;
  const webPort = opts.webPort ?? 5173;
  const startVite = opts.startVite ?? true;
  const openBrowser = opts.openBrowser ?? true;

  const app = buildApp(opts.feature, opts.repoRoot);
  const server = await new Promise<ReturnType<Express['listen']>>((resolve) => {
    const s = app.listen(serverPort, () => resolve(s));
  });

  let viteChild: ChildProcess | null = null;
  if (startVite) {
    const webDir = path.resolve(HERE, '..', '..', 'web');
    viteChild = spawn('pnpm', ['exec', 'vite', '--port', String(webPort), '--strictPort'], {
      cwd: webDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      // DEVMAP_API_PORT lets vite.config.ts target the matching Express
      // process — required when multiple `devmap feature` instances run
      // simultaneously on different --port-server values.
      env: { ...process.env, FORCE_COLOR: '1', DEVMAP_API_PORT: String(serverPort) },
    });
    await waitForUrl(`http://localhost:${webPort}/`, 8000);
  }

  const webUrl = `http://localhost:${webPort}/`;
  const apiUrl = `http://localhost:${serverPort}/feature.json`;

  if (openBrowser && startVite) {
    await open(webUrl);
  }

  return {
    serverPort,
    webPort,
    webUrl,
    apiUrl,
    stop: () =>
      new Promise<void>((resolve) => {
        if (viteChild) viteChild.kill();
        server.close(() => resolve());
      }),
  };
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // not yet up
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${url} after ${timeoutMs} ms`);
}
