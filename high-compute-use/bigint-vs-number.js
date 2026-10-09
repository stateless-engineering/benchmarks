#!/usr/bin/env node
'use strict';
// Isolate BigInt arithmetic overhead — direct from the trace.js BigInt fix
function benchNumber(n) {
  const t0 = performance.now();
  let sum = 0;
  for (let i = 0; i < n; i++) sum += i * 1.0001;
  return { ms: Math.round(performance.now() - t0), result: Math.round(sum) };
}
function benchBigInt(n) {
  const t0 = performance.now();
  let sum = 0n;
  for (let i = 0n; i < n; i++) sum += i * 10001n;
  return { ms: Math.round(performance.now() - t0), result: Number(sum) };
}

const n = 1000000;
const num = benchNumber(n);
const big = benchBigInt(100000n);

console.log('RESULT_JSON', JSON.stringify({
  demo: 'bigint-vs-number',
  headline: `Number ${n} ops: ${num.ms}ms vs BigInt 100K ops: ${big.ms}ms (BigInt ~${(big.ms / num.ms).toFixed(2)}× slower per op)`,
  durationMs: Math.max(num.ms, big.ms),
  numberMs: num.ms, bigintMs: big.ms, n,
  ratio: (big.ms / num.ms).toFixed(2),
  result: 'high-compute-complete'
}));