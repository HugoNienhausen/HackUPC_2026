# Changelog

All notable changes to devmap. Format loosely follows Keep a Changelog; phases match [PLAN.md](./PLAN.md).

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
