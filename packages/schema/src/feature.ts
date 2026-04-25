import { z } from 'zod';

// Phase 0 skeleton. The hand-written ../feature.schema.json is the structural
// source of truth until Phase 3 expands this zod to be 1:1 with it. Until then,
// `pnpm -F @devmap/schema build` emits feature.schema.generated.json so the
// hand-written file is never overwritten.

export const FeatureSchema = z.object({
  devmapVersion: z.literal('1.0.0'),
  generatedAt: z.string(),
  feature: z.object({
    name: z.string(),
    displayName: z.string(),
    summary: z.string(),
  }),
  repository: z.object({
    name: z.string(),
    rootPath: z.string(),
    language: z.enum(['java', 'kotlin']),
    framework: z.string(),
    microservices: z.array(z.unknown()),
  }),
  components: z.array(z.unknown()),
  flow: z.unknown(),
  dependencies: z.unknown(),
  persistence: z.unknown(),
  endpoints: z.array(z.unknown()),
  events: z.unknown(),
  ownership: z.unknown(),
});

export type Feature = z.infer<typeof FeatureSchema>;
