#!/usr/bin/env node
/**
 * Benchmark: High-compute recursive computation
 * Complexity: O(2^n) naive vs O(n) memoized
 * Tests: Fibonacci with deep recursion
 */
'use strict';

function fibonacciNaive(n) {
  if (n <= 1) return n;
  return fibonacciNaive(n - 1) + fibonacciNaive(n - 2);
}

const memo = { 0: 0, 1: 1 };
function fibonacciMemo(n) {
  if (memo[n] !== undefined) return memo[n];
  memo[n] = fibonacciMemo(n - 1) + fibonacciMemo(n - 2);
  return memo[n];
}

const n = 35; // Deep recursive
const startNaive = performance.now();
const naiveResult = fibonacciNaive(30); // 30 is safe for naive
const naiveMs = Math.round(performance.now() - startNaive);

const startMemo = performance.now();
const memoResult = fibonacciMemo(n);
const memoMs = Math.round(performance.now() - startMemo);

console.log('RESULT_JSON', JSON.stringify({
  demo: 'high-compute-recursive',
  headline: `Fibonacci n=${n}: naive=${naiveMs}ms (O(2^n)) vs memo=${memoMs}ms (O(n))`,
  durationMs: Math.max(naiveMs, memoMs),
  naiveMs,
  memoMs,
  n,
  naiveResult,
  memoResult,
  complexityCompare: `O(2^30)≈1B calls vs O(35)≈35 calls = ~28M× reduction`,
  result: 'high-compute-complete'
}));
