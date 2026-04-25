#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runIndex } from './index/runIndex.js';
import { lexicalMatch } from './feature/lexicalMatch.js';
import { expand } from './feature/expand.js';

const DEFAULT_REPO = '/Users/hugonienhausen/Desktop/spring-petclinic-microservices';

const program = new Command();

program
  .name('devmap')
  .description('Generate an interactive feature dashboard from a polyglot microservices repo')
  .version('0.0.0');

program
  .command('feature <name>')
  .description('Resolve a feature name to a candidate class list (lexical + 1-hop expansion)')
  .option('--repo <path>', 'path to the microservices repo', DEFAULT_REPO)
  .option('--depth <n>', 'BFS expansion depth', (v) => parseInt(v, 10), 2)
  .option('--no-llm', 'Skip LLM calls (placeholder for Phase 3+)')
  .option('--no-serve', 'Emit JSON only; do not open browser (placeholder for Phase 4+)')
  .action(async (name: string, opts: { repo: string; depth: number }) => {
    const idx = await runIndex(opts.repo);
    const matches = lexicalMatch(idx.classes, name);
    const result = expand(
      matches.map((m) => m.fqn),
      idx.classes,
      idx.edges,
      opts.depth,
    );
    const scoreByFqn = new Map(matches.map((m) => [m.fqn, m.score]));
    const total = result.seed.size + result.expanded.size;
    process.stdout.write(
      `feature: ${name}  —  ${result.seed.size} seed + ${result.expanded.size} expanded (depth=${opts.depth}) = ${total} candidates\n`,
    );
    const services = [...result.byService.keys()].sort();
    for (const svc of services) {
      const fqns = result.byService.get(svc) ?? [];
      process.stdout.write(`\n  ${svc}  (${fqns.length}):\n`);
      for (const fqn of fqns) {
        const score = scoreByFqn.get(fqn);
        const label = score !== undefined ? `seed, score=${score}` : 'expanded';
        process.stdout.write(`    ${fqn.padEnd(78)}  [${label}]\n`);
      }
    }
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
