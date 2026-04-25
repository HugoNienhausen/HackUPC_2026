import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FeatureSchema } from './feature.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: pnpm validate-schema <path/to/feature.json>');
  process.exit(2);
}

const cwd = process.env.INIT_CWD ?? process.cwd();
const data = JSON.parse(readFileSync(resolve(cwd, file), 'utf8'));
const result = FeatureSchema.safeParse(data);

if (result.success) {
  console.log(`OK: ${file} validates against FeatureSchema`);
  process.exit(0);
} else {
  console.error(`FAIL: ${file} does not validate`);
  for (const issue of result.error.errors.slice(0, 20)) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}
