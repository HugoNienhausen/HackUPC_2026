# Screenshots

The README and DEMO.md reference four screenshots from the dashboard. Capture them at 1440×900 (or higher) with the browser zoom tuned so judges in the back row can read labels:

| File | Tab | Feature loaded |
|---|---|---|
| `dependencies.png` | Dependencies | `visits` — full graph, no filter, EdgeLegend visible |
| `flow.png` | Flow | `visits` — narrative + Mermaid sequenceDiagram + numbered timeline |
| `persistence.png` | Persistence | `visits` — cross-service FK callout + ER diagram + operations table |
| `components.png` | Components | `visits` — card grid with `core` badges visible |

Capture procedure (any feature):

```bash
pnpm demo                  # opens http://localhost:5173/
# Click each tab in order, screenshot, save to screenshots/<name>.png
```

These files are referenced by [../README.md](../README.md). Broken image links there indicate this directory has not been populated yet.
