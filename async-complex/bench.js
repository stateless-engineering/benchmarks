#!/usr/bin/env node
/**
 * async-complex/bench.js
 *
 * Benchmark: Asynchronous operations with multiple concurrent tasks
 * Tests: Promise chaining, parallel operations, async iteration, and complex data transformations.
 *
 * Complexity: Complex (O(n²) async operations, Promise.all, complex data flow)
 */
'use strict';

const { emitResult } = require('../lib/common');

const DATA = Array.from({ length: 100 }, (_, i) => (
  { id: i, value: Math.random() * 100, nested: { a: 1, b: 2, c: { deep: { val: Math.random() * 10 } } } }
));

// Complex async function with multiple stages
async function complexTransform(data) {
  // Stage 1: Complex async processing with multiple transformations
  const processed = await Promise.all(data.map(async (item, idx) => {
    await new Promise(resolve => setTimeout(resolve, 1)); // Simulate async work
    
    const intermediate = {
      id: item.id,
      processed: true,
      squared: item.value * item.value,
      transformed: item.nested.c.deep.val + idx,
      timestamp: Date.now(),
      checksum: Object.entries(item).reduce((hash, [k, v]) => {
        return hash + JSON.stringify(v);
      }, ''),
      nested: item.nested
    };
    
    // Deep recursive transformation
    const deepTransform = (obj, depth) => {
      if (depth <= 0) return obj;
      return {
        ...obj,
        processedAt: Date.now(),
        nested: depth > 1 ? deepTransform(obj.nested || obj, depth - 1) : obj.nested || obj
      };
    };
    
    return deepTransform(intermediate, 3);
  }));
  
  // Stage 2: Complex aggregation and reduction
  const aggregated = await Promise.all([
    // Large async aggregation
    (async () => {
      const results = await Promise.all(processed.map(item => 
        new Promise(resolve => setTimeout(() => {
          resolve({
            totalValue: item.squared * item.transformed,
            checksumLength: item.checksum.length,
            depthSum: JSON.stringify(item.nested).length / 10
          });
        }, Math.random() * 10))
      ));
      
      return results.reduce((sum, item) => sum + item.totalValue + item.checksumLength + item.depthSum, 0);
    })(),
    
    // Parallel independent computation
    Promise.all([
      Promise.resolve(processed.filter(item => item.id % 2 === 0).length),
      Promise.resolve(processed.map(item => item.value).reduce((a, b) => Math.abs(a - b), 0)),
      Promise.resolve(processed.some(item => item.processed === true).length)
    ])
  ]);
  
  // Stage 3: Complex async error handling and recovery
  const errorHandled = await Promise.race([
    Promise.resolve({
      status: 'success',
      dataCount: processed.length,
      errorCount: 0,
      recoveryAttempts: 0
    }),
    // Simulate occasional errors with recovery
    Promise.resolve({
      status: 'recovered',
      dataCount: processed.filter(item => item.transformed > 50).length,
      errorCount: processed.filter(item => item.transformed < 0).length,
      recoveryAttempts: 5
    })
  ]);
  
  return {
    processedCount: processed.length,
    aggregatedValue: aggregated[0] || 0,
    evenCount: aggregated[1][0],
    distance: aggregated[1][1],
    allProcessed: aggregated[1][2],
    errorStatus: errorHandled.status,
    dataCount: errorHandled.dataCount,
    errorCount: errorHandled.errorCount,
    recoveryAttempts: errorHandled.recoveryAttempts,
    computationTime: Date.now()
  };
}

// Async benchmark main function
async function main() {
  const start = performance.now();
  
  // Run the complex async benchmark
  const result = await complexTransform(DATA);
  
  const durationMs = performance.now() - start;
  
  emitResult({
    demo: 'async-complex',
    durationMs: Math.round(durationMs),
    processedCount: result.processedCount,
    aggregatedValue: Math.round(result.aggregatedValue),
    headline: `Complex async: ${result.processedCount} items, aggregated=${Math.round(result.aggregatedValue)}, errors=${result.errorCount}, recovery=${result.recoveryAttempts}, ${Math.round(durationMs)}ms`
  });
}

main().catch(err => {
  console.error('Complex benchmark failed:', err);
  process.exit(1);
});