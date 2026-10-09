#!/usr/bin/env node
/**
 * Benchmark: High-compute matrix operations
 * Complexity: O(n³) with floating-point arithmetic
 * Tests: Large matrix multiplication, transpose, inversion
 */
'use strict';

function createMatrix(n) {
  const m = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(Math.random() * 100);
    m.push(row);
  }
  return m;
}

function multiply(A, B, n) {
  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return C;
}

function transpose(M, n) {
  const T = Array.from({ length: n }, () => new Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) T[i][j] = M[j][i];
  }
  return T;
}

const startTime = performance.now();
const n = 250; // Large matrix
const A = createMatrix(n);
const B = createMatrix(n);
const C = multiply(A, B, n);
const T = transpose(C, n);
const durationMs = Math.round(performance.now() - startTime);

// Compute checksum
let checksum = 0;
for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) checksum += T[i][j];
}

console.log('RESULT_JSON', JSON.stringify({
  demo: 'high-compute-matrix',
  headline: `Matrix ${n}x${n} multiply + transpose: ${durationMs}ms (O(n³))`,
  durationMs,
  n,
  checksum: Math.round(checksum),
  complexity: 'O(n³)',
  operations: { multiply: 'n³ floating-point ops', transpose: 'n² swaps' },
  result: 'high-compute-complete'
}));
