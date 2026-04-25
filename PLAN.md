# devmap — Implementation Plan

Phases sized for **23h of coding + 3h buffer = 26 working hours** out of the 36h HackUPC weekend. Each phase is independently demoable. **MVP cut line moves to end of Phase 4a** — Dependencies tab + Express server is enough for a credible demo. Phase 4b's tabs are added in ranked-by-demo-value order; cut from the bottom if time runs out. Phases 5–6 are upgrades, not requirements.

For full context, locked decisions, and stack rationale see [ARCHITECTURE.md](./ARCHITECTURE.md). For the demo script see [DEMO.md](./DEMO.md). For risks see [RISKS.md](./RISKS.md).

---

## Phase 0 — Bootstrap (1h)

- **Goal**: monorepo skeleton, schema-typed, runnable `pnpm devmap` no-op.
- **Deliverables**:
  - pnpm workspace at `HackUPC/devmap/` with three packages: `agent/`, `web/`, `schema/`.
  - `schema/` exports a `zod` schema; `json-schema` generated from it on build.
  - `agent/src/cli.ts` with commander, single `feature <name>` command that prints `"not implemented"`.
- **Acceptance**: `cd HackUPC/devmap && pnpm install && pnpm devmap feature visits` exits 0 with placeholder message.
- **Effort**: 1h. Use `degit shadcn-ui/ui-react` for the web package and a minimal hand-rolled `package.json` for the rest. Hard-cap; if exceeded, drop shadcn for plain Tailwind and proceed.

## Phase 1 — Static indexer (3h)

- **Goal**: Walk PetClinic, emit `index.json` with every Java class, package, annotation, public method signature, import list, and source file path. Detect microservice membership by mapping each file path to its top-level Maven module (`spring-petclinic-*`).
- **Deliverables**:
  - `agent/src/index/scanFiles.ts` — recursive `.java` finder, skips `target/`, `test/`.
  - `agent/src/index/parseClass.ts` — regex extractor producing the per-class record. **Includes `kind: "application"` for `@SpringBootApplication` classes (will be filtered) and a denylist for `MetricConfig` and similar cross-cutting classes** (per locked decisions).
  - `agent/src/index/inferMicroservice.ts` — path → module mapping.
  - `agent/src/index/edges.ts` — import graph + cross-service URL edges.
  - `agent/src/cli.ts index --repo <path>` outputs `index.json`.
- **Acceptance criteria against PetClinic**:
  - 8 microservices detected.
  - `Visit`, `VisitRepository`, `VisitResource` present with correct annotations.
  - `OwnerResource` lists 4 endpoints.
  - Cross-service edges include: `api-gateway → customers-service`, `api-gateway → visits-service`, `genai-service → vets-service`, `genai-service → customers-service`.
  - `MetricConfig` and `*Application` classes are present in the index but flagged so they never enter feature artifacts.
  - Index runs in <3s on PetClinic.
- **Effort**: 3h. Regex-only; `java-parser` (npm) deferred unless a PetClinic file breaks the regex.

## Phase 2 — Feature identification by lexical match (1.5h)

- **Goal**: `devmap feature visits` resolves a feature name to a candidate list (no LLM yet).
- **Deliverables**:
  - `agent/src/feature/lexicalMatch.ts` — score classes by lexical match: simple-name contains feature name (weight 3), package contains feature name (weight 2), file path contains feature name (weight 1). Threshold ≥1. **Filters out classes flagged by Phase 1's denylist (MetricConfig, *Application).**
  - `agent/src/feature/expand.ts` — BFS one hop along import edges and cross-service edges. Configurable depth (default 1).
  - CLI prints sorted list of FQNs grouped by microservice.
- **Acceptance** (post locked decisions): `devmap feature visits` prints **5 classes** in visits-service + api-gateway, namely `Visit`, `VisitRepository`, `VisitResource`, `VisitsServiceClient`, plus expanded `ApiGatewayController` (and `CustomersServiceClient` reached via 1-hop expansion). `MetricConfig` and `VisitsServiceApplication` are absent from the output. `devmap feature owners` prints the customers-service owners cluster.
- **Effort**: 1.5h.

## Phase 3 — Full `feature.json` with all structural views (4h)

- **Goal**: Single command produces a schema-valid `feature.json` for `visits`. No LLM yet — placeholder strings where summaries/narrative would go.
- **Deliverables**:
  - `agent/src/views/components.ts` — populates the components array. Sets `core: true` based on lexical match score; periphery (1-hop neighbors) gets `core: false`. (LLM refinement happens in Phase 5.)
  - `agent/src/views/dependencies.ts` — nodes (one per class) and edges; edge type ∈ `import` | `http` | `gateway-route` | `discovery`.
  - `agent/src/views/persistence.ts` — collects `@Entity` classes in scope, emits `mermaidER` and inferred SQL operations from repository methods.
  - `agent/src/views/endpoints.ts` — REST endpoint table including resolved gateway path (e.g., `/api/visit/owners/*/pets/{petId}/visits`).
  - `agent/src/views/flow.ts` — generates a structural Mermaid `sequenceDiagram` from the dependency edges along the request path. Stub narrative says "Reconstruction pending".
  - `agent/src/views/events.ts` — emits the Events placeholder block.
  - Schema validation via `zod.parse()` before write.
- **Acceptance**: `feature.json` validates against schema. `devmap feature visits --no-llm --no-serve` completes in <8s. JSON contains: ≥6 components (no MetricConfig, no *Application), ≥1 entity (Visit), ≥3 endpoints, ≥1 cross-service edge for the visits flow (gateway→visits-service), Events with `detected: false`.
- **Effort**: 4h.

## Phase 3.5 — Minimal LLM: per-component summaries (1h)

- **Goal**: Replace placeholder `summary` strings with real Haiku-generated 1–2 sentence summaries **before** any frontend work — so when we render the UI in Phase 4a/4b, the demo data already looks polished.
- **Deliverables**:
  - `agent/src/llm/client.ts` — Anthropic SDK wrapper with the `MODELS` constant (single source of truth for model IDs), retry on 429, prompt caching `cache_control: ephemeral` for the shared candidates block, and a `--no-llm` short-circuit that returns deterministic placeholders.
  - `agent/src/llm/summarizeComponents.ts` — renders `prompts/summarize-component.md` per component, fires `Promise.all` (Haiku 4.5).
  - Wired into Phase 3's view builder behind a `--no-llm` flag (off by default once this phase lands).
- **Acceptance**:
  - `devmap feature visits --no-serve` completes in **<10s** total (≤3s static + ≤2s Haiku parallel + ≤5s headroom).
  - Each component has a non-placeholder, length-bounded (≤220 chars) summary.
  - `VisitResource.summary` ≠ `VisitsServiceClient.summary` (no copy-paste — they're meaningfully distinct).
  - `ANTHROPIC_API_KEY` missing → graceful fallback to placeholders, exit 0, warning logged.
- **Effort**: 1h. Sonnet calls (identifyFeature + reconstructFlow) are NOT in this phase — they land in Phase 5 after the frontend is real.

## Phase 4a — Frontend MVP: Vite + React Flow + Express (3.5h) — **MVP CUT LINE**

- **Goal**: Browser opens, Dependencies tab shows the inter-service graph, click on a node shows a side panel. Nothing else needs to work for a credible demo.
- **Deliverables**:
  - `web/` Vite + React + TS + Tailwind + shadcn/ui base.
  - Layout: top header with feature name + microservice chips, left sidebar tab nav (only Dependencies tab functional; others render `<TabPlaceholder/>`), main content panel.
  - **Dependencies tab**: React Flow with custom nodes (microservice color, size by `loc`), `dagre` layout LR direction, filter dropdown by microservice, click → shadcn `Sheet` side panel with class detail (annotations, methods, summary).
  - `agent/src/serve.ts` — Express server serves `feature.json` + Vite dev middleware, opens browser via `open` package.
  - `--no-serve` flag emits JSON only.
- **Acceptance**:
  - `devmap feature visits` ends with browser open at `http://localhost:5173`.
  - Dependencies tab renders with PetClinic data; click on `VisitResource` node opens side panel with its 3 endpoints visible.
  - Filter to "visits-service" hides api-gateway nodes.
  - Other tabs render a placeholder ("Coming up — flow, persistence, API, components, events") so the UI doesn't look broken.
- **Effort**: 3.5h. **This is the MVP cut line. If everything after this is dropped, the demo still has a story.**

## Phase 4b — Remaining tabs in ranked order (3h)

Implement in this order. Each tab is independently shippable; **cut from the bottom if time runs out**.

1. **Flow tab** (highest demo value — the "wow" beat). Mermaid sequenceDiagram rendered from `flow.mermaid`. Numbered timeline below from `flow.steps`. ~50 min.
2. **Persistence tab** (cross-service-FK reveal — second wow beat). Mermaid erDiagram + shadcn `Table` of inferred SQL operations. ~40 min.
3. **API tab** (cheap and useful). shadcn `Table` of endpoints with method/path/gateway-path/handler columns. ~20 min.
4. **Components tab** (card grid + side panel reuse from 4a + VS Code deep-link `vscode://file/<absPath>:<line>`). ~50 min.
5. **Events tab** (lowest effort, lowest information density — placeholder card). ~20 min.

- **Acceptance** (full Phase 4b complete):
  - All 5 tabs render with PetClinic data.
  - "Open in VS Code" link in Components tab opens the file at the right line on the demo laptop.
  - Click-from-graph also works (already covered in 4a).
- **If only Flow + Persistence + API land**: still a strong demo. Components and Events become "placeholder + roadmap" beats.
- **Effort**: 3h.

## Phase 5 — Full LLM integration: Sonnet calls + pre-warm (2.5h)

- **Goal**: Real LLM-driven core/periphery classification and flow narrative. End the phase by generating the demo's pre-warmed cache.
- **Deliverables**:
  - `agent/src/llm/identifyFeature.ts` — Sonnet 4.6 call; refines lexical candidate list to `core` / `periphery` / `rejected` sets + flags any `missing_suspected`. Updates components array's `core` flag.
  - `agent/src/llm/reconstructFlow.ts` — Sonnet 4.6 call; produces `flow.mermaid`, `flow.narrative`, `flow.steps`. Validates the Mermaid output with the `mermaid` library before writing.
  - `--refresh` flag forces re-call; default reads from `.devmap/cache/`. `--airplane` skips LLM entirely and reads from `demo/cache/`.
  - **End of phase**: run `pnpm devmap feature visits --refresh` and `pnpm devmap feature owners --refresh` and commit the resulting JSONs to `demo/cache/visits.json` and `demo/cache/owners.json`. **Pre-warm cache lives here from now on.**
- **Acceptance**:
  - `devmap feature visits` (cold) ≤25s wall-clock.
  - `devmap feature visits` (warm cache) ≤8s.
  - `devmap feature visits --airplane` reads `demo/cache/visits.json` instantly and opens browser in <3s.
  - Visits flow narrative names `ApiGatewayController → CustomersServiceClient → VisitsServiceClient → VisitResource → VisitRepository` in correct order.
  - Per locked decisions: `CustomersServiceClient.core === false`, `MetricConfig` and `VisitsServiceApplication` absent from the artifact entirely.
- **Effort**: 2.5h.

## Phase 6 — Polish, `pnpm demo`, demo prep (3.5h)

- **Goal**: Judged-grade aesthetics; one-keystroke demo command.
- **Deliverables**:
  - Theme: shadcn dark mode, monospace for code, transitions on tab switch.
  - Empty states & loading spinners on every tab.
  - Hover tooltips on graph nodes (annotations + summary). **(Drop first if time tight.)**
  - CLI: pretty progress (ora spinner), per-phase timing, final URL.
  - **`pnpm demo` script** in root `package.json` — runs `devmap feature visits --airplane` (reads `demo/cache/visits.json`, no LLM, opens browser). This is the keystroke for the live demo. A second variant `pnpm demo:owners` for the second feature beat.
  - `DEMO.md` rehearsal pass with stopwatch.
  - README.md screenshots **(drop second if time tight)**.
- **Acceptance**:
  - `pnpm demo` from a cold terminal opens a polished dashboard in <5s, no API key needed, no internet needed.
  - Live run (`pnpm devmap feature visits --refresh`) and airplane run look identical to the audience.
- **Effort**: 3.5h.

---

## Buffer & wall-clock budget

| Block | Hours |
|---|---|
| Phase 0 (1) + 1 (3) + 2 (1.5) + 3 (4) + 3.5 (1) + 4a (3.5) + 4b (3) + 5 (2.5) + 6 (3.5) | **23h coding** |
| Buffer (unallocated for blockers, debugging, demo retakes) | **3h** |
| **Working hours total** | **26h** |
| Sleep | ~6h |
| Meals / breaks / commute | ~2h |
| Demo recording + judging slot + audience Q&A | ~2h |
| **Wall-clock total** | **~36h** |

**Cut order if buffer gets eaten** (drop in this sequence, never out of order):
1. Phase 6 README screenshots → Phase 6 hover tooltips.
2. Phase 4b Events tab → Components tab → API tab. (Stop ASAP — Flow + Persistence are the demo wow beats.)
3. Phase 5 reconstructFlow narrative (fall back to deterministic structural narrative from edges).
4. Phase 5 identifyFeature (fall back to lexical scoring; all components get `core: true` if they pass lexical match).
5. **Last resort**: cut Phase 4b entirely. Phase 4a alone (Dependencies tab) is still demoable.

---

## Verification

End-to-end checks performed before declaring "done", phase by phase.

| Phase | What to run | Expected result |
|---|---|---|
| 1   | `pnpm devmap index --repo ../spring-petclinic-microservices` | `index.json` exists; `jq '.classes \| length'` ≥ 80; `jq '.microservices \| length' = 8`; `jq '.classes[] \| select(.simpleName=="VisitResource")'` shows annotations and 3 methods. `MetricConfig` and `*Application` classes are flagged but present. |
| 2   | `pnpm devmap feature visits --no-llm --no-serve --print-only` | Stdout lists exactly the union of `expectedCore` ∪ `expectedPeriphery` from the fixture (5 + 3 = 8 classes max after expansion). `MetricConfig` and `VisitsServiceApplication` are absent. |
| 3   | `pnpm devmap feature visits --no-llm --no-serve` | `feature.json` written; `pnpm validate-schema feature.json` passes; `jq '.events.detected' = false`; no component has FQN matching the `expectedAbsent` set. |
| 3.5 | `pnpm devmap feature visits --no-serve` (Haiku live) | Total wall-clock ≤10s. `jq '.components[].summary'` — every entry is non-placeholder, ≤220 chars, and `VisitResource.summary !== VisitsServiceClient.summary`. |
| 3.5 | `ANTHROPIC_API_KEY= pnpm devmap feature visits --no-serve` | Exit 0 with warning; placeholder summaries used; JSON still valid. |
| 4a  | `pnpm devmap feature visits --no-llm` | Browser opens at `http://localhost:5173`; Dependencies tab renders; click `VisitResource` → side panel with 3 endpoints; filter "visits-service" hides api-gateway nodes. Other tabs show "Coming up" placeholder. |
| 4b  | `pnpm devmap feature visits --no-llm` | All 5 tabs render. "Open in VS Code" on Components tab opens file at correct line. Mermaid sequence and ER diagrams render without errors. |
| 5   | `pnpm devmap feature visits --refresh` (full live LLM) | Cold ≤25s. `jq '.flow.narrative \| length'` between 200 and 700. `jq '.components[] \| select(.id=="api.application.CustomersServiceClient") \| .core' = false`. |
| 5   | `pnpm devmap feature visits` (warm cache) | ≤8s wall-clock. Same UI, no Anthropic network call (DevTools Network tab confirms). |
| 5   | `pnpm devmap feature visits --airplane` | Reads `demo/cache/visits.json`. Browser open ≤3s. Zero network activity. |
| 6   | `pnpm demo` (the actual demo command) | Cold terminal → polished dashboard in <5s, no API key needed. `pnpm demo:owners` works identically for the second feature beat. |
| 6   | Run full demo script with stopwatch | Under 5:00. All beats land. |
| Tests | `pnpm test` | All vitest pass. Integration test asserts: `expectedCore` all present + `core===true`; `expectedPeriphery` all present + `core===false`; `expectedAbsent` all missing; precision/recall = 1.0 on every set. |
