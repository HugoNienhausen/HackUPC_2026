# devmap — 5-Minute Demo Script

> **Demo machine**: laptop with terminal pre-positioned next to a browser. PetClinic clone at `~/Desktop/spring-petclinic-microservices/` (only needed for the *live* spinner cameo at [4:15]). `demo/cache/visits.json` and `demo/cache/owners.json` are committed and used by `pnpm demo` — no Wi-Fi or API key required for the recorded run.

---

## Beat-by-beat

### [0:00 — 0:30] — Setup the pain (30s)

> "Imagine your first day on a polyglot microservices codebase. You open it. Eight services. Forty-something classes. Your tech-lead says: 'Get familiar with the visits feature.' You'd usually spend two hours opening files and drawing arrows on paper."

(Show VS Code with PetClinic open, file tree expanded — visual chaos.)

### [0:30 — 0:45] — One command (15s)

> "devmap turns those two hours into ten seconds."

Type and run:

```
$ pnpm demo
```

(Browser opens at `http://localhost:5173/` in under 3 seconds; airplane-mode loads the pre-warmed cache, no spinner needed. The live-run spinner phases — `Scanning Java sources`, `Identifying components`, `Building dependency graph`, `Detecting persistence model`, `Generating component summaries (Claude Haiku, parallel)`, `Reconstructing request flow (Claude Sonnet)` — are demonstrated separately at [4:15].)

### [0:45 — 1:30] — Flow tab — the wow shot (45s)

> "Here's the full request flow. From the gateway, through both inter-service hops — customers to get the pet IDs, visits to fetch the actual records — down to the SQL query that hits the database."

(Mermaid sequence diagram visible. Read the narrative paragraph aloud — it's 4 sentences from Sonnet.)

### [1:30 — 2:30] — Dependencies tab — interactivity (60s)

> "Same data, structural view. Each microservice is a color. Node size is lines of code."

(Click on `VisitResource`. Side panel slides in.)

> "Click any class — annotations, public methods, summary written by Claude. And from here…"

(Click "Open in VS Code". VS Code jumps to file:line.)

> "…straight into the editor at the right line."

(Back to graph. Filter dropdown.)

> "Filter by microservice — let's see only what api-gateway contributes."

(Graph shrinks to gateway nodes.)

### [2:30 — 3:15] — Persistence tab — the cross-service FK reveal (45s)

> "Persistence view. Visit lives in its own database. But notice — Visit references Pet by integer petId, no JPA relationship. devmap detects this and labels it a cross-service foreign key by value. That's the kind of architectural decision new engineers usually miss."

(Highlight the dotted line in the ER diagram between VISIT and PET.)

> "And the inferred SQL — derived from the Spring Data method names."

(Show `findByPetIdIn` → `WHERE pet_id IN (...)`.)

### [3:15 — 3:45] — API tab + Events tab (30s)

(Click API.)

> "Every endpoint exposed by the feature, including the gateway path."

(Quick scroll.)

(Click Events.)

> "And devmap is honest: PetClinic has zero asynchronous messaging. The tool tells you so, and lists the patterns it scanned for. If you adopt Kafka tomorrow, this view populates automatically."

### [3:45 — 4:15] — Second feature, fast (30s)

> "Switch features in one command."

```
$ pnpm demo:owners
```

(Different feature loads — different graph, different ER, different endpoints. Demonstrates generality.)

### [4:15 — 4:45] — How it works — under the hood (30s)

(Cut to a second terminal showing the live spinner from a `--refresh` run on PetClinic.)

> "Two pieces. A static indexer that walks the Java source — regex-fast, no JVM needed. And targeted Claude calls: Sonnet picks the core components and writes the flow narrative; Haiku summarizes each class in parallel. Total: under 25 seconds cold, under 8 with cache."

### [4:45 — 5:00] — Close (15s)

> "It's a CLI. It's open source. It works on any Spring Boot repo, today, with no setup. devmap — feature documentation that isn't outdated the moment you open the file."

---

## Demo failure modes & rehearsed recovery

| If… | Do… |
|---|---|
| WiFi drops during live run | Quietly run `devmap feature visits --airplane` (cached). Same UX, no LLM call. |
| LLM call exceeds 20s | Have `Cmd+T` second terminal ready running `devmap feature visits --airplane` in parallel; cut to it. |
| Vite hot-reload hiccup | Refresh the browser tab. UI is read-only against a static file — nothing breaks. |
| Mermaid render fails | Pre-record a 30-second screen capture of the working Flow tab. Cut to it. |

---

## Pre-demo checklist

- [ ] `pnpm demo` runs cold-terminal-to-browser in <5s.
- [ ] `pnpm demo:owners` works for the second feature beat.
- [ ] PetClinic clone present at `~/Desktop/spring-petclinic-microservices/`.
- [ ] VS Code installed and `vscode://file/...` URIs work (test on the demo laptop).
- [ ] Browser zoom set so graph and Mermaid diagrams are legible from the back row.
- [ ] Terminal font size bumped — judges read along.
- [ ] Backup screen recording of full demo, in case all live runs fail.

---

## Demo recording — instructions

**Before pressing record:**

1. **Clear browser state.** Quit the browser fully and reopen — clears DevTools state and any leftover hot-reload sockets from rehearsal. Open one window with two tabs: `about:blank` (so the auto-opened tab gets a clean slot) and a backup tab pointed at `http://localhost:5173/` for the recovery cut.
2. **Pre-warm both demo caches.** Run `pnpm demo` and `pnpm demo:owners` once each. Confirm browser opens, all six tabs render without "ER diagram failed to render" or any console errors. Quit both servers (Ctrl+C in their terminal).
3. **Pre-test the spinner cameo.** In the `[4:15]` cutaway you show the live ora spinner. Run `pnpm devmap feature visits --refresh` once *with internet on* before recording — confirm all six phase spinners render and the run completes in <25s. (If the API key is missing, the spinners still run but fall back to placeholders — visually fine.)
4. **Window layout.** Browser at full screen on the primary display (1440×900 minimum). Terminal as a 100×30 floating window in the lower-right quadrant — large enough to read the spinner, small enough that judges' eyes stay on the dashboard. Terminal font ≥18pt; OS dark mode on for both.
5. **Stopwatch.** Phone running a stopwatch app, visible to you off-camera. Beat boundaries are tight: any beat that overruns its slot eats into the next.

**Order of operations once recording:**

`pnpm demo` → click through Flow → Dependencies → Persistence → API → Events tabs in the order in the script → quit (Ctrl+C) → `pnpm demo:owners` → switch back to terminal for the live-spinner cameo (`pnpm devmap feature visits --refresh`) → close.

**Recovery cuts (rehearse these):**

- If `pnpm demo` doesn't open the browser within 5s → switch to the pre-loaded backup tab; nothing visible to the audience changes.
- If a Mermaid diagram falls back to the amber error card → narrate over it ("the operations table below carries the join you need to see") and continue. Do *not* refresh — `mermaid.parse` is deterministic on a given source string.
