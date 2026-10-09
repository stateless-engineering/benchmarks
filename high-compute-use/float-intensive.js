#!/usr/bin/env node
/**
 * Benchmark: High-compute floating-point operations
 * Tests: Heavy math - sqrt, pow, sin, cos iterations
 */
'use strict';

const iterations = 5000000;
let sum = 0;

// Warm-up protocol (tighter-gate gap 2): run 1% of the iterations
// untimed first so V8's JIT tiers up (interpreter → sparkplug →
// turbofan) and the measured loop reflects steady-state throughput,
// not compilation cost.
const WARMUP = Math.floor(iterations * 0.01);
for (let i = 0; i < WARMUP; i++) {
  const x = i / WARMUP;
  sum += Math.sqrt(x) + Math.sin(x * Math.PI * 2) + Math.cos(x * Math.PI);
}
sum = 0; // discard warm-up accumulator

const start = performance.now();
for (let i = 0; i < iterations; i++) {
  const x = i / iterations;
  sum += Math.sqrt(x) + Math.sin(x * Math.PI * 2) + Math.cos(x * Math.PI);
  if (i % 100000 === 0) {
    const current = performance.now();
    if (current - start > 30000) break; // 30s cap
  }
}
const durationMs = Math.round(performance.now() - start);


console.log('RESULT_JSON', JSON.stringify({
  demo: 'high-compute-float',
  headline: `${iterations.toLocaleString()} float ops: ${durationMs}ms (${(iterations / (durationMs || 1)).toFixed(0)} ops/ms)`,
  durationMs,
  iterations,
  sum: Math.round(sum),
  opsPerMs: Math.round(iterations / (durationMs || 1)),
  warmup: { iterations: WARMUP, protocol: '1% untimed pre-run, accumulator discarded' },
  complexity: 'O(n)',
  result: 'high-compute-complete'
}));
