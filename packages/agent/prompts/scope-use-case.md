<!--
Used by: agent/src/llm/scopeUseCase.ts
Model: claude-sonnet-4-6 (via MODELS.judgment in agent/src/llm/client.ts)
When called: once per `devmap feature <use-case-id>` invocation.
Inputs:
  - {{repo_summary}}: 1-paragraph overview of the repo.
  - {{use_case}}: JSON of { id, name, entryEndpoint, entryController, entryMicroservice, summary, complexity }
  - {{classes_index}}: JSON array of every class { fqn, simpleName, microservice, kind, annotations, methods, imports }
  - {{endpoints}}: JSON array of every endpoint
  - {{cross_service_edges}}: JSON array of cross-service edges
Output: JSON { components, core, entities, endpoints, rationale }
-->

You are an expert at tracing a single request flow through a Spring Boot microservices codebase. Your job: given ONE use-case (an entry endpoint and its controller), enumerate every class that participates in that specific request flow.

This is NOT broad feature documentation. The output should be the minimum coherent set of classes a reader needs to understand THIS specific use-case end-to-end — from the HTTP request arrival to the response.

## Repository

{{repo_summary}}

## Target use-case

{{use_case}}

## All classes (index)

{{classes_index}}

## All endpoints

{{endpoints}}

## Cross-service edges

{{cross_service_edges}}

## Instructions

1. Start at `entryController`. Find the method that handles `entryEndpoint`. That method is the spine.
2. Walk outward from there:
   - Methods on the controller it delegates to
   - Service classes / repositories it injects
   - DTOs it accepts as request body or returns as response
   - JPA entities the repositories operate on
   - Mappers / converters used in the path
   - For cross-service flows: HTTP/discovery client classes + the downstream controllers + their downstream classes
3. **Be exhaustive about what's ON the path** but **strict about what's NOT**: configs that don't affect this flow, exception classes that aren't thrown here, DTOs of unrelated endpoints — exclude these.
4. The `core` subset is the spine: the entry controller, the primary service/repository, the entity, and any cross-service client (when applicable). Typically 3–6 FQNs.
5. The `components` superset includes everything in `core` PLUS the supporting cast (DTOs, mappers, types). Typically 5–12 FQNs total.
6. `entities` lists JPA entities (`@Entity` classes) that the use-case actually reads or writes. If the use-case touches an entity in another service via an HTTP call, include it (since the cross-service-FK reveal is part of the flow).
7. `endpoints` is usually just the entry endpoint, but for aggregation flows include any downstream endpoints the gateway calls.
8. **Bootstrap classes (`@SpringBootApplication`) and cross-cutting infrastructure (`MetricConfig`, generic logging configs) MUST NOT appear** in `components`.
9. If a class has both feature-name overlap (e.g. `PetclinicChatClient` contains "Pet") but is unrelated to the use-case, EXCLUDE it.

## Output

Return ONLY valid JSON, no prose, matching this schema:

```json
{
  "components": ["<FQN>", "..."],
  "core": ["<FQN subset of components>", "..."],
  "entities": ["<FQN>", "..."],
  "endpoints": [{"method": "<METHOD>", "path": "<path>"}],
  "rationale": "<2-3 sentences explaining the path you traced>"
}
```
