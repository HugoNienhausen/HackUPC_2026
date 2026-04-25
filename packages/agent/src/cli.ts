#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runIndex } from './index/runIndex.js';

const program = new Command();

program
  .name('devmap')
  .description('Generate an interactive feature dashboard from a polyglot microservices repo')
  .version('0.0.0');

program
  .command('feature <name>')
  .description('Build the feature.json artifact for <name>')
  .option('--no-llm', 'Skip LLM calls; emit deterministic placeholders')
  .option('--no-serve', 'Emit JSON only; do not open browser')
  .action((name: string) => {
    console.log(`devmap feature: not implemented (requested feature: "${name}")`);
  });

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
