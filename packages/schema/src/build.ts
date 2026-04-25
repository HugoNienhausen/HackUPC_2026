import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { FeatureSchema } from './feature';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'feature.schema.generated.json');

const json = zodToJsonSchema(FeatureSchema, {
  name: 'DevMapFeatureArtifact',
  $refStrategy: 'none',
});

writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
console.log(`wrote ${out}`);
