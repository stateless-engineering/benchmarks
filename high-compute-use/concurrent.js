#!/usr/bin/env node
/**
 * Benchmark: High-compute concurrent workload
 * Tests: Parallel CPU-bound tasks using workers logic (simulated)
 */
'use strict';

function cpuTask(id, iterations) {
  let acc = 0;
  for (let i = 0; i < iterations; i++) {
    acc += Math.sqrt(i) * Math.sin(i) + Math.pow(i % 10, 2);
  }
  return { id, result: Math.round(acc) };
}

const workers = 4;
const iterationsPerWorker = 1000000;
const start = performance.now();
const results = [];

// Simulate concurrent execution by processing sequentially with timing
for (let w = 0; w < workers; w++) {
  results.push(cpuTask(w, iterationsPerWorker));
}

const durationMs = Math.round(performance.now() - start);
const totalOps = workers * iterationsPerWorker;

console.log('RESULT_JSON', JSON.stringify({
  demo: 'high-compute-concurrent',
  headline: `${workers} workers × ${iterationsPerWorker.toLocaleString()} ops = ${totalOps.toLocaleString()} ops in ${durationMs}ms`,
  durationMs,
  workers,
  iterationsPerWorker,
  totalOps,
  opsPerMs: Math.round(totalOps / (durationMs || 1)),
  complexity: 'O(n) parallelizable',
  result: 'high-compute-complete'
}));
