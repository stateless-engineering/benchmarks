# demos

Browser tab caching optimization demos — Puppeteer-based hibernation & restore benchmarks.

## Concept

Browsers don't cache the full rendered state + JavaScript runtime of a background tab
to allow instant restore without a full reload. This repo demonstrates the gap:

- **Snap**: capture DOM, scroll position, form values, and shallow JS state from a live tab
- **Kill**: close the tab process (free memory)
- **Restore**: spin up a new tab and replay the snapshot — skipping network, parse, and layout

## Demos

| Demo | What it shows |
|------|--------------|
| `snap-restore/` | Basic DOM snapshot + restore via Puppeteer |
| `memory-delta/` | Pre/post memory metrics: full reload vs restore |
| `heavy-spa/` | Realistic heavy SPA benchmark (dashboard, data grid) |

## Quick start

```bash
npm install
node snap-restore/bench.js
```

## Organization

[stateless-engineering](https://github.com/stateless-engineering)
