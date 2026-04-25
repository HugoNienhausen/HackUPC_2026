import { z } from 'zod';

// Source of truth: ../feature.schema.json (hand-written contract).
// `pnpm -F @devmap/schema build` regenerates feature.schema.generated.json
// from this zod; that artifact should be SEMANTICALLY equivalent to the
// hand-written one (key ordering, $defs, additionalProperties presence may
// differ).

export const KindSchema = z.enum([
  'controller',
  'service',
  'repository',
  'entity',
  'client',
  'config',
  'dto',
  'exception',
  'application',
  'mapper',
  'other',
]);
export type Kind = z.infer<typeof KindSchema>;

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

export const EdgeTypeSchema = z.enum(['import', 'http', 'gateway-route', 'discovery']);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

export const RelationKindSchema = z.enum([
  'OneToMany',
  'ManyToOne',
  'OneToOne',
  'ManyToMany',
  'ForeignKeyByValue',
]);

export const PublicMethodSchema = z.object({
  name: z.string(),
  signature: z.string(),
  annotations: z.array(z.string()).optional(),
  lineStart: z.number().int().optional(),
});

export const ComponentSchema = z.object({
  id: z.string(),
  fqn: z.string(),
  simpleName: z.string(),
  kind: KindSchema,
  microservice: z.string(),
  filePath: z.string(),
  lineStart: z.number().int().optional(),
  loc: z.number().int().optional(),
  annotations: z.array(z.string()),
  publicMethods: z.array(PublicMethodSchema).optional(),
  summary: z.string().optional(),
  core: z.boolean(),
});
export type Component = z.infer<typeof ComponentSchema>;

export const FlowStepSchema = z.object({
  index: z.number().int(),
  actor: z.string(),
  action: z.string(),
  componentId: z.string(),
  details: z.string().optional(),
});

export const FlowSchema = z.object({
  mermaid: z.string(),
  narrative: z.string(),
  steps: z.array(FlowStepSchema),
});

export const DependencyNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  microservice: z.string(),
  kind: z.string(),
  loc: z.number().int(),
});

export const DependencyEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: EdgeTypeSchema,
  label: z.string().optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().int().optional(),
});

export const DependenciesSchema = z.object({
  nodes: z.array(DependencyNodeSchema),
  edges: z.array(DependencyEdgeSchema),
});

export const EntityFieldRelationSchema = z.object({
  kind: RelationKindSchema.optional(),
  target: z.string().optional(),
  joinColumn: z.string().optional(),
  fetch: z.string().optional(),
  cascade: z.string().optional(),
});

export const EntityFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  column: z.string().optional(),
  primaryKey: z.boolean().optional(),
  relation: EntityFieldRelationSchema.optional(),
});

export const PersistenceEntitySchema = z.object({
  fqn: z.string(),
  simpleName: z.string(),
  table: z.string(),
  fields: z.array(EntityFieldSchema),
});

export const PersistenceOperationSchema = z.object({
  entity: z.string(),
  method: z.string(),
  inferredSql: z.string(),
  custom: z.boolean().optional(),
});

export const PersistenceSchema = z.object({
  mermaidER: z.string(),
  entities: z.array(PersistenceEntitySchema),
  operations: z.array(PersistenceOperationSchema),
});

export const EndpointSchema = z.object({
  method: HttpMethodSchema,
  path: z.string(),
  gatewayPath: z.string().nullable().optional(),
  componentId: z.string(),
  handlerMethod: z.string().optional(),
  microservice: z.string(),
  requestBody: z.string().nullable().optional(),
  responseType: z.string().nullable().optional(),
  responseStatus: z.string().nullable().optional(),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

export const EventsSchema = z.object({
  detected: z.boolean(),
  scannedPatterns: z.array(z.string()),
  subscribers: z.array(z.unknown()).optional(),
  publishers: z.array(z.unknown()).optional(),
  placeholderMessage: z.string().optional(),
});

export const RepositoryMicroserviceSchema = z.object({
  name: z.string(),
  module: z.string(),
  port: z.number().int().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const RepositorySchema = z.object({
  name: z.string(),
  rootPath: z.string(),
  language: z.enum(['java', 'kotlin']),
  framework: z.string(),
  microservices: z.array(RepositoryMicroserviceSchema),
});

export const FeatureMetaSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  summary: z.string(),
});

export const RecentContributorSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  commits: z.number().int().optional(),
  lastCommitDate: z.string().optional(),
});

export const OwnershipSchema = z.object({
  codeowners: z.array(z.string()).optional(),
  recentContributors: z.array(RecentContributorSchema).optional(),
});

export const FeatureSchema = z.object({
  devmapVersion: z.literal('1.0.0'),
  generatedAt: z.string(),
  feature: FeatureMetaSchema,
  repository: RepositorySchema,
  components: z.array(ComponentSchema),
  flow: FlowSchema,
  dependencies: DependenciesSchema,
  persistence: PersistenceSchema,
  endpoints: z.array(EndpointSchema),
  events: EventsSchema,
  ownership: OwnershipSchema,
});

export type Feature = z.infer<typeof FeatureSchema>;
