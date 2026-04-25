# devmap — instant feature documentation for Spring Boot microservices

> One command. One feature name. A polished, interactive dashboard explaining how that feature flows across your microservices — components, data model, request path, endpoints, and the cross-service joins JPA hides from you.

![devmap dashboard — Dependencies tab](screenshots/dependencies.png)

## What it does

Pick any feature in a Spring Boot microservices repo (`visits`, `owners`, …). `devmap feature <name>` walks the Java sources, finds every class involved, traces the request path through gateway routes and HTTP/discovery client calls, detects entities and cross-service foreign keys, and opens a six-tab dashboard in your browser. Static analysis runs in milliseconds; targeted Claude calls turn the structural data into prose narrative — under 25 seconds cold, under 8 with cache, instant in airplane mode.

## Quick start

```bash
pnpm install
pnpm demo
```

`pnpm demo` reads a pre-warmed `demo/cache/visits.json`, opens the dashboard in your default browser, and needs **no API key and no internet**. For the second feature beat:

```bash
pnpm demo:owners
```

For a live run against your own clone of [spring-petclinic-microservices](https://github.com/spring-petclinic/spring-petclinic-microservices):

```bash
echo "ANTHROPIC_API_KEY=sk-…" > .env
pnpm devmap feature visits --refresh    # full pipeline, ~25s cold
pnpm devmap feature visits              # ~8s warm cache
```

## How it works

1. **Static indexer** (regex-only, no JVM). Walks `.java` files and emits a per-class record with annotations, methods, imports, and microservice membership; resolves cross-service edges via gateway YAML routes, `http://service-name` strings, and `discoveryClient.getInstances("…")`.
2. **Feature identifier** (lexical match + `claude-sonnet-4-6`). Scores every class against the feature name, expands one hop along the dependency graph, then asks Sonnet to refine the candidate set into core / periphery / rejected.
3. **View builders + LLM polish**. Six structural views (components, dependencies, persistence, endpoints, flow, events) are populated from the index; per-component summaries land in parallel via `claude-haiku-4-5`; the request-flow narrative + Mermaid sequence are reconstructed by Sonnet from the cross-service edges.

The artifact is a single `feature.json`, schema-validated by zod, served by an Express process with Vite middleware on top.

## Demo walkthrough

Five-minute demo script with stopwatch beats lives in [DEMO.md](./DEMO.md). Tab-by-tab preview:

| Tab | What it shows |
|---|---|
| **Flow** ([screenshot](screenshots/flow.png)) | LLM-written narrative + Mermaid `sequenceDiagram` of the full request path. |
| **Dependencies** ([screenshot](screenshots/dependencies.png)) | React Flow graph; node size = LOC, color = microservice, line style encodes import / HTTP / gateway-route / discovery. Click any node → side panel with annotations, methods, summary, and "Open in VS Code". |
| **Persistence** ([screenshot](screenshots/persistence.png)) | Cross-service-FK callout (the *demo wow beat*: `Visit.petId references Pet (customers-service)` — denormalized, no JPA relationship), Mermaid `erDiagram`, inferred SQL operations table. |
| **Components** ([screenshot](screenshots/components.png)) | Filterable card grid; core components first; click → same side panel as Dependencies, with VS Code / Cursor deep-links and copy-path fallback. |

API + Events tabs round out the surface — the API tab lists every endpoint with its gateway path; the Events tab is honest about PetClinic having no async messaging and lists the 11 patterns it scanned for.

## Tech stack

| Layer | Choice |
|---|---|
| Agent runtime | Node 20 + TypeScript (ESM) |
| CLI | `commander` + `ora` |
| Java parsing | regex (no JVM) |
| Schema | `zod` → JSON Schema via `zod-to-json-schema` |
| LLM SDK | `@anthropic-ai/sdk` (Sonnet 4.6 + Haiku 4.5, prompt caching on the shared candidates block) |
| Frontend | Vite + React 18 + TS + Tailwind v4 + `shadcn/ui` |
| Graphs | `@xyflow/react` (React Flow v12) + `dagre` |
| Diagrams | `mermaid` v11 (sequenceDiagram + erDiagram) |
| Server | `express` 5 + Vite middleware |
| Tests | `vitest` |

## Architecture

Full design doc — locked decisions, edge-type taxonomy, monorepo layout, ground-truth fixtures — in [ARCHITECTURE.md](./ARCHITECTURE.md). Phase-by-phase implementation log in [CHANGELOG.md](./CHANGELOG.md). Demo script in [DEMO.md](./DEMO.md). Risks + mitigations in [RISKS.md](./RISKS.md).

## License

MIT. Built at HackUPC 2026.
