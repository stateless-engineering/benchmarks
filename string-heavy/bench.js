#!/usr/bin/env node
/**
 * string-heavy/bench.js
 *
 * Benchmark: String manipulation patterns
 * Tests: String concatenation, regex matching, substring operations, encoding/decoding,
 * and large text processing.
 *
 * Complexity: String-heavy (O(n²) string operations on 1MB text)
 */
'use strict';

const { emitResult } = require('../lib/common');

// Generate test data: 1MB of text
const TEXT = Array.from({ length: 50000 }, () => 
  'word-' + Math.random().toString(36).substring(2, 12) + ' '
).join('').substring(0, 1024 * 1024);

// Benchmark string concatenation (bad and good patterns)
function concatBenchmark() {
  // Bad: repeated concatenation in loop
  const t1 = performance.now();
  let badConcat = '';
  for (let i = 0; i < TEXT.length; i += 100) {
    badConcat += TEXT.substring(i, i + 100);
  }
  
  // Good: array join
  const t2 = performance.now();
  const parts = TEXT.match(/.{1,100}/g) || [];
  const goodConcat = parts.join('');
  
  return {
    badConcatMs: Math.round(t2 - t1),
    goodConcatMs: Math.round(performance.now() - t2),
    badSize: badConcat.length,
    goodSize: goodConcat.length,
    matches: badConcat === goodConcat
  };
}

// Regex matching benchmark
function regexBenchmark() {
  const patterns = [
    /\bword-\w+\b/,                    // word matching
    /(0x[0-9a-fA-F]+|\\[0-9]+|\\\\)/g, // hex escape matching
    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // IP-like
    /\w{5,12}/,                        // alphanumeric word
    /[a-z]+-[a-z]+/                    // word-word pattern
  ];
  
  const results = [];
  for (const pattern of patterns) {
    const t0 = performance.now();
    const matches = TEXT.match(pattern);
    results.push({
      pattern: String(pattern),
      count: matches ? matches.length : 0,
      ms: Math.round(performance.now() - t0)
    });
  }
  return results;
}

// Encoding/decoding benchmark
function encodingBenchmark() {
  const operations = [
    { name: 'base64Encode', fn: (s) => Buffer.from(s, 'utf8').toString('base64') },
    { name: 'base64Decode', fn: (s) => Buffer.from(s, 'base64').toString('utf8') },
    { name: 'encodeURI', fn: (s) => encodeURIComponent(s) },
    { name: 'decodeURI', fn: (s) => decodeURIComponent(s) },
    { name: 'JSON.stringify', fn: (s) => JSON.stringify(s) },
    { name: 'JSON.parse', fn: (s) => JSON.parse(s) }
  ];
  
  const results = [];
  for (const op of operations) {
    const t0 = performance.now();
    let output;
    if (op.name === 'JSON.parse' || op.name === 'JSON.stringify') {
      output = op.fn(JSON.stringify(TEXT));
    } else {
      output = op.fn(TEXT);
    }
    results.push({
      operation: op.name,
      inputLen: TEXT.length,
      outputLen: output ? output.length : 0,
      ms: Math.round(performance.now() - t0)
    });
  }
  return results;
}

// Substring and slicing benchmark
function substringBenchmark() {
  const results = [];
  
  // findIndex approach (slow on large texts)
  const t1 = performance.now();
  let occurrences = 0;
  let lastPos = 0;
  let pos = TEXT.indexOf('word-');
  while (pos !== -1) {
    occurrences++;
    pos = TEXT.indexOf('word-', pos + 1);
    if (pos === -1) break;
  }
  results.push({ method: 'indexOf-loop', occurrences, ms: Math.round(performance.now() - t1) });
  
  // match approach
  const t2 = performance.now();
  const matchCount = TEXT.match(/word-/g)?.length || 0;
  results.push({ method: 'match', occurrences: matchCount, ms: Math.round(performance.now() - t2) });
  
  return results;
}

// Large text manipulation benchmark
function manipulationBenchmark() {
  // Uppercase conversion
  const t1 = performance.now();
  const upper = TEXT.toUpperCase();
  
  // Split and join
  const t2 = performance.now();
  const words = TEXT.split(' ');
  const joined = words.join(' ');
  
  // Replace all
  const t3 = performance.now();
  const replaced = TEXT.replace(/word-/g, 'ITEM-');
  
  // Slice operations
  const t4 = performance.now();
  const slice1 = TEXT.slice(0, 100000);
  const slice2 = TEXT.slice(-100000);
  const slice3 = TEXT.slice(50000, 150000);
  
  return {
    uppercaseMs: Math.round(t2 - t1),
    splitJoinMs: Math.round(t3 - t2),
    replaceMs: Math.round(t4 - t3),
    sliceMs: Math.round(performance.now() - t4),
    sliceSizes: [slice1.length, slice2.length, slice3.length]
  };
}

// Main benchmark
async function main() {
  const start = performance.now();
  
  const concat = concatBenchmark();
  const regex = regexBenchmark();
  const encoding = encodingBenchmark();
  const substring = substringBenchmark();
  const manipulation = manipulationBenchmark();
  
  const totalMs = Math.round(performance.now() - start);
  
  emitResult({
    demo: 'string-heavy',
    durationMs: totalMs,
    textLength: TEXT.length,
    concat: {
      badConcatMs: concat.badConcatMs,
      goodConcatMs: concat.goodConcatMs,
      identical: concat.matches
    },
    regex: regex.map(r => ({ pattern: r.pattern.substring(0, 30), count: r.count, ms: r.ms })),
    encoding: encoding.map(e => ({ operation: e.operation, inputLen: e.inputLen, outputLen: e.outputLen, ms: e.ms })),
    substring: substring,
    manipulation: manipulation,
    headline: `String-heavy: 1MB text, concat matches=${concat.matches}, regex=${regex.length}patterns, ${substring[0].occurrences}word occurrences, total=${totalMs}ms`
  });
}

main().catch(err => {
  console.error('String benchmark failed:', err);
  process.exit(1);
});