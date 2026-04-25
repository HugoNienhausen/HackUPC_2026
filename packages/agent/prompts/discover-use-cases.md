<!--
Used by: agent/src/llm/discoverUseCases.ts
Model: claude-sonnet-4-6 (via MODELS.judgment in agent/src/llm/client.ts)
When called: once per `devmap discover` invocation against a repo.
Inputs:
  - {{repo_summary}}: 1-paragraph overview of the repo.
  - {{microservices}}: JSON list of microservice names + module paths + ports.
  - {{classes_index}}: JSON array of every class { fqn, simpleName, microservice, kind, annotations }
  - {{endpoints}}: JSON array of every detected REST endpoint { method, path, handler, microservice, gatewayPath }
  - {{cross_service_edges}}: JSON array of cross-service edges { from, to, type } (http | discovery | gateway-route)
Output: JSON of the form { "useCases": [...] }
-->

You are an expert at reverse-engineering business behavior from a Spring Boot microservices codebase. Your job: enumerate the **use-cases** that the system supports — concrete, individual request flows tied to one or more HTTP endpoints — so that a new engineer can browse a list and pick what to study first.

A **use-case** in this product is NOT a broad "feature" like "visits". It is a single coherent business action, usually triggered by ONE entry endpoint, that may fan out to multiple services internally.

## Definitions

- **Single-service use-case**: an entry endpoint whose handler operates within one microservice (CRUD on a local entity, a query that hits only the local DB, etc.). Example: `POST /owners` → creates a new owner row.
- **Cross-service use-case**: an entry endpoint whose handler explicitly calls another service (HTTP/discovery client) or whose route is an api-gateway aggregation that fans out. Example: `GET /api/gateway/owners/{ownerId}` → calls customers + visits services and joins the response.
- **Aggregation endpoint**: a special case of cross-service use-case where the entry is the api-gateway and it composes results from 2+ downstream services. These are the demo gold — flag them with `complexity: "cross-service"`.

## Repository

{{repo_summary}}

### Microservices

{{microservices}}

### All classes (index)

{{classes_index}}

### All REST endpoints

{{endpoints}}

### Cross-service edges

{{cross_service_edges}}

## Instructions

1. Walk every endpoint. For each one, decide: does it represent a meaningful business action? Skip pure CRUD repetition (e.g. if a service has 5 near-identical findById/findAll/save endpoints, surface AT MOST 2: one read, one write).
2. For aggregation endpoints (api-gateway routes that fan out), prefer the ones that touch ≥2 downstream services. These are the most demo-worthy.
3. Build a stable, camelCase `id` for each use-case. Examples: `addPetToOwner`, `getOwnerDetailsWithPetsAndVisits`, `listVetsWithSpecialties`. The id MUST be unique within your output. Avoid spaces or punctuation.
4. The `name` field is human-readable, sentence case, e.g. "Add a pet to an owner".
5. The `entryEndpoint` is the user-facing entry — for api-gateway aggregations use the gateway path, NOT the downstream service path.
6. The `entryController` is the simpleName of the controller class that handles the entry (e.g. `PetResource`, `ApiGatewayController`).
7. The `entryMicroservice` is where `entryController` lives.
8. The `summary` is 1 sentence, no marketing fluff. Describe what business action this performs.
9. The `complexity` is `"cross-service"` if the flow crosses microservice boundaries (handler calls another service, or the gateway aggregates). Otherwise `"single-service"`.
10. **Cap the output at 20 use-cases.** If the repo has more, prioritize: (a) all cross-service flows, (b) the most representative single-service flows, (c) skip CRUD duplication.

## Output

Return ONLY valid JSON, no prose, matching this schema:

```json
{
  "useCases": [
    {
      "id": "<camelCaseId>",
      "name": "<Human readable name>",
      "entryEndpoint": "<METHOD /path>",
      "entryController": "<ControllerSimpleName>",
      "entryMicroservice": "<service-name>",
      "summary": "<one sentence>",
      "complexity": "single-service" | "cross-service"
    }
  ]
}
```
