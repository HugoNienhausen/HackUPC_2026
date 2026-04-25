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
import { runIndex } from './index/runIndex.js';
import { orchestrate } from './orchestrator.js';
import { startServer } from './serve.js';

const DEFAULT_REPO = '/Users/hugonienhausen/Desktop/spring-petclinic-microservices';

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
      },
    ) => {
      const start = Date.now();
      const artifact = await orchestrate({
        feature: name,
        repo: opts.repo,
        depth: opts.depth,
        llm: opts.llm ?? false,
        serve: opts.serve ?? false,
      });
      const json = JSON.stringify(artifact, null, 2);
      const out = opts.output ?? 'feature.json';
      const baseCwd = process.env.INIT_CWD ?? process.cwd();
      if (out === '-') {
        process.stdout.write(json + '\n');
      } else {
        await fs.writeFile(path.resolve(baseCwd, out), json, 'utf8');
        process.stderr.write(
          `feature.json: ${artifact.components.length} components, ${artifact.dependencies.edges.length} edges, ${artifact.endpoints.length} endpoints, ${artifact.persistence.entities.length} entities in ${Date.now() - start}ms -> ${out}\n`,
        );
      }

      if (opts.serve === false) return;

      const handles = await startServer({
        feature: artifact,
        repoRoot: opts.repo,
        serverPort: opts.portServer,
        webPort: opts.portWeb,
        openBrowser: opts.open ?? true,
      });
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
