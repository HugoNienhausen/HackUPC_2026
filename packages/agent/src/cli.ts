#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';

// Load .env from the workspace root before any other module reads process.env.
// pnpm -F changes cwd to packages/agent, so .env from this dir would miss the
// repo-root file; INIT_CWD holds the original invocation cwd.
const envBase = process.env.INIT_CWD ?? process.cwd();
dotenvConfig({ path: path.resolve(envBase, '.env'), quiet: true });

import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FeatureSchema, type Feature } from '@devmap/schema';
import { runIndex } from './index/runIndex.js';
import { orchestrate, orchestrateUseCase, UseCaseNotFoundError } from './orchestrator.js';
import { startServer } from './serve.js';
import { pickProgress } from './progress.js';
import { LlmClient } from './llm/client.js';
import { discoverUseCasesCached, type EndpointLike } from './llm/discoverUseCases.js';
import { buildComponents } from './views/components.js';
import { buildEndpoints, type GatewayRouteSpec } from './views/endpoints.js';
import { extractGatewayRoutesFromYaml } from './index/edges.js';
import type { Endpoint } from '@devmap/schema';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = '/Users/hugonienhausen/Desktop/spring-petclinic-microservices';

function workspaceRoot(): string {
  return process.env.INIT_CWD ?? process.cwd();
}

function demoCachePath(feature: string): string {
  // packages/agent/src -> ../../.. -> workspace root
  return path.resolve(HERE, '..', '..', '..', 'demo', 'cache', `${feature}.json`);
}

async function loadDemoCache(feature: string): Promise<Feature | null> {
  try {
    const text = await fs.readFile(demoCachePath(feature), 'utf8');
    const parsed = FeatureSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

const program = new Command();

program
  .name('devmap')
  .description('Generate an interactive feature dashboard from a polyglot microservices repo')
  .version('0.0.0');

program
  .command('feature <name>')
  .description('Build the feature.json artifact for <name>')
  .option('--repo <path>', 'path to the microservices repo', DEFAULT_REPO)
  .option('--depth <n>', 'BFS expansion depth', (v) => parseInt(v, 10), 2)
  .option('-o, --output <file>', 'output file (default: ./feature.json; "-" for stdout)')
  .option('--no-llm', 'Skip LLM calls; keep placeholder summaries')
  .option('--no-serve', 'Emit JSON only; do not boot the dashboard server')
  .option('--port-server <n>', 'Express port', (v) => parseInt(v, 10), 3000)
  .option('--port-web <n>', 'Vite port', (v) => parseInt(v, 10), 5173)
  .option('--no-open', "Don't auto-open the browser (server still runs)")
  .option('--refresh', 'Force re-call all LLM steps; bypass per-repo cache')
  .option('--airplane', 'Skip ALL pipelines + LLM; read demo/cache/<feature>.json directly')
  .action(
    async (
      name: string,
      opts: {
        repo: string;
        depth: number;
        output?: string;
        llm?: boolean;
        serve?: boolean;
        portServer: number;
        portWeb: number;
        open?: boolean;
        refresh?: boolean;
        airplane?: boolean;
      },
    ) => {
      const start = Date.now();
      const tty = Boolean(process.stderr.isTTY);
      const progress = pickProgress({ airplane: opts.airplane === true, tty });
      let artifact: Feature;
      if (opts.airplane) {
        const cached = await loadDemoCache(name);
        if (!cached) {
          process.stderr.write(
            `[devmap] --airplane: demo/cache/${name}.json missing or invalid. Run \`pnpm devmap feature ${name} --refresh\` first, scrub the rootPath, and commit it.\n`,
          );
          process.exit(2);
        }
        artifact = cached;
        process.stderr.write(
          `[devmap] airplane mode: loaded demo/cache/${name}.json (${artifact.components.length} components) in ${Date.now() - start}ms\n`,
        );
      } else {
        try {
          artifact = await orchestrateUseCase({
            useCaseId: name,
            repo: opts.repo,
            llm: opts.llm ?? false,
            refresh: opts.refresh ?? false,
            workspaceRoot: workspaceRoot(),
            progress,
          });
        } catch (err) {
          if (err instanceof UseCaseNotFoundError) {
            const list =
              err.available.length > 0
                ? '\n  - ' + err.available.join('\n  - ') + '\n'
                : '\n  (no use-cases discovered yet)\n';
            process.stderr.write(
              `[devmap] use-case "${err.useCaseId}" not found.\n` +
                `Run \`devmap discover --repo ${opts.repo}\` to see the available ids.\n` +
                `Currently known:${list}`,
            );
            process.exit(2);
          }
          throw err;
        }
        // satisfies the "always assigned" check below.
        if (!artifact!) {
          throw new Error('orchestrateUseCase returned without an artifact');
        }
      }

      const json = JSON.stringify(artifact, null, 2);
      const out = opts.output ?? 'feature.json';
      const baseCwd = workspaceRoot();
      if (out === '-') {
        process.stdout.write(json + '\n');
      } else {
        await fs.writeFile(path.resolve(baseCwd, out), json, 'utf8');
        const elapsed = Date.now() - start;
        const stamp = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`;
        if (!opts.airplane && tty) {
          progress.info(`✓ feature.json ready in ${stamp}`);
        } else {
          process.stderr.write(
            `feature.json: ${artifact.components.length} components, ${artifact.dependencies.edges.length} edges, ${artifact.endpoints.length} endpoints, ${artifact.persistence.entities.length} entities in ${elapsed}ms -> ${out}\n`,
          );
        }
      }

      if (opts.serve === false) return;

      const handles = await startServer({
        feature: artifact,
        repoRoot: opts.repo,
        serverPort: opts.portServer,
        webPort: opts.portWeb,
        openBrowser: opts.open ?? true,
      });
      if (!opts.airplane && tty) {
        progress.info(`→ Opening dashboard at ${handles.webUrl}`);
      }
      process.stderr.write(
        `dashboard: ${handles.webUrl}  (api: ${handles.apiUrl})\n` +
          `press Ctrl+C to stop.\n`,
      );
      const shutdown = async (): Promise<void> => {
        await handles.stop();
        process.exit(0);
      };
      process.on('SIGINT', () => {
        shutdown().catch(() => process.exit(1));
      });
      process.on('SIGTERM', () => {
        shutdown().catch(() => process.exit(1));
      });
    },
  );

async function loadGatewayRoutes(repoRoot: string): Promise<GatewayRouteSpec[]> {
  const ymlPath = path.join(
    repoRoot,
    'spring-petclinic-api-gateway',
    'src',
    'main',
    'resources',
    'application.yml',
  );
  try {
    const text = await fs.readFile(ymlPath, 'utf8');
    return extractGatewayRoutesFromYaml(text).map((r) => ({
      target: r.target,
      predicates: r.predicates,
    }));
  } catch {
    return [];
  }
}

function endpointToLike(e: Endpoint, controllerName: string): EndpointLike {
  return {
    method: e.method,
    path: e.path,
    handler: `${controllerName}.${e.handlerMethod}`,
    microservice: e.microservice,
    gatewayPath: e.gatewayPath ?? null,
  };
}

program
  .command('discover')
  .description('Enumerate the use-cases in a repo (Sonnet 4.6).')
  .option('--repo <path>', 'path to the microservices repo', DEFAULT_REPO)
  .option('--refresh', 'Force re-call; bypass cache')
  .option('--no-llm', "Skip LLM (returns empty list — discover requires Sonnet)")
  .option('--json', 'Emit machine-readable JSON instead of pretty rows')
  .action(
    async (opts: { repo: string; refresh?: boolean; llm?: boolean; json?: boolean }) => {
      const repo = path.resolve(opts.repo);
      const idx = await runIndex(repo);

      // Synthetic full-component set so buildEndpoints can iterate every
      // controller. seedFqns = every fqn so all classes appear; expandedFqns
      // is empty.
      const allFqns = new Set(idx.classes.map((c) => c.fqn));
      const allComponents = buildComponents({
        classes: idx.classes,
        seedFqns: allFqns,
        expandedFqns: new Set(),
      });
      const compById = new Map(allComponents.map((c) => [c.id, c]));
      const gatewayRoutes = await loadGatewayRoutes(repo);
      const endpoints = buildEndpoints({
        components: allComponents,
        classes: idx.classes,
        gatewayRoutes,
      });
      const endpointLikes: EndpointLike[] = endpoints.map((e) => {
        const ctrl = compById.get(e.componentId)?.simpleName ?? e.componentId;
        return endpointToLike(e, ctrl);
      });

      const llm = new LlmClient({ noLlm: opts.llm === false });
      const result = await discoverUseCasesCached({
        classes: idx.classes,
        microservices: idx.microservices.map((m) => ({ name: m })),
        endpoints: endpointLikes,
        edges: idx.edges,
        client: llm,
        workspaceRoot: workspaceRoot(),
        repoPath: repo,
        refresh: opts.refresh ?? false,
      });

      if (!result) {
        process.stderr.write(
          '[devmap] discover: no result. Live LLM is required (set ANTHROPIC_API_KEY) and avoid --no-llm.\n',
        );
        process.exit(2);
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        return;
      }

      const rows = result.useCases;
      if (rows.length === 0) {
        process.stderr.write('[devmap] discover: 0 use-cases returned.\n');
        return;
      }
      process.stdout.write(
        `\nFound ${rows.length} use-case${rows.length === 1 ? '' : 's'}:\n\n`,
      );
      const idWidth = Math.min(
        Math.max(...rows.map((r) => r.id.length), 'id'.length),
        40,
      );
      for (const u of rows) {
        const tag = u.complexity === 'cross-service' ? '×' : '·';
        process.stdout.write(
          `  ${tag} ${u.id.padEnd(idWidth)}  ${u.entryEndpoint}\n` +
            `      ${u.summary}\n` +
            `      [${u.entryController} @ ${u.entryMicroservice}]\n\n`,
        );
      }
      process.stdout.write(
        `Run \`devmap feature <id>\` to open the dashboard for any of these.\n`,
      );
    },
  );

program
  .command('index')
  .description('Walk a microservices repo and emit a static index.json')
  .requiredOption('--repo <path>', 'path to the repo root (e.g. spring-petclinic-microservices)')
  .option('-o, --output <file>', 'output file (default: ./index.json; "-" for stdout)')
  .action(async (opts: { repo: string; output?: string }) => {
    const result = await runIndex(opts.repo);
    const json = JSON.stringify(result, null, 2);
    const out = opts.output ?? 'index.json';
    if (out === '-') {
      process.stdout.write(json + '\n');
    } else {
      await fs.writeFile(path.resolve(out), json, 'utf8');
      process.stderr.write(
        `index: ${result.stats.classCount} classes, ${result.edges.length} edges, ${result.microservices.length} services in ${result.stats.durationMs}ms -> ${out}\n`,
      );
    }
  });

program.parseAsync(process.argv);
