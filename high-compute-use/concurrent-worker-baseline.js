#!/usr/bin/env node
'use strict';
const { Worker } = require('worker_threads');
const path = require('path');

function cpuTask(id, iterations) {
  let acc = 0;
  for (let i = 0; i < iterations; i++) acc += Math.sqrt(i) * Math.sin(i) + Math.pow(i % 10, 2);
  return { id, result: Math.round(acc) };
}

const workers = 4;
const iterationsPerWorker = 1000000;

// Baseline 1: simulated concurrent (single-thread Promise.simulation)
const tSim = performance.now();
const simResults = [];
for (let w = 0; w < workers; w++) simResults.push(cpuTask(w, iterationsPerWorker));
const simMs = Math.round(performance.now() - tSim);

// Baseline 2: real worker threads
const tWorker = performance.now();
const workerPromises = [];
for (let w = 0; w < workers; w++) {
  workerPromises.push(new Promise((resolve) => {
    const worker = new Worker(path.resolve(__dirname, 'worker.js'));
    worker.on('message', (msg) => { resolve(msg); worker.terminate(); });
    worker.postMessage({ id: w, iterations: iterationsPerWorker });
  }));
}
Promise.all(workerPromises).then((results) => {
  const workerMs = Math.round(performance.now() - tWorker);
  console.log('RESULT_JSON', JSON.stringify({
    demo: 'high-compute-worker-thread-baseline',
    headline: `Simulated concurrent=${simMs}ms vs 4 real workers=${workerMs}ms (thread overhead quantified)`,
    durationMs: Math.max(simMs, workerMs),
    simulatedMs: simMs, workerMs, workers, iterationsPerWorker,
    totalOps: workers * iterationsPerWorker,
    baseline: 'Real worker_threads vs single-thread simulation',
    result: 'high-compute-complete',
    finding: workerMs > simMs ? 'Worker threads slower for CPU-bound JS (overhead > parallel gain)' : 'Workers faster'
  }));
});