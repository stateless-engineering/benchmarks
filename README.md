# demos

Browser tab caching optimization demos — Puppeteer-based hibernation & restore benchmarks.

## Concept

Browsers don't cache the full rendered state + JavaScript runtime of a background tab
to allow instant restore without a full reload. This repo demonstrates the gap:

- **Snap**: capture DOM, scroll position, form values, and shallow JS state from a live tab
- **Kill**: close the tab process (free memory)
- **Restore**: spin up a new tab and replay the snapshot — skipping network, parse, and layout

## Demos

| Demo | What it shows | Status |
|------|--------------|--------|
| `snap-restore/` | Full reload vs snapshot restore: time, JS heap, scroll/form/JS-state preservation | implemented |
| `memory-delta/` | Pre/post memory metrics across the spectrum (live → frozen → discarded) | planned |
| `heavy-spa/` | Realistic heavy SPA benchmark (dashboard, data grid) | planned |

## Quick start

```bash
npm install puppeteer
node snap-restore/bench.js
```

The bench prefers a system Chromium (`/usr/bin/chromium`, `google-chrome`, …) so it
runs with no browser download on most dev machines; it falls back to Puppeteer's
bundled Chrome, then `chrome-headless-shell`.

Sample output (CachyOS, Chromium 150, 12th-gen i7):

```
metric             | full reload        | snapshot restore
--------------------+--------------------+--------------------
tab back in         | 4.73s             | 2.54s
JS heap (settled)   | 1.72 MB           | 3.01 MB
scroll position     | 0px               | 4000px
form value (#name)  | ""                | "hibernated-user"
JS runtime state    | {"visits":1,"token":"fresh",...}| {"visits":99,"token":"mutated-by-user",...}

verdict: full reload LOST the JS state; restore kept it and was 1.9x faster
```

## Organization

[stateless-engineering](https://github.com/stateless-engineering)
