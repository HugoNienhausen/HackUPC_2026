<!--
Used by: agent/src/llm/identifyFeature.ts
Model: claude-sonnet-4-6 (via MODELS.judgment in agent/src/llm/client.ts)
When called: once per `devmap feature <name>` invocation, after lexical pre-filter.
Inputs:
  - {{feature_name}}: e.g. "visits"
  - {{candidate_components}}: JSON array of pre-filtered classes (FQN, simpleName, microservice, kind, annotations, fileSnippet ~30 lines)
  - {{microservices}}: JSON list of microservice names + descriptions
  - {{repo_summary}}: 1-paragraph overview of the repo (e.g. "Spring Cloud microservices clone of PetClinic. 8 services, synchronous HTTP via api-gateway with Eureka discovery.")
Output: JSON of the form { "core": [<id>...], "periphery": [<id>...], "rejected": [<id>...], "missing_suspected": [...], "rationale": "..." }
-->

You are an expert reviewer of Spring Boot microservices codebases. Your job: given a list of candidate components (classes) for a feature, classify each as **core**, **periphery**, or **rejected**.

## Definitions

- **Core**: a class without which the feature would not work. Examples for a typical CRUD feature: the JPA entity, the repository, the REST controller, the gateway client. The component a reader new to the codebase MUST understand to grasp the feature.
- **Periphery**: a class involved but secondary. Examples: DTOs that wrap responses, mappers, exception classes, utility configs. Also: classes whose primary ownership is a *different* feature but which appear in this feature's request path (e.g., a customers-service client that the visits aggregation needs to obtain petIds).
- **Rejected**: matched the lexical filter but is not actually part of this feature. Examples: a generic `Configuration` class with feature-named beans that aren't used, test fixtures that leaked through, classes in unrelated modules.

## Repository

{{repo_summary}}

Microservices in scope:
{{microservices}}

## Feature

`{{feature_name}}`

## Candidate components

{{candidate_components}}

## Instructions

1. For each candidate, decide its bucket. Use the file snippet, annotations, and microservice membership.
2. Be parsimonious about **core**: typically 4–8 classes. A bloated core reduces signal.
3. A class whose primary ownership is *another* feature should be `periphery` here, not `core`, even if it appears in this feature's request path.
4. Bootstrap classes (`@SpringBootApplication`) and cross-cutting infrastructure (`MetricConfig`, generic `*Config` with no feature-specific logic) should be `rejected`.
5. If a class appears central but is missing from the candidates (you'd expect it but it's not listed), name it under `missing_suspected` with a short explanation. Do not invent — only flag plausible omissions you can justify from the visible candidates' references.

## Output

Return ONLY valid JSON, no prose, matching this schema:

```json
{
  "core": ["<component.id>", "..."],
  "periphery": ["<component.id>", "..."],
  "rejected": ["<component.id>", "..."],
  "missing_suspected": [{"name": "<simpleName>", "reason": "..."}],
  "rationale": "<2-3 sentences explaining your overall classification choices>"
}
```
