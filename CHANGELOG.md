# Changelog

All notable changes to devmap. Format loosely follows Keep a Changelog; phases match [PLAN.md](./PLAN.md).

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
