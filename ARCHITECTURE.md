# devmap — Architecture

## Context

**Problem.** Onboarding to a polyglot microservices repo is opaque. New engineers can read each class, but reconstructing the *feature* — "what classes power the visits flow, what's the data model, what crosses service boundaries" — takes hours of manual archaeology.

**Solution.** `devmap feature <name>` runs a one-command static + LLM agent that produces an interactive web dashboard for that feature.

**Demo target.** `spring-petclinic/spring-petclinic-microservices` cloned at `/Users/hugonienhausen/Desktop/spring-petclinic-microservices/`, sibling to this project. Designed and tested exclusively against PetClinic for the HackUPC demo.

---

## Locked decisions

These three judgment calls are locked. Changing any of them later requires touching the fixture (`tests/fixtures/visits-ground-truth.json`), the example artifact (`packages/schema/examples/visits.feature.json`), and Phase 2 acceptance criteria in [PLAN.md](./PLAN.md).

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Is `CustomersServiceClient` part of the `visits` feature? | **Periphery, not core.** | It belongs primarily to the `owners` feature. It enters the visits flow only because the gateway-level visits aggregation needs petIds first. Marking it core for both features would inflate every feature's "core" set. Keep it in the artifact (visible in graph and component list) as periphery. |
| 2 | Should `MetricConfig` appear at all? | **Filter out entirely.** | Cross-cutting infrastructure. Every microservice has one. Including it adds noise without information for any feature. The lexical match still picks it up; we apply a denylist filter in the indexer. |
| 3 | Should `VisitsServiceApplication` (the `@SpringBootApplication` class) appear? | **Exclude.** | Bootstrap class — same reason as MetricConfig. Filter all classes whose simple name matches `*Application` and which carry `@SpringBootApplication`. |

**Implementation site**: `agent/src/index/parseClass.ts` adds a `kind: "application"` for any `@SpringBootApplication` class (always excluded from feature artifacts) and a static denylist for cross-cutting classes (`MetricConfig`, etc.) that prevents them from entering candidate sets.

---

## Component diagram

```mermaid
flowchart LR
  user([Developer]) -->|devmap feature visits| cli[CLI<br/>commander]
  cli --> orch[Orchestrator]

  subgraph agent[agent/ — Node + TS]
    orch --> idx[Static Indexer<br/>regex-based]
    orch --> feat[Feature Identifier<br/>lexical + LLM]
    orch --> views[View Builders]
    orch --> llm[LLM Client<br/>@anthropic-ai/sdk]
    orch --> srv[Express server +<br/>Vite dev middleware]
  end

  idx -->|reads .java| repo[(spring-petclinic-<br/>microservices/)]
  feat --> idx
  views --> idx
  views --> llm
  llm -->|HTTPS| anth[Claude API<br/>Sonnet 4.6 + Haiku 4.5]

  views -->|writes| fjson[(feature.json<br/>schema-validated)]
  srv -->|serves| fjson
  srv -->|opens browser| web[web/ — React + Vite]

  subgraph web[web/ — React]
    web --> tabs[Tab views]
    tabs --> flowv[Flow<br/>Mermaid sequence]
    tabs --> depv[Dependencies<br/>React Flow]
    tabs --> persv[Persistence<br/>Mermaid ER]
    tabs --> apiv[API<br/>shadcn Table]
    tabs --> evtv[Events<br/>placeholder]
    tabs --> compv[Components<br/>cards + side panel]
  end

  fjson -->|loaded by| web
  cache[(.devmap/cache/<br/>feature.json)]
  llm <-.cache miss/hit.-> cache
```

---

## Stack decisions

| Layer | Choice | Why |
|---|---|---|
| Agent runtime | Node 20 + TypeScript | Schema sharing with frontend, fastest solo iteration |
| CLI framework | `commander` | Dead simple, no learning curve |
| Java parsing | regex-first; `java-parser` (npm) as fallback | PetClinic's clean conventions make regex sufficient |
| Schema | `zod` → JSON Schema via `zod-to-json-schema` | Single source of truth for both runtimes |
| LLM SDK | `@anthropic-ai/sdk` | Native, supports prompt caching |
| Models | Sonnet 4.6 (judgment), Haiku 4.5 (per-component) | Balance of latency and quality |
| Frontend | Vite + React 18 + TS | Hot reload, judged-grade DX |
| UI kit | `shadcn/ui` + Tailwind | Pre-baked aesthetics, copy-paste components |
| Graphs | `@xyflow/react` (React Flow v12) | Best-in-class node graphs |
| Diagrams | `mermaid` v11 | sequenceDiagram + erDiagram, no other library needed |
| Server | `express` 4 + `vite` middleware | One process, no CORS plumbing |
| Open-browser | `open` (npm) | One-liner |
| Tests | `vitest` | Comes with Vite, no extra config |

### Claude model selection

Verified at `https://docs.claude.com/en/docs/about-claude/models/overview` on 2026-04-25. Model IDs are stored in **one** constant in `agent/src/llm/client.ts` — no string literals scattered across call sites:

```ts
// agent/src/llm/client.ts — single source of truth.
// Verified at docs.claude.com/en/docs/about-claude/models/overview on 2026-04-25.
export const MODELS = {
  // Judgment tasks: identify-feature, reconstruct-flow.
  // Latency: Fast. 1M token context. $3/$15 per MTok in/out.
  judgment: 'claude-sonnet-4-6',

  // Per-component summarization (parallelized).
  // Latency: Fastest. 200k token context. $1/$5 per MTok in/out.
  // Pin the snapshot for stable hackathon-week behavior.
  summary:  'claude-haiku-4-5-20251001',
} as const;
```

| Phase / Task | `MODELS` key | Concurrency | Reasoning |
|---|---|---|---|
| `identify-feature` (one call, ranks ~50 candidates) | `judgment` (`claude-sonnet-4-6`) | 1 call | Single decision but high-leverage; precision matters for the whole downstream artifact. Costs ~5s. |
| `summarize-component` (one call per component, ~10–15 components) | `summary` (`claude-haiku-4-5-20251001`) | Up to 10 in parallel | Per-call work is small (1–2 sentence summary). Parallel `Promise.all` keeps wall-clock to a single Haiku roundtrip (~2s). |
| `reconstruct-flow` (one call, narrative + step list) | `judgment` (`claude-sonnet-4-6`) | 1 call | Reasoning over the full set of core components and the gateway routing config. Output is the story the demo hinges on. ~5s. |

**Total LLM wall-clock budget for first run**: ~12s (5 + 2 + 5). Combined with ~5s of static indexing and ~3s of frontend boot, fits the <30s cold target.

**Caching**: write `feature.json` to `.devmap/cache/<repo-hash>/<feature>.json`. Subsequent runs skip the LLM unless `--refresh` is passed.

**Prompt caching (Anthropic feature)**: structure the messages so the candidate list is in a `cache_control: {type: "ephemeral"}` block. Saves cost and latency on Sonnet calls.

---

## Inter-service URL extraction

PetClinic resolves cross-service calls in three patterns the indexer must detect:

1. **`WebClient` with literal URI** — `webClientBuilder.build().get().uri("http://customers-service/owners/{ownerId}", ownerId)`. Regex: capture `(http://|lb://)([a-z][a-z0-9-]+)(/[^"]*)`. The captured service name is the dependency target.
2. **Spring Cloud Gateway routes** — `application.yml` with `uri: lb://service-name` and `predicates: Path=/api/...`. Parse the YAML and emit one edge per route from `api-gateway` to the target service.
3. **DiscoveryClient lookup** — `discoveryClient.getInstances("customers-service")` (used in genai-service `AIDataProvider`). Regex: `discoveryClient\.getInstances\("([^"]+)"\)`.

Feign detection is stubbed (PetClinic doesn't use it); add in <30 LOC if a future repo needs it.

The static analyzer emits an inter-service edge per detected call with `{from: callerService, to: targetService, method: 'WebClient'|'RestClient'|'GatewayRoute'|'DiscoveryClient', sourceFile, sourceLine}`. These render as the cross-service edges in the Dependencies graph, colored differently from intra-service import edges.

### Edge types and their meaning

Cross-service connectivity is split across three `edge.type` values, each preserved separately so the Phase 4 Dependencies view can render them with distinct styles:

- `http` — literal `http://service` / `lb://service` URLs found at brace depth ≥ 2 (inside method bodies). One edge per source line.
- `gateway-route` — `application.yml` route from `api-gateway` to `lb://target`. `via` carries the route predicate (e.g. `Path=/api/visit/**`).
- `discovery` — `discoveryClient.getInstances("name")` lookup, distinct from `http` because resolution is dynamic.

Intra-service edges are emitted as `type: "import"` and are not cross-service.

The correct filter for "any cross-service relationship" is `from != to and type IN ("http", "discovery", "gateway-route")`. Filtering on `type=="http"` alone undercounts — e.g. PetClinic's `api-gateway → visits-service` link surfaces only as a `gateway-route` (the URL literal is a class field at depth 1), and `genai-service → customers-service` surfaces only as `discovery`.

---

## Events handling (PetClinic has none)

PetClinic uses **zero** asynchronous messaging — confirmed by exhaustive grep for `@KafkaListener`, `KafkaTemplate`, `@RabbitListener`, `RabbitTemplate`, `@JmsListener`, `@StreamListener`, `@EnableBinding`, `StreamBridge`, `ApplicationEventPublisher`, `@EventListener`. The only match is `VectorStoreController.loadVetDataToVectorStoreOnStartup` — a startup lifecycle hook in genai-service, not inter-service messaging.

The Events tab renders an honest placeholder listing the patterns scanned. This becomes a demo strength: the tool reasons about absence as well as presence. If event-driven communication is later adopted, the view populates automatically.

---

## Monorepo layout

```
HackUPC/
└── devmap/                            # repo root
    ├── package.json                   # pnpm workspace root
    ├── pnpm-workspace.yaml
    ├── tsconfig.base.json
    ├── README.md
    ├── PLAN.md
    ├── ARCHITECTURE.md
    ├── DEMO.md
    ├── RISKS.md
    ├── packages/
    │   ├── schema/                    # shared zod schema + JSON Schema export
    │   │   ├── src/
    │   │   │   ├── feature.ts         # zod definitions
    │   │   │   └── index.ts
    │   │   ├── feature.schema.json    # generated; checked in
    │   │   ├── examples/
    │   │   │   └── visits.feature.json
    │   │   └── package.json
    │   ├── agent/
    │   │   ├── src/
    │   │   │   ├── cli.ts
    │   │   │   ├── orchestrator.ts
    │   │   │   ├── index/
    │   │   │   │   ├── scanFiles.ts
    │   │   │   │   ├── parseClass.ts
    │   │   │   │   ├── inferMicroservice.ts
    │   │   │   │   └── edges.ts
    │   │   │   ├── feature/
    │   │   │   │   ├── lexicalMatch.ts
    │   │   │   │   └── expand.ts
    │   │   │   ├── views/
    │   │   │   │   ├── components.ts
    │   │   │   │   ├── dependencies.ts
    │   │   │   │   ├── persistence.ts
    │   │   │   │   ├── endpoints.ts
    │   │   │   │   ├── flow.ts
    │   │   │   │   └── events.ts
    │   │   │   ├── llm/
    │   │   │   │   ├── client.ts
    │   │   │   │   ├── identifyFeature.ts
    │   │   │   │   ├── summarizeComponents.ts
    │   │   │   │   └── reconstructFlow.ts
    │   │   │   └── serve.ts
    │   │   ├── prompts/
    │   │   │   ├── identify-feature.md
    │   │   │   ├── summarize-component.md
    │   │   │   └── reconstruct-flow.md
    │   │   └── package.json
    │   └── web/
    │       ├── index.html
    │       ├── vite.config.ts
    │       ├── src/
    │       │   ├── main.tsx
    │       │   ├── App.tsx
    │       │   ├── tabs/
    │       │   │   ├── Flow.tsx
    │       │   │   ├── Dependencies.tsx
    │       │   │   ├── Persistence.tsx
    │       │   │   ├── Api.tsx
    │       │   │   ├── Events.tsx
    │       │   │   └── Components.tsx
    │       │   ├── components/
    │       │   │   └── ui/             # shadcn copy
    │       │   └── lib/
    │       └── package.json
    ├── tests/
    │   └── fixtures/
    │       └── visits-ground-truth.json
    └── demo/
        └── cache/                      # pre-warmed feature.json for offline demo
            ├── visits.json
            └── owners.json
```

---

## Testing strategy

Solo + 36h = ruthless test minimalism. Tests cover only what protects the demo.

- **Unit (vitest, ~20 tests total)**:
  - `parseClass`: 5 fixture .java files (entity, controller, repository, config, application class) with expected output. Pin the regex behavior.
  - `lexicalMatch`: scoring against a synthetic class list.
  - `edges`: WebClient/lb:// URL extraction from ~6 hand-written snippets.
- **Integration (1 test)**:
  - `agent.feature("visits")` end-to-end against the actual PetClinic clone, asserting the resulting `feature.json` matches `tests/fixtures/visits-ground-truth.json` for the components list. Per locked decisions: `expectedCore` all present + `core===true`; `expectedPeriphery` all present + `core===false`; `expectedAbsent` all missing. Precision/recall = 1.0 on every set.
- **Schema (1 test)**: `feature.json` for visits validates against `feature.schema.json`.
- **No frontend tests.** Manual click-through is the test. Time better spent on UI polish.
- **CI**: GitHub Actions running `pnpm test` on push. Single workflow file, ~5 minutes setup. Skip if it costs more than 30 min to fix.

---

## Verified ground truth from PetClinic

Collected during planning:

- 8 microservices: `api-gateway`, `customers-service`, `visits-service`, `vets-service`, `genai-service`, `config-server`, `discovery-server`, `admin-server`.
- All inter-service comms are **synchronous HTTP** via `WebClient` / `RestClient` with `@LoadBalanced` and Eureka `lb://service-name` resolution. **Zero** Kafka/AMQP/JMS/Stream — confirmed by exhaustive grep.
- Gateway routes (in `spring-petclinic-api-gateway/src/main/resources/application.yml`): `/api/customer/**` → customers-service, `/api/visit/**` → visits-service, `/api/vet/**` → vets-service, `/api/genai/**` → genai-service.
- Visits feature spans: `visits-service` (Visit entity, VisitRepository, VisitResource), `api-gateway` (VisitsServiceClient, VisitDetails, Visits DTOs, ApiGatewayController orchestration), and references customers-service Pet by `petId`.
- Visit entity has *no JPA relationship* to Pet — denormalized `petId: int` only. Demo highlight: the tool detects a *cross-service foreign key* in the persistence view.
