# demos

Browser tab caching optimization demos — Puppeteer-based hibernation & restore benchmarks.
Every demo is stateless: fresh browser on an ephemeral port, temp files cleaned up, nothing
left behind (see the workspace rule in `../AGENTS.md`).

## Concept

Browsers don't cache the full rendered state + JavaScript runtime of a background tab
to allow instant restore without a full reload. This repo demonstrates the gap:

- **Snap**: capture DOM, scroll position, form values, and shallow JS state from a live tab
- **Kill**: close the tab process (free memory)
- **Restore**: spin up a new tab and replay the snapshot — skipping network, parse, and layout

## Demos

| Demo | What it shows |
|------|--------------|
| `snap-restore/` | Full reload vs snapshot restore: time, JS heap, scroll/form/JS-state preservation |
| `memory-delta/` | Lifecycle memory spectrum: live → frozen → discarded → restored, process-tree RSS |
| `bfcache/` | Real back/forward cache: instant back-nav keeps JS state; reload resets it |
| `cpu-burn/` | Live tab burns renderer CPU; freezing zeroes it while holding all memory |
| `restart/` | Hibernate the whole browser: snapshot to disk, kill the process, restore in a new one |
| `survival-matrix/` | What survives reload / new tab / browser restart / snapshot restore |
| `network-skip/` | Reload re-downloads the 700 KiB dataset; restore fetches 0 bytes |
| `tab-spray/` | 8 heavy tabs ≈ 3.1 GB; the discard lever and the snapshot-restore cost at scale |
| `pixel-ghost/` | Caching pixels looks right but is dead; snapshot restore is the same page, alive |

## Quick start

```bash
npm install puppeteer
npm run bench:all          # run every demo through the bench-runner
# or individually:
npm run bench              # snap-restore
npm run bench:memory
npm run bench:bfcache
npm run bench:cpu
npm run bench:restart
npm run bench:survival
npm run bench:network
npm run bench:tabs
npm run bench:pixel
```

The demos prefer a system Chromium (`/usr/bin/chromium`, `google-chrome`, …) so they run
with no browser download on most machines; they fall back to Puppeteer's bundled Chrome,
then `chrome-headless-shell`.

## The runner

`npm run bench:all` invokes [bench-runner](https://github.com/stateless-engineering/bench-runner),
a stateless CLI pinned as a git submodule (zero deps, no config/cache/result files, argv in /
stdout out / exit code as verdict). Clone with `--recurse-submodules` or
`git submodule update --init`. Each demo reports a machine-readable `RESULT_JSON` line that
the runner aggregates into the summary table.

## Sample output

```
=== summary ===
demo             | dur     | status | headline
-----------------+---------+--------+---------------------------------------------
bfcache          |   4.9s | ok    | back via bfcache 0.026s (79x faster than reload's 2.08s), JS state kept
cpu-burn         |   6.4s | ok    | live tab burned 1.50s CPU in 1.5s of work; frozen burned 0.00s
memory-delta     |   7.7s | ok    | freeze holds 99% of 1046 MB RAM; discard frees 444 MB
network-skip     |   7.1s | ok    | reload: 6 requests / 709.0 KiB; restore: 0 requests / 0.0 KiB
pixel-ghost      |   4.3s | ok    | pixel ghost is dead (5 nodes); snapshot restore is alive (60021)
restart          |   9.9s | ok    | snapshot survives process death: restore 1.49s vs reload 2.07s
snap-restore     |   6.2s | ok    | restore 3.0x faster, state kept; reload lost it
survival-matrix  |  13.0s | ok    | reload keeps 3/7, new tab 2/7, restart 2/7, snapshot 6/7
tab-spray        |  30.8s | ok    | 8 tabs ≈ 3139 MB; discarding half frees 1704 MB
total: 9/9 demos ok
```

All demos share helpers in `lib/common.js` (system-Chromium launch, fixture server with a
700 KiB dataset payload, tree-RSS via `/proc`, snapshot/restore) and a heavy fixture that
fetches its dataset over the network like a real app.

## Organization

[stateless-engineering](https://github.com/stateless-engineering)
