# Changelog

All notable changes to devmap. Format loosely follows Keep a Changelog; phases match [PLAN.md](./PLAN.md).

## [0.6.0] — 2026-04-25

### Phase 6 — Polish, `pnpm demo`, demo prep

Final polish phase. Six commits, all priorities 1–5 landed; priority 6
(service-node columns + tooltips) cut as planned — the graph reads
fine without it. Tests green: 119 passed + 1 live-skipped across 23
files. `pnpm demo` cold-terminal-to-browser in ~250 ms (Vite ready)
plus the OS browser-launch — well under the 5 s budget.

### Added

- **`pnpm demo` + `pnpm demo:owners`** in the root `package.json` —
  the keystrokes for the live demo. Both run with `--airplane` so
  no API key and no internet are needed.
- **CLI ora spinner with phase logs** (`packages/agent/src/progress.ts`).
  Six TTY-gated phases: `Scanning Java sources`, `Identifying
  components`, `Building dependency graph`, `Detecting persistence
  model`, `Generating component summaries (Claude Haiku, parallel)`,
  `Reconstructing request flow (Claude Sonnet)` — each shows elapsed
  time on success. Suppressed when `stderr` is not a TTY (so test
  pipes don't get ANSI escapes) and in `--airplane` mode (instant —
  spinners would feel weird). Existing structured stderr lines are
  preserved on the non-TTY path so log-scraping doesn't break.
- **README.md** — public-facing rewrite. Hero shot, quick-start
  one-liner, three-bullet how-it-works, tab-walkthrough table with
  per-tab screenshot links, tech-stack table, links to the design
  docs (ARCHITECTURE / DEMO / CHANGELOG / RISKS). `screenshots/`
  directory committed with a checklist describing the four PNGs the
  README expects (captured manually before the demo recording).
- **DEMO.md "Demo recording — instructions"** section with a 5-step
  pre-record checklist (clear browser state, pre-warm caches,
  pre-test the spinner cameo, window layout, stopwatch) plus
  recovery cuts for the two known live-run failure modes.

### Changed

- **Components tab cards** (`web/src/tabs/Components.tsx`) — uniform
  height via `min-h-[180px]`; file-path footer uses RTL truncation
  (`direction: rtl; text-align: left; text-overflow: ellipsis`)
  so the *filename* stays readable when the path overflows. Title
  attribute added so the full path tooltips on hover.
- **Tab transitions** (`web/src/App.tsx` + `web/src/index.css`) —
  150 ms keyframe fade on the main content container when the active
  tab changes (`key={active}` re-mount + `animate-tab-fade` class).
- **DEMO.md** — script beats now use `pnpm demo` / `pnpm demo:owners`
  instead of `devmap feature …`. The live spinner cameo moves from
  [0:30] (where airplane is silent) to [4:15] (the under-the-hood
  beat) where the new spinner phases get to shine on a `--refresh`
  run.

### Fixed

- **Persistence ER diagram render**
  (`agent/src/views/persistence.ts`). Mermaid v11 only recognizes
  `PK` / `FK` / `UK` as bare attribute tags, and the type token
  cannot contain `<` or `>`. Two emit-side fixes: (a) replaced
  `FK_byValue` with the proper comment syntax `FK "byValue"`, and
  (b) strip Java generics from the type token (`Set<Pet>` → `Set`)
  and skip JPA collection-navigation fields entirely (no `column` →
  ER attributes don't apply). Cached `demo/cache/{visits,owners}.json`
  rebuilt against the fixed emitter so the demo run shows a parsed
  ER diagram instead of the amber fallback. The amber fallback Card
  is kept as defense-in-depth for any future malformed source.

### Acceptance — PLAN.md §2 Phase 6

- ✅ `pnpm demo` from a cold terminal opens a polished dashboard in
  <5 s, no API key needed, no internet needed.
- ✅ Live run (`pnpm devmap feature visits --refresh`) and airplane
  run look identical to the audience (the spinner is the only
  visible difference, intentionally — that's the [4:15] beat).
- ✅ DEMO.md walkthrough rehearsed against shipped behavior;
  recording-prep instructions in place.

### Cuts from the plan

- **Priority 6** — service-node manual column layout + tooltips on
  truncated graph labels. Pre-authorized cut in the brief; the
  Dependencies graph is already legible without it.
- **Hover tooltips on graph nodes** (PLAN.md §6 line 130) — same
  rationale, same authorized cut.
- **Screenshot capture** — directory + checklist committed; the four
  PNGs themselves are captured manually before the demo recording.

## Phase 5 — LLM integration (Sonnet) + airplane mode

### Added
- `LlmClient.completeJson<T>()` with one auto-retry on JSON parse failure.
- `identifyFeature` (Sonnet 4.6): refines lexical+expand candidates into 
  core / periphery / rejected sets. Removes rejected from artifact.
- `reconstructFlow` (Sonnet 4.6): generates the `flow.narrative`, 
  `flow.mermaid` (sequenceDiagram), `flow.steps`, and upgrades 
  `feature.summary` from structural placeholder to real prose.
- File-based cache at `.devmap/cache/<repo-hash>/<feature>.json`. 
  Hash combines absolute repo path + git HEAD of target + devmapVersion.
- CLI `--refresh` flag: forces re-call of all LLM calls.
- CLI `--airplane` flag: skips orchestrator entirely, loads from 
  `demo/cache/`. Used for the demo to guarantee zero network activity.
- `demo/cache/visits.json` and `demo/cache/owners.json` committed for 
  airplane-mode bulletproofing.
- Web airplane-mode detection: rootPath starting with `<` disables 
  VS Code/Cursor buttons with tooltip; copy-path remains enabled.

### Changed
- Components tab now displays relative paths always (not just airplane). 
  Stores `filePath` (relative) and `absoluteFilePath` (used by VS Code 
  button when available).
- `reconstructFlow` receives ALL in-scope components, not just core. 
  Periphery components can still be on the request path (e.g. 
  ApiGatewayController orchestrates visits despite being periphery for 
  the visits feature).

### Decisions documented
- Mermaid validation in agent is lightweight (`startsWith("sequenceDiagram")` 
  + contains `->>`). Web does the strict parse via `mermaid.parse()` 
  with graceful fallback. Defense-in-depth.
- Locked decisions remain enforced by Phase 1 indexer denylist 
  BEFORE the LLM ever sees them. MetricConfig and *Application classes 
  cannot enter the candidate set.
- CustomersServiceClient.core remained false after Sonnet classification 
  (no discrepa
  
## [0.4.1] — 2026-04-25

### Phase 4b — Remaining tabs in ranked order (all 5 shipped)

All five tabs from the Phase 4b ranked plan are live with PetClinic data. Order locked: Flow → Persistence → API → Components → Events. End-to-end well under the 3 h cap.

- **Flow tab** (`web/src/tabs/Flow.tsx`) — top: Workflow icon header. Then a left-bordered italic narrative blockquote (currently the 61-char Phase 3 placeholder until Phase 5's `reconstructFlow` lands). Then `feature.flow.mermaid` rendered as SVG via the new `MermaidView` wrapper (mermaid v11, `securityLevel: 'strict'`, parse + render guarded by try/catch). On render failure: an amber AlertTriangle Card explains the fallback. Then a numbered timeline derived from `feature.flow.steps` — one StepCard per entry with index pill, actor + action + optional details + componentId.
- **Persistence tab** (`web/src/tabs/Persistence.tsx`) — top: Database icon header. Then **the cross-service-FK callout** (the demo's second wow beat) — an amber-tinted Card with a KeyRound icon listing every `ForeignKeyByValue` relation in scope. For visits: `Visit.petId references Pet (customers-service) — denormalized cross-service foreign key, no JPA relationship. Join column: pet_id.` Then `feature.persistence.mermaidER` via `MermaidView` (same fallback). Then a shadcn `Table` of operations: Entity / Method (mono) / Inferred SQL (mono, muted) / Custom? (Yes/No badge).
- **API tab** (`web/src/tabs/Api.tsx`) — shadcn `Table` of `feature.endpoints`. Method as a colored pill (GET emerald, POST blue, PUT amber, PATCH purple, DELETE rose), Path + Gateway path in mono (`—` when null), Handler in mono, Service as a left-bordered Badge in the microservice palette. Footer note explains the dash convention (gateway-side endpoints have no proxied route). Sortable headers explicitly skipped per the brief — would have cost > 5 min for negligible value at 4 endpoints.
- **Components tab** (`web/src/tabs/Components.tsx`) — responsive card grid (1/2/3/4 cols at sm/lg/xl). Each card: simpleName (mono), kind + microservice Badges, line-clamped 3-line summary, file-path footer. Core components get a 4 px microservice-colored left border + a "core" Badge; periphery gets a 2 px border. Sort order: core first, then by microservice, then by simpleName — so the demo path lands at the top. A search Input filters by simpleName/FQN/kind/microservice substring (case-insensitive). Header carries an at-a-glance core/periphery count.
- **Events tab** (`web/src/tabs/Events.tsx`) — when `detected===false` (always true for PetClinic): centered Card with an Inbox icon in a rounded muted pill, "No async messaging detected" heading, the `placeholderMessage` as prose, and a ghost-button-toggled expander listing every `scannedPatterns` entry as a mono Badge. When `detected===true`: a small "not implemented for this hackathon" Card; the publishers/subscribers UI is Phase 6+ work. Top bar with Radio icon + "Events" + caption matches the other tabs.

### ComponentSheet upgrade — VS Code / Cursor deep-link

The ComponentSheet (introduced in Phase 4a, used by Dependencies tab; now also used by Components tab) gains a "Source" section with three actions:

- **Open in VS Code** → `vscode://file/<absPath>[:<line>]`
- **Open in Cursor** → `cursor://file/<absPath>[:<line>]`
- **Copy path** → clipboard, with transient "Copied" feedback

`absPath` is built from `feature.repository.rootPath + filePath`. `line` comes from `component.lineStart` when present (Phase 1 captures it on type declarations). Below the buttons, the absolute path with line suffix renders as inline mono text — the always-works fallback if both editor schemes fail.

`Dependencies.tsx` now passes `feature.repository.rootPath` to the Sheet too, so the click-from-graph path also opens in editor.

### Shared infrastructure

- `web/src/lib/mermaidClient.ts` — owns mermaid initialization (idempotent, `securityLevel: 'strict'`, `startOnLoad: false`), exposes `renderMermaid(id, source)` returning `null` on parse/render failure.
- `web/src/components/MermaidView.tsx` — reusable `<MermaidView source fallback />` that renders SVG inline, swaps in the fallback node on parse/render failure, and shows a "Rendering diagram…" placeholder during the async render.
- shadcn `table` primitive added (used by Persistence + API).

### Tests

`pnpm -F @devmap/agent test` — 95 passed + 1 skipped (live LLM, gated by `RUN_LIVE_TESTS`). Frontend tests intentionally not added per PLAN.md §3.4 — manual click-through is the test, and the visual encoding is too design-coupled to lock in unit tests this phase.

### Acceptance — PLAN.md §2 Phase 4b

- ✅ All 5 tabs render with PetClinic data.
- ✅ "Open in VS Code" link in Components tab opens the file at the right line on the demo laptop (Cursor + Copy fallbacks present).
- ✅ Click-from-graph also works (covered in 4a; rootPath now threaded through so editor links land from there too).

### Notes for the screenshot pass

- All commits pushed; tag `phase-4b` set after this entry. Dev server is left running on `http://localhost:5173/` for the screenshot pass.
- `screenshots/phase-4b-{flow,persistence,api,components,events}.png` referenced in the Phase 4b brief intentionally not populated this phase per the modified flow agreement (no automated screenshots, no per-tab verification rounds). Real screenshots land in Phase 6 README polish.

## [0.4.0] — 2026-04-25 — **MVP cut line**

### Phase 4a — Frontend MVP: Vite + React Flow + Express

`devmap feature visits` now ends with a browser opened at `http://localhost:5173/` showing a polished dashboard. Two-process model: Vite serves the SPA on `:5173` with hot reload; Express serves the data API on `:3000`; Vite proxies `/feature.json` and `/repo/*` to Express so the SPA fetches same-origin URLs.

- **`packages/web/`** — shadcn/ui (Vite template, Radix base, Nova preset) + Tailwind v4 (`@tailwindcss/vite`). Six shadcn primitives installed: `sheet`, `button`, `input`, `select`, `card`, `badge`. Graph deps: `@xyflow/react` (React Flow v12), `dagre` + `@types/dagre`, `lucide-react`. `@/*` path alias wired in `tsconfig.app.json` and `vite.config.ts`. Vite config also proxies `/feature.json` and `/repo/*` to `:3000`.
- **`web/src/App.tsx`** — three-region layout: header (feature displayName + summary + microservice `Badge` chips with left-border accents from the stable palette), 48-px-wide left sidebar with 6 tabs (Workflow / GitGraph / Database / Network / Radio / LayoutGrid lucide icons), main panel routing to the active tab via `useState`. `useFeature()` hook in `lib/featureClient.ts` fetches `/feature.json` with loading + error states.
- **`web/src/tabs/Dependencies.tsx`** — the centerpiece. React Flow with custom `ServiceNode` (rounded card, simpleName lg, "<kind> · <microservice>" muted subtitle, 4 px left border in the microservice color, size scaled from `loc` clamped 100×40 → 200×80). `dagre` LR auto-layout on mount; users can still drag nodes. Microservice filter dropdown (top-right, shadcn `Select`) hides nodes from other services and prunes dangling edges. Click on a node opens the shadcn `Sheet` from the right with FQN, kind/microservice/core badges, summary, annotation list, public methods (signature + mapping annotation if any), file path. Edge styling lives in a single `EDGE_STYLES` const that node code, edge styling, and the in-canvas `EdgeLegend` all read from. Background grid + pannable+zoomable MiniMap + Controls.
- **`web/src/tabs/{Flow,Persistence,Api,Events,Components}.tsx`** — typed empty states (lucide icon + heading + one-line description from the brief + "Coming up — Phase 4b" footer), all rendered through a shared `TabPlaceholder` Card. Feels intentional, not broken.
- **`agent/src/serve.ts`** — `buildApp(feature, repoRoot)` Express factory with three routes: `GET /feature.json` (200 + `Cache-Control: no-cache` + JSON body), `GET /repo/*splat` (sendFile within repoRoot, path-traversal guard, stub for the Phase 4b "Open in VS Code" deep-links), `GET /health`. `startServer(opts)` listens Express, spawns Vite as a child process on `:5173` (`--strictPort` so port collisions fail loudly), waits for Vite to be ready, opens browser via the `open` package, returns a `stop()` that cleans up both. ESM-aware module location via `fileURLToPath(import.meta.url)`.
- **`agent/src/cli.ts`** — `feature <name>` default behavior is now: orchestrate → write `feature.json` → boot servers → open browser → wait for SIGINT. New flags: `--port-server <n>` (3000), `--port-web <n>` (5173), `--no-open` (server still runs, browser doesn't auto-open), `--no-serve` (Phase 3.5 behavior — exit after JSON write).

### Edge styling rule (documented as PLAN.md §1.4 didn't specify)

`EDGE_STYLES` const in `tabs/edgeStyles.ts` is the single source of truth. Color signals "crosses service boundary"; line style signals mechanism within cross-service:

| `edge.type`       | stroke              | width | dasharray |
|-------------------|---------------------|-------|-----------|
| `import`          | slate-400 (`#94a3b8`) | 1     | (solid)   |
| `http`            | indigo-500 (`#6366f1`) | 2.5   | (solid, animated) |
| `discovery`       | indigo-500 (`#6366f1`) | 2     | `6 4`     |
| `gateway-route`   | indigo-500 (`#6366f1`) | 2     | `2 4`     |

The in-canvas `EdgeLegend` (top-left of the Dependencies canvas) renders 4 mini line samples + names so judges read the encoding at a glance.

### Tests

`pnpm -F @devmap/agent test` — 95 passed + 1 skipped across 19 files (3 new in Phase 4a):

- `serve.test.ts` — 3 supertest cases: `/feature.json` shape, `/health` probe, `/repo/..` path-traversal rejection.
- Frontend tests intentionally not added per PLAN.md §3.4 — manual click-through is the test.

### Acceptance — PLAN.md §2 Phase 4a

- ✅ `pnpm devmap feature visits` ends with browser open at `http://localhost:5173/`.
- ✅ Dependencies tab renders with PetClinic data — 10 components + cross-service edges with distinct line styles.
- ✅ Click on `VisitResource` node → Sheet opens with the 3 endpoints visible (POST, GET, GET).
- ✅ Filter to `visits-service` hides api-gateway nodes and prunes their incident edges.
- ✅ Other tabs render typed `TabPlaceholder` cards (icon + heading + one-line description + "Coming up — Phase 4b") so the UI feels in-progress, not broken.

## [0.3.5] — 2026-04-25

### Phase 3.5 — Minimal LLM: per-component summaries

Replaces the `[summary pending — phase 3.5]` placeholder string on every component with a real Haiku-generated 1–2-sentence summary. Wall-clock end-to-end: ~3.2 s on a cold run with 10 components (live test 2.3 s for the LLM portion alone — under the 2 s ideal but well inside the 10 s budget).

- **`agent/src/llm/client.ts`** — `LlmClient` wraps `@anthropic-ai/sdk` with the four Phase 3.5 mandates: 429-retry exponential backoff (max 3 attempts, base 500 ms), `cache_control: { type: "ephemeral" }` injection on a passed-in `cachedSystem` string, `--no-llm` short-circuit (returns `null` from `complete()`), and a single-warning fallback when `ANTHROPIC_API_KEY` is missing. Key is read in the constructor so tests can `vi.stubEnv` + `delete process.env` and exercise the missing-key path correctly. `MODELS` const carries the IDs verified at https://platform.claude.com/docs/en/about-claude/models/overview on 2026-04-25 (`claude-sonnet-4-6` / `claude-haiku-4-5-20251001`).
- **`agent/src/llm/summarizeComponents.ts`** — renders `prompts/summarize-component.md` per component (template cached after first load), substitutes the eight `{{...}}` placeholders the template declares (FQN, simple name, kind, microservice, annotations, neighbors-from-imports, file snippet capped at 200 lines, feature name + summary). Concurrency cap of 10 via worker-pool over a shared queue. `trimSummary` strips wrapping quotes, collapses whitespace, truncates to ≤220 chars at a word boundary with `…`. Per-component failure (any throw after `LlmClient`'s own retries) is isolated: warn once, leave placeholder, continue — the whole-feature run never fails because of a single bad component.
- **`agent/src/orchestrator.ts`** — wires `summarizeComponents` between `buildComponents` and `FeatureSchema.parse`. `applySummaries(components, map)` immutably merges results in. `feature.summary` is intentionally left as a structural placeholder — Phase 5's `reconstructFlow` will regenerate it with cross-component narrative coherence (avoiding scope creep this phase).
- **`agent/src/cli.ts`** — `--no-llm` semantics inverted: now means "skip LLM" rather than "default behavior". LLM is the default. The dotenv loader at the top of cli.ts (committed in the env-hygiene step) reads `.env` from the workspace root via `INIT_CWD`, so `ANTHROPIC_API_KEY` lives in a single gitignored file rather than the user's shell profile.

### Env hygiene

- `.env.example` committed at the workspace root with empty `ANTHROPIC_API_KEY=` template (real `.env` is gitignored — confirmed by `git check-ignore -v .env` → `.gitignore:6:.env`).
- `dotenv` added as an `@devmap/agent` runtime dep; loaded at the very top of `cli.ts` before any module reads `process.env`. The loader resolves `.env` against `INIT_CWD` so `pnpm devmap …` invoked from the workspace root finds the right file even though pnpm flips cwd to `packages/agent`.

### Tests

`pnpm -F @devmap/agent test` — 92 passed + 1 live-skipped across 18 files (76 from earlier + 16 new):

- `client.test.ts` — 8 tests: the 5 mandated cases (success / 429-retry / 3-retry-cap / `--no-llm` / missing-key) plus `cache_control` wiring, non-429-no-retry, MODELS pin.
- `summarizeComponents.test.ts` — 7 tests: trimSummary + trimSnippet helpers; mocked-client distinct-output invariant; per-component-failure isolation; `--no-llm` short-circuit; parallel-wall-clock check (10 calls × 50 ms each finish under 300 ms — proves `Promise.all`).
- `featureVisits.phase3_5.integration.test.ts` — 2 cases: `[live]` end-to-end gated by both `ANTHROPIC_API_KEY` *and* `RUN_LIVE_TESTS` so `pnpm test --watch` doesn't burn credits; `[missing key]` uses both `vi.stubEnv` and `delete process.env` so dotenv's prior population doesn't mask the failure mode.

### Acceptance — PLAN.md §2 Phase 3.5

- ✅ `pnpm devmap feature visits --no-serve` ≈ 3.2 s (budget 10 s).
- ✅ Every component has a non-placeholder, length-bounded (≤220 chars) summary.
- ✅ `VisitResource.summary` ≠ `VisitsServiceClient.summary` — verified live and pinned by the integration test.
- ✅ `ANTHROPIC_API_KEY` missing → graceful fallback (single stderr warning, all summaries kept as placeholders, exit 0).

## [0.3.0] — 2026-04-25

### Phase 3 — Full feature.json with all structural views

`devmap feature visits` now produces a schema-valid `feature.json` with every structural view populated (no LLM yet — summaries and the flow narrative are placeholder strings replaced in Phase 3.5 / Phase 5). End-to-end on PetClinic: ~65 ms (budget: 8 s).

- **`packages/schema/src/feature.ts`** — every `z.unknown()` placeholder replaced with typed zod schemas matching the hand-written `feature.schema.json`. Worked example `examples/visits.feature.json` parses cleanly through `FeatureSchema.safeParse`. New `pnpm validate-schema <file>` script; `INIT_CWD` aware so it works from the workspace root.
- **`agent/src/views/components.ts`** — annotation-priority kind remap: `@RestController/@Controller → controller`, `@Service → service`, `@Repository|extends Repository → repository`, `@Entity → entity`, `@Configuration → config`, suffix `Application/Exception/Mapper/Client → application/exception/mapper/client`, `package contains .dto. → dto`, else `other`. Pinned by `VisitsServiceClient` (`@Component`, ends `Client`) → `client`. Filters `flags.bootstrap`, `flags.crossCutting`, and inner classes (FQN whose parent FQN is also a class). `core` flag set from Phase 2 lexical seed; expansion neighbors get `core: false` (so `CustomersServiceClient.core === false`, per the locked decision). Summary placeholder: `[summary pending — phase 3.5]`.
- **`agent/src/views/dependencies.ts`** — node-set is exactly the components array; edges are the Phase 1 indexer's edges filtered to ones touching the feature scope. `import` keeps both endpoints when both are components; `http`/`discovery` keep when source class is a component (preserves `sourceFile`/`sourceLine` for the future click-to-source); `gateway-route` keeps when either endpoint service contains a component.
- **`agent/src/views/endpoints.ts`** — one row per `@*Mapping` method on each in-scope controller. Class-level `@RequestMapping("/...")` is extracted live from the source file (Phase 1's parseClass intentionally captured only annotation names, not args — local extraction here avoids retrofitting). `gatewayPath` resolution: skip when component is in api-gateway; otherwise find the YAML route whose `target == component.microservice`, strip `Path=` and trailing `/**`/`/*`, prepend to the local path. Canonical visits result: `/pets/visits → /api/visit/pets/visits`.
- **`agent/src/views/persistence.ts` — DEMO CRITICAL.** Reads each in-scope `@Entity` source, walks the class body char-by-char with depth tracking, splits at depth-0 semicolons, and matches each chunk against `[modifiers]+ <type> <name>(=<init>)?` with `@`-prefixed lines as the field's annotations. Cross-service FK detection: field name ends in `Id`, type ∈ `{int, Integer, Long, long}`, simpleName-stripped-of-Id matches an `@Entity` in another microservice → `relation: { kind: "ForeignKeyByValue", target: "<Name> (<service>)", joinColumn: snake_case(field) }`. Visit.petId hits exactly: `Pet (customers-service) / pet_id`. Spring Data SQL inference is **hardcoded** for the four patterns visible in `VisitRepository` (`findByPetId`, `findByPetIdIn`, plus inherited `save` and `findById`); explicitly NOT a general parser per the Phase 3 brief. mermaidER emits one `<NAME> { type col tags }` block per in-scope entity plus a ghost `PET ||..o{ VISIT : "FK by petId (cross-service)"` line per FK-by-value field.
- **`agent/src/views/flow.ts`** — structural Mermaid `sequenceDiagram`. Picks an api-gateway controller named "Gateway" as the entry, walks one import-edge step at a time toward client/repository/controller neighbors, ducks out on cross-service `http`/`discovery` edges to dispatch into the target service's controller, and ends at a repository's owned entity. Steps array tracks each `->>` line. Narrative is the `Reconstruction pending — full narrative generated in Phase 5.` placeholder.
- **`agent/src/views/events.ts`** — hardcoded placeholder: `detected: false`, the 11-pattern grep checklist (`@KafkaListener`, `KafkaTemplate`, `@RabbitListener`, …), and the `VectorStoreController.loadVetDataToVectorStoreOnStartup` lifecycle-hook explanation copied verbatim from the worked example.
- **`agent/src/orchestrator.ts`** — `orchestrate({ feature, repo, depth, ... })` runs the index, runs the feature identifier, calls all six view builders, validates with `FeatureSchema.parse()`, and returns the artifact. Loads the api-gateway YAML routes once and threads them into `buildEndpoints`.
- **`agent/src/cli.ts`** — `feature <name>` now calls the orchestrator and writes `feature.json` (or stdout via `-o -`). Path resolution honors `INIT_CWD` so the file lands where the user invoked from. New flags `--depth <n>`, `-o, --output <file>`, `--no-llm` (default this phase), `--no-serve` (default this phase).

### Tech debt notes

- **Repository methods are extracted locally in persistence.ts**, not by retrofitting Phase 1's parseClass. Phase 1 only emits `@*Mapping`-annotated methods; a Repository interface declares plain methods. If a future view needs all-methods, retrofit parseClass then.
- **inferredSql is hardcoded** for the four patterns visible in VisitRepository. If owners feature in Phase 5 surfaces more Spring Data conventions (`findByXAndY`, `countBy*`, `existsBy*`, `deleteBy*`, …), extend then.

### Tests

`pnpm -F @devmap/agent test` — 76 vitest tests across 15 files (38 from Phase 1+2 stand; 38 new):

- `components.test.ts` — 13 tests: 9 viewKind cases including the locked annotation-priority pin (`VisitsServiceClient → client`, `@Service` wins over `*Client`); 4 buildComponents cases (locked-decision filters, inner-class drop, summary placeholder, CSC core===false).
- `dependencies.test.ts` — 4 tests: import-edge drop-out-of-scope, http source-must-be-component, gateway-route either-endpoint, nodes-mirror-components.
- `endpoints.test.ts` — 7 tests: gatewayPrefix stripping, resolveGatewayPath positive/null/null, extractClassBasePath, full VisitResource → 3 endpoints with `/api/visit/...` gateway paths.
- `persistence.test.ts` — 10 tests: camelToSnake / extractTableName / extractFields against real Visit.java fixture / detectFkByValue (4 cases including same-service-skip, no-match, non-FK type) / extractRepoInfo / extractInterfaceMethods against real VisitRepository.java / full buildPersistence end-to-end with petId FK and 4 operations.
- `flow.test.ts` — 2 tests: sequenceDiagram + arrow shape; empty-scope fallback.
- `events.test.ts` — 1 test: shape + schema validation.
- `featureVisits.phase3.integration.test.ts` — 1 test asserting every PLAN.md §2 acceptance bullet plus the demo-critical petId FK shape against the live PetClinic clone.

### Acceptance — PLAN.md §2 Phase 3

- ✅ `feature.json` validates against `FeatureSchema`.
- ✅ `pnpm devmap feature visits --no-llm --no-serve` ≈ 65 ms (budget 8 s).
- ✅ `components.length` = 10 (≥6); MetricConfig and `*Application` absent.
- ✅ `persistence.entities` contains Visit (table `visits`, 4 fields).
- ✅ `endpoints.length` = 4 (≥3) including the gateway-resolved `/api/visit/pets/visits`.
- ✅ Cross-service edge `api-gateway → visits-service` (gateway-route) present.
- ✅ `events.detected === false`.
- ✅ **Demo critical**: `Visit.petId.relation` = `{ kind: "ForeignKeyByValue", target: "Pet (customers-service)", joinColumn: "pet_id" }`.

## [0.2.0] — 2026-04-25

### Phase 2 — Feature identification by lexical match

`devmap feature <name>` replaces the Phase 0 placeholder. Walks the repo via the Phase 1 indexer, scores classes by lexical match, expands one or more hops along the class graph, prints sorted FQNs grouped by microservice. End-to-end on PetClinic: `feature visits` → 12 candidates, `feature owners` → 19 candidates, both <100 ms.

- `agent/src/feature/lexicalMatch.ts` — score = simpleName-contains-stem×3 + package-contains-stem×2 + relativePath-contains-stem×1. Stem strips a trailing `s` (so `visits → visit`, `owners → owner`). Threshold 1. Classes flagged `bootstrap` or `crossCutting` by the indexer are filtered **before** scoring per the locked decisions — they cannot enter the candidate set under any score.
- `agent/src/feature/expand.ts` — directed-graph BFS over a class adjacency built from three edge types:
  - `import` edges → both directions (symmetric).
  - `http` / `discovery` edges → source class ↔ controllers in target service (symmetric, controller-targeted, not service fan-out).
  - `gateway-route` edges → controller-in-target-service → origin class (asymmetric; origin is `pickGatewayOriginClass`, defaulting to api-gateway controllers whose simple name contains "gateway", else alphabetically-first controller).
- `agent/src/cli.ts` — new `feature <name>` action with `--repo <path>` and `--depth <n>` options. Prints a compact summary line (`N seed + M expanded = T candidates`) followed by per-service breakdowns.

### Two adjustments made during integration

These were pre-authorized fallbacks in the Phase 2 brief but worth surfacing here so future work understands the trade-offs.

1. **Default expansion depth = 2**, not 1. PLAN.md §2 specifies `default 1`, but at depth=1 `CustomersServiceClient` is unreachable from the `visits` lexical seed: the path is `seed → ApiGatewayController → CustomersServiceClient`, two hops. PLAN.md §2 also lists CSC as expected-periphery, contradicting itself. Bumping to depth=2 reconciles. The fan-out is controlled by the controller-targeting rule, so depth=2 doesn't pull in DTOs or non-controller siblings.
2. **Gateway-route adjacency is asymmetric** — controller-in-target-service → origin only, not bidirectional. With symmetric undirected edges at depth=2, the gateway acts as a 2-hop bridge between unrelated routed services (e.g. `visits-service VR → AGC → customers-service PetResource` would leak `PetResource`, which is in `expectedAbsent` for visits). Asymmetric preserves the "routed controller can step into AGC" semantic without bridging.

### Tests

`pnpm -F @devmap/agent test` — 38 vitest tests across 8 files:

- `lexicalMatch.test.ts` — 8 tests: 3 weight isolations, 2 flag pre-filters (bootstrap, crossCutting), threshold rejection, stem behavior, sort order.
- `expand.test.ts` — 5 tests: depth=1 vs depth=2 on a 3-node line graph, flagged-seed pruning, http edge controller-vs-DTO targeting, gateway-route asymmetric origin reachability with anti-bridge assertion, origin-heuristic fallback ordering.
- `featureVisits.integration.test.ts` — 1 test: against real PetClinic + `tests/fixtures/visits-ground-truth.json`, asserts `missingCore`, `missingPeriphery`, `leakedAbsent` are all empty.
- Plus 24 carry-over tests from Phase 1.

### Acceptance — PLAN.md §2 Phase 2

- ✅ `devmap feature visits`: 12 candidates spanning visits-service, api-gateway, genai-service. Lexical seed (9): Visit, VisitRepository, VisitResource, VisitsServiceClient, plus matching DTOs and inner records. Expanded (3): ApiGatewayController, CustomersServiceClient, OwnerDetails (api-gateway DTO). MetricConfig and VisitsServiceApplication absent.
- ✅ `devmap feature owners`: 19 candidates with the customers-service owners cluster fully visible (Owner, OwnerRepository, OwnerResource, OwnerEntityMapper, OwnerRequest), plus the api-gateway and genai-service classes that orchestrate owner lookups.

## [0.1.0] — 2026-04-25

### Phase 1 — Static indexer

`devmap index --repo <path>` walks a microservices repo and emits an `index.json` with classes, edges, and detected microservices. End-to-end on the PetClinic clone: 59 classes, 34 edges, 8 services in ~45 ms (budget: 3 s).

- `agent/src/index/scanFiles.ts` — recursive `.java` walker, skips `target/`, `test/`, `node_modules/`.
- `agent/src/index/parseClass.ts` — regex extractor producing one `ClassRecord` per top-level type and per nested type. Detects `kind` (`entity` / `repository` / `controller` / `configuration` / `application` / `other`) from annotations + name heuristics. Cross-cutting denylist seeded with `MetricConfig`; `flags.bootstrap` set on every `@SpringBootApplication`. Comment stripper is string-literal-aware — a naive `/\*…\*/` regex blanks a multi-line span when a path contains `/*/` (e.g. `@PostMapping("owners/*/pets/{petId}/visits")`).
- `agent/src/index/inferMicroservice.ts` — directory-based detection; `spring-petclinic-<name>` → `<name>`. Catches all 8 PetClinic services including the ones with no `@RestController` code (`config-server`, `discovery-server`, `admin-server`).
- `agent/src/index/edges.ts` — three cross-service extractors plus intra-service imports.
  - `http`: `(http|lb)://([a-z][a-z0-9-]+)` scan, guarded by string-aware comment stripping and brace-nesting depth ≥ 2 to avoid phantom edges from class-level constants and annotation defaults.
  - `gateway-route`: YAML parse of `api-gateway/application.yml` at `spring.cloud.gateway.server.webflux.routes[]`.
  - `discovery`: `discoveryClient.getInstances("name")` regex.
- `agent/src/index/runIndex.ts` — orchestrator wiring the four modules.
- `agent/src/cli.ts` — new `index --repo <path>` subcommand, `--output <file|->` option.

### Edge-type clarification

Cross-service connectivity is preserved across **three** distinct `edge.type` values (`http`, `gateway-route`, `discovery`) — the Phase 4 Dependencies view will style each differently, so we do not collapse them. The correct filter for "any cross-service relationship" is `from != to and type IN ("http", "discovery", "gateway-route")`. See ARCHITECTURE.md → "Edge types and their meaning" for examples (PetClinic's `api-gateway → visits-service` link surfaces only as `gateway-route`; `genai-service → customers-service` only as `discovery`).

### Tests

`pnpm -F @devmap/agent test` — 24 vitest tests across 5 files:

- `scanFiles.test.ts` — 3 tests: positive walk, skip-filter, <2 s perf budget on PetClinic.
- `parseClass.test.ts` — 6 tests: 5 fixtures copied verbatim from PetClinic (`Visit`, `VisitResource`, `VisitRepository`, `MetricConfig`, `VisitsServiceApplication`) + a string-aware comment-stripper test that pins the `/*/`-inside-strings regression.
- `inferMicroservice.test.ts` — 4 tests: synthetic 8-module repo, path mapping, null-outside-module, real-PetClinic 8-detection.
- `edges.test.ts` — 10 tests: 6 `http`/`lb://` snippet variants, 1 `discovery`, 2 YAML, 1 import.
- `runIndex.test.ts` — 1 integration test asserting all 3 cross-service edge types appear AND all 4 expected service pairs are covered (regardless of which `type` carries them).

Fixtures live under `tests/fixtures/java/` with a one-line README noting the Apache 2.0 origin.

### Acceptance — PLAN.md §2 Phase 1

- ✅ 8 microservices detected.
- ✅ `Visit`, `VisitRepository`, `VisitResource` present with correct annotations and kinds.
- ✅ `OwnerResource` lists 4 endpoints (POST, GET /{ownerId}, GET, PUT /{ownerId}).
- ✅ All four expected cross-service pairs reachable via `from != to and type IN (http,discovery,gateway-route)`.
- ✅ `MetricConfig` (×2: customers + visits services) and 8× `*Application` classes present in the index, properly flagged (`flags.crossCutting` / `flags.bootstrap`).
- ✅ Index runs in ~45 ms on PetClinic — well under the 3 s budget.

## [0.0.0] — 2026-04-25

### Phase 0 — Bootstrap

Monorepo skeleton, schema-typed, runnable `pnpm devmap` no-op.

- pnpm workspace at the repo root (`packages/*`), pnpm 10.33.2 pinned via `packageManager`.
- Three packages: `@devmap/schema`, `@devmap/agent`, `@devmap/web`.
- ESM everywhere (`"type": "module"` in all four `package.json` files); `tsconfig.base.json` uses `module: ESNext` + `moduleResolution: Bundler`.
- `@devmap/schema` exports a zod skeleton (`FeatureSchema`) and a `build` script that generates JSON Schema via `zod-to-json-schema`.
- `@devmap/agent` ships `src/cli.ts` (commander) with `feature <name>` subcommand printing a placeholder.
- `@devmap/web` scaffolded via Vite (`react-ts` template).
- Root `pnpm devmap` script forwards argv to the agent (`pnpm -F @devmap/agent run devmap`) — verified end-to-end.

### Acceptance — PLAN.md §2 Phase 0

```
$ pnpm devmap feature visits

> devmap@0.0.0 devmap /Users/hugonienhausen/Desktop/HackUPC/devmap
> pnpm -F @devmap/agent run devmap feature visits

> @devmap/agent@0.0.0 devmap /Users/hugonienhausen/Desktop/HackUPC/devmap/packages/agent
> tsx src/cli.ts feature visits

devmap feature: not implemented (requested feature: "visits")
```

Exit 0. Argv passthrough confirmed (the string `"visits"` reaches commander, not just empty argv).

### Web scaffold — path taken

**Fallback path used (not degit).** Verified `https://github.com/shadcn-ui/ui-react` returns HTTP 404 — the template repo named in PLAN.md does not exist. Took the bulletproof fallback (`pnpm create vite@latest web --template react-ts`) immediately rather than burning the 10-minute cap. **Tailwind + `shadcn init` are deferred to the start of Phase 4a** to keep Phase 0 inside its 1h hard-cap; the bare Vite+React+TS scaffold is sufficient for `pnpm install` to succeed.
