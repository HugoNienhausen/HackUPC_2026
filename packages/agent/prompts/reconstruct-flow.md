<!--
Used by: agent/src/llm/reconstructFlow.ts
Model: claude-sonnet-4-6 (via MODELS.judgment in agent/src/llm/client.ts)
When called: once per feature, after identifyFeature has classified core/periphery.
Inputs:
  - {{feature_name}}, {{feature_summary}}
  - {{core_components}}: JSON list of core components with their public methods and annotations
  - {{cross_service_calls}}: JSON list of detected HTTP calls between services (caller, target, method, URL pattern)
  - {{gateway_routes}}: relevant gateway route definitions for this feature
  - {{entry_endpoints}}: REST endpoints that act as the feature's entry point
Output: JSON with `mermaid`, `narrative`, `steps`.
-->

You reconstruct the runtime flow of a feature in a Spring microservices codebase, based on its core components and the inter-service calls between them. You produce a Mermaid `sequenceDiagram`, a 4–6 sentence narrative, and a numbered list of steps.

## Feature

`{{feature_name}}` — {{feature_summary}}

## Core components

{{core_components}}

## Cross-service HTTP calls detected

{{cross_service_calls}}

## API gateway routes

{{gateway_routes}}

## Candidate entry endpoint(s)

{{entry_endpoints}}

## Instructions

1. **Pick the most important request path** that demonstrates the feature. If multiple endpoints exist, choose the one that traverses the most components (typically a `GET` that aggregates data via the gateway).
2. **Build a Mermaid sequenceDiagram**:
   - Use `participant` declarations with short, recognizable aliases.
   - Include the client, gateway controller, gateway client wrappers, target service controller, repository, and database.
   - Show synchronous calls with `->>` and returns with `-->>`.
   - Annotate cross-service calls with `(lb)` if load-balanced via Eureka.
   - Include the SQL query at the database level when a repository call happens.
3. **Write a 4–6 sentence narrative** in plain English. Tell the story of the request: what enters, what it asks for, who orchestrates, who returns what, what hits the database, what the user sees. Mention circuit breakers or fallbacks if present in the components.
4. **Produce a step list** of 6–10 entries, each `{index, actor, action, componentId, details?}`.

## Constraints

- Do not invent components or services not in `{{core_components}}` or `{{cross_service_calls}}`.
- If the feature has no gateway exposure, use the service-level endpoint as the entry.
- Keep the narrative under 600 characters.
- `componentId` in steps must match an `id` from `{{core_components}}` — except for "Client" and database actors which can use literal strings.

## Output

Return ONLY valid JSON, no prose, matching:

```json
{
  "mermaid": "sequenceDiagram\n  ...",
  "narrative": "...",
  "steps": [ { "index": 1, "actor": "...", "action": "...", "componentId": "...", "details": "..." } ]
}
```
