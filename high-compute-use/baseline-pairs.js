#!/usr/bin/env node
'use strict';
// Baseline pair: regular array vs Float64Array matrix multiply 250x250
function multiplyRegular(A, B, n) {
  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const aik = A[i][k];
      for (let j = 0; j < n; j++) C[i][j] += aik * B[k][j];
    }
  return C;
}
function multiplyTyped(A, B, n) {
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const aik = A[i * n + k];
      for (let j = 0; j < n; j++) C[i * n + j] += aik * B[k * n + j];
    }
  return C;
}

function buildRegular(n) {
  const m = [];
  for (let i = 0; i < n; i++) { const r = []; for (let j = 0; j < n; j++) r.push(Math.random() * 100); m.push(r); }
  return m;
}
function buildTyped(n) {
  const m = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) m[i] = Math.random() * 100;
  return m;
}

const n = 250;
// Cold
const t0 = performance.now(); const A1 = buildRegular(n); const B1 = buildRegular(n); multiplyRegular(A1, B1, n); const tRegular = Math.round(performance.now() - t0);
const t1 = performance.now(); const A2 = buildTyped(n); const B2 = buildTyped(n); multiplyTyped(A2, B2, n); const tTyped = Math.round(performance.now() - t1);

console.log('RESULT_JSON', JSON.stringify({
  demo: 'high-compute-baseline-pairs',
  headline: `Matrix 250x250 regular=${tRegular}ms vs Float64Array=${tTyped}ms (typed-array baseline)`,
  durationMs: Math.max(tRegular, tTyped),
  regularMs: tRegular, typedMs: tTyped, n,
  baseline: 'Float64Array vs regular 2D array',
  result: 'high-compute-complete'
}));
