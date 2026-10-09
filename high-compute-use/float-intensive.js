#!/usr/bin/env node
/**
 * Benchmark: High-compute floating-point operations
 * Tests: Heavy math - sqrt, pow, sin, cos iterations
 */
'use strict';

const iterations = 5000000;
let sum = 0;

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
  complexity: 'O(n)',
  result: 'high-compute-complete'
}));
