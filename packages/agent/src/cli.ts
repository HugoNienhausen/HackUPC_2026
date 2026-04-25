#!/usr/bin/env node
import { Command } from 'commander';

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

program.parseAsync(process.argv);
