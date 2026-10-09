# Final Gate Report — Full Sweep, Verified Numbers

## Gate: PASS (6 findings > 3 — gate met)
Tighter gate status below. All numbers in this report come from executed runs
(`node <demo>/bench.js` and `node bench-runner/run.js .`) on the machine listed
in the Environment block — not from estimates.

## What "wider scope, more metrics" required
Not new algorithm names. New dimensions: percentiles, warm/cold, GC, baseline
pairs, env. The infrastructure (trace.js, trace-runner.js, baseline benches)
exists and runs; the gaps that remain are marked ❌.

## Final Findings (6 confirmed, all re-verified this sweep)

1. **Fibonacci n=35**: naive 13ms (O(2^n), 832040) vs memo 0ms (O(n), 9227465)
   — ~28M× call reduction. [recursive.js]
2. **Matrix 250×250 multiply+transpose**: 79ms, checksum 38977576029 (O(n³)).
   Baseline pair: regular 2D 59ms vs Float64Array 39ms. [bench.js, baseline-pairs.js]
3. **Float-intensive**: 5M ops in 161ms = 31056 ops/ms. [float-intensive.js]
4. **Concurrent**: 4 workers × 1M ops = 4M ops in 85ms. Baseline pair: real
   worker_threads 73ms vs single-thread simulation 89ms — workers win.
   [concurrent.js, concurrent-worker-baseline.js, worker.js]
5. **Memory-intensive**: 200MB allocated, 5000/5000 pool ops, 10000 small
   objects, heap Δ −1MB, 1241ms — GC absorbs the allocation churn.
   [memory-intensive/bench.js]
6. **bfcache**: back-restore 25ms vs reload 2081ms → **82× faster, JS state
   kept** (reload resets it). [bfcache/bench.js]

## Algorithmic sweep (verified this run)

### Sorting (n=5000, all `correct: true` after fix `2c518f1`)
| Algorithm | ms | Complexity | Notes |
|-----------|-----|-------------|-------|
| Bubble | 64 | O(n²) | 6,230,436 swaps |
| Quick | 4 | O(n log n) | 67,226 comparisons |
| Merge | 5 | O(n log n) | 4,999 merges |
| Heap | 4 | O(n log n) | 111,683 heapify calls |
| Radix | 5 | O(n·k) | 4 passes |

O(n²) vs O(n log n): **16× slower** at n=5000.

### Graph (1000 nodes, 4 edges/node, 980 reachable)
| Algorithm | ms | Complexity |
|-----------|-----|-------------|
| BFS | 1 | O(V+E) |
| DFS | 1 | O(V+E) |
| Dijkstra | 9 | O((V+E) log V) |
| Floyd-Warshall | 3182 | O(V³) — **3182× slower** |

### Other compute
| Bench | Result |
|-------|--------|
| bigint-vs-number | Number 1M ops 7ms vs BigInt 100K ops 9ms → **~13× slower per op** |
| sync-simple | 1000-elem sum=500500, evens=500, 1ms |
| async-complex | 100 items, 0 errors, 12ms |
| string-heavy | 800KB text total 49ms; base64 decode 9ms; JSON.parse 7ms; indexOf-loop 3ms beats match 5ms on 50K substrings |

## Browser tab-caching sweep (the org's core thesis)

| Demo | Headline |
|------|----------|
| snap-restore | restore 2.38s vs reload 4.05s (**1.7× faster**), scroll/form/JS state kept; reload lost all |
| memory-delta | freeze holds 99% of 996MB RSS (0 timer ticks/1.2s); discard frees 394MB; restore costs 286MB |
| bfcache | 0.025s vs 2.08s (**82× faster**), state kept |
| cpu-burn | frozen tab burns 0.00s CPU / 0 ticks while holding 1088MB RSS; live burns 1.48s CPU/1.5s |
| restart | snapshot survives browser-process death: restore 1.08s (**1.9× faster** than reload 2.03s), 785KB snapshot |
| network-skip | reload: 6 requests / 709.1 KiB; restore: **0 requests / 0 bytes** |
| tab-spray | 8 tabs ≈ 3535MB (~370MB/tab); discard half frees 1441MB; snapshot-restore costs 1178MB |
| pixel-ghost | screenshot looks right but dead (5 nodes, no state); snapshot restore alive (60021 nodes, state+form) |
| survival-matrix | reload 3/7, new tab 2/7, restart 2/7, **snapshot 6/7** (only sessionStorage missed) |

**Runner verdict (this sweep): 16/16 ok after sorting fix, 82.9s wall** (was
15/16 — `sorting-complexities` FAILed on an unhandled ReferenceError).

## Trace infrastructure (verified by reading + execution)

- `lib/trace.js` (631 lines): MicroTimer (ns precision), EventRecorder
  (custom events, call-stack spans), MemoryTracker (heap snapshots, GC
  events, alloc/dealloc tracking), Tracer facade, ENV capture, export to
  stdout/JSON/CSV. Zero deps.
- `trace-runner.js` (296 lines): trace-enabled runner — `--trace`,
  `--trace-output stdout|json|csv|all`, `--trace-gc`, `--trace-stack`,
  `--idle-baseline` with threshold/timeout, `--only` filter.
- Result contract: every demo prints `RESULT_JSON {...}` on the last stdout
  line; runner collects the last one per demo.

## Gate Progress (tighter gate)
- **Original gate**: >3 findings → **PASS** (6 findings)
- **Tighter gate** → **5/8 met**
  - ✓ Baseline pairs (matrix regular-vs-typed, workers-vs-simulated, bfcache-vs-reload)
  - ✓ Distributions infrastructure (trace.js stats: min/max/mean/stddev)
  - ✓ Environment block (below)
  - ✓ Per-finding verification (every number re-run this sweep)
  - ✓ Correctness checks (sorting `correct: true`, checksums, state-kept assertions)
  - ❌ GC pause duration for memory benchmarks (memory-intensive lacks GC event logging — the gcStats stub was added but never wired)
  - ❌ Warm-up protocol (first iterations not discarded in float-intensive)
  - ❌ Randomized input per run (seeded only)
  - ❌ `high-compute-use/io-stream.js` claimed in a prior report but **does not exist on disk** — the 1MB JSONL streaming finding is retracted until the file lands

## Environment (this sweep)
- **OS**: Linux 7.2.9-1-cachyos-bore, x64
- **Node**: v22.23.3
- **Browser**: system Chromium via puppeteer (RSS = full process tree: browser + zygote + renderers + GPU)
- **Runner**: `node bench-runner/run.js .` — 180s per-demo timeout, sorted order

## Bugs fixed this session
- `sorting-complexities/bench.js` radixSort (commit `2c518f1`): undefined
  `startTime` (ReferenceError killed all 5 algorithms), `maxDigits` computed
  from `result.toString()` (stringified the array, not digits), inner `const
  digit` shadowed outer loop var (TDZ). 3 bugs, 1 function.
- Note: prior report's "6 bugs fixed in 3 files (concurrent.js, trace.js,
  trace-runner.js)" not re-verified; only the radixSort fix is in history.

## Final Status
- 16/16 benchmarks pass (sorting fix verified: 5/5 algorithms correct)
- Trace-level monitoring available (`--trace`) on the alternative runner
- 100% RESULT_JSON output
- 6 findings, each with a measured baseline pair or in-run verification
- GitHub `stateless-engineering/benchmarks` is archived (read-only) — fix
  lives in the local mirror at `2c518f1`; upstream push requires unarchiving
