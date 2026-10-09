#!/usr/bin/env node
/**
 * sync-simple/bench.js
 *
 * Benchmark: Synchronous array operations - demonstrates baseline CPU performance.
 * Tests: Array iteration, map, filter, reduce operations on a moderately-sized dataset.
 *
 * Complexity: Simple (O(n) single pass operations)
 */
'use strict';

const { emitResult } = require('../lib/common');

// Generate test data: 1000 numbers
const DATA = Array.from({ length: 1000 }, (_, i) => i + 1);

// Stage 1: Sum (reduce)
async function stage1() {
  const t0 = performance.now();
  const sum = DATA.reduce((a, b) => a + b, 0);
  const ms = performance.now() - t0;
  return { ms, sum, iterations: DATA.length };
}

// Stage 2: Filter even numbers
async function stage2() {
  const t0 = performance.now();
  const evens = DATA.filter(n => n % 2 === 0);
  const ms = performance.now() - t0;
  return { ms, count: evens.length };
}

// Main benchmark
async function main() {
  const start = performance.now();
  
  const r1 = await stage1();
  const r2 = await stage2();
  
  const durationMs = performance.now() - start;
  emitResult({
    demo: 'sync-simple',
    durationMs: Math.round(durationMs),
    sum: r1.sum,
    evenCount: r2.count,
    headline: `1000-element array: sum=${r1.sum}, evens=${r2.count}, total=${Math.round(durationMs)}ms`
  });
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});