# devmap — Risks and Mitigations

Hackathon-scoped risk log. Long-term project risks are out of scope.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | LLM call exceeds the 30s budget during a live demo | Medium | Demo-killing | Pre-warm `demo/cache/visits.json` and `demo/cache/owners.json` and commit them. Run `--airplane` mode by default during demo (`pnpm demo` does this). Live LLM is shown only as a separate "watch this run cold" beat with a clear message that it usually completes in 10–15s. |
| 2 | Regex parser misses some PetClinic edge case (e.g., multi-line annotation) and the components list is incomplete | Medium | Demo flaw, judges notice | Add `java-parser` (npm) as a fallback for files where regex extracts <2 annotations but file has `@` lines. Test against ALL PetClinic Java files in Phase 1, not just visits, to flush issues early. |
| 3 | React Flow layout is ugly out-of-the-box (nodes overlap, edges cross) | High | Aesthetic — judges score on this | Use `dagre` layout (well-supported by React Flow) with hierarchical direction = LR. Spend ≤30 min tuning node spacing. If still ugly: pre-position nodes manually for the visits demo and store positions in the JSON. |
| 4 | Mermaid sequenceDiagram from Sonnet has syntax errors and doesn't render | Medium | One tab broken | Validate Mermaid output with the `mermaid` library's parser BEFORE writing to JSON. If invalid, fall back to a structural sequence built deterministically from `flow.steps`. The JSON always has a renderable `mermaid` field. |
| 5 | Node 20 + pnpm workspace + shadcn first-time setup eats Phase 0's budget | Medium | Drains Phase 0 | Bootstrap from a known-good template: `degit shadcn-ui/ui-react` for the web package, manual `package.json` for agent. Cap Phase 0 at 1h hard; if exceeded, abandon shadcn for plain Tailwind. |
| 6 | "Open in VS Code" deep-link doesn't work cross-platform | Low | One demo beat fails | Test on the demo laptop in Phase 4b. If `vscode://` URI doesn't trigger, fall back to `cursor://` or display the absolute path with a "copy" button. Keep both code paths. |
| 7 | The judges ask "does it work on a non-Spring repo?" | High (it's an obvious question) | Credibility | Have the answer ready: "Today it's tuned for Spring Boot — that's the demo target. The architecture is designed so detectors are pluggable: we have a Spring detector; an Express detector or Django detector is roughly two days of work each. The artifact schema is framework-neutral." Don't claim more than this. |

## Cut order (when buffer gets eaten)

Drop in this sequence, never out of order:

1. Phase 6 README screenshots → Phase 6 hover tooltips.
2. Phase 4b Events tab → Components tab → API tab. (Stop ASAP — Flow + Persistence are the demo wow beats.)
3. Phase 5 reconstructFlow narrative (fall back to deterministic structural narrative from edges).
4. Phase 5 identifyFeature (fall back to lexical scoring; all components get `core: true` if they pass lexical match).
5. **Last resort**: cut Phase 4b entirely. Phase 4a alone (Dependencies tab) is still demoable.
