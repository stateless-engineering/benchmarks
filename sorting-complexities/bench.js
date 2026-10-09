#!/usr/bin/env node
/**
 * sorting-complexities/bench.js
 *
 * Benchmark: Sorting algorithms with varying time complexities
 * Tests: Bubble sort O(n²), Quick sort O(n log n), Merge sort O(n log n),
 * Heap sort O(n log n), and Radix sort O(n·k) — demonstrates how algorithm
 * choice dwarfs raw CPU performance at scale.
 *
 * Complexity: Algorithmic (O(n²) through O(n·k))
 */
'use strict';

const { emitResult } = require('../lib/common');

// Per-run randomized input (tighter-gate gap 3): PRNG is seeded from
// argv or the clock so each run is reproducible AND distinct — seed
// is printed with the result. Pass `--seed N` to reproduce a run.
const seedArg = process.argv.find((a) => a.startsWith('--seed='));
const SEED = seedArg ? Number(seedArg.split('=')[1]) : Date.now() % 2147483647;
function mulberry32(s) {
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

const DATA_SIZE = 5000;
const DATA = Array.from({ length: DATA_SIZE }, () => Math.floor(rand() * 10000));

// Bubble Sort — O(n²)
function bubbleSort(arr) {
  const result = [...arr];
  const startTime = performance.now();
  let swaps = 0;
  for (let i = 0; i < result.length - 1; i++) {
    for (let j = 0; j < result.length - i - 1; j++) {
      if (result[j] > result[j + 1]) {
        [result[j], result[j + 1]] = [result[j + 1], result[j]];
        swaps++;
      }
    }
  }
  return { ms: Math.round(performance.now() - startTime), swaps, sorted: result };
}

// Quick Sort — O(n log n) average, O(n²) worst-case
function quickSort(arr) {
  const result = [...arr];
  const startTime = performance.now();
  let comparisons = 0;
  
  function partition(low, high) {
    const pivot = result[high];
    let i = low - 1;
    for (let j = low; j < high; j++) {
      comparisons++;
      if (result[j] < pivot) {
        i++;
        [result[i], result[j]] = [result[j], result[i]];
      }
    }
    [result[i + 1], result[high]] = [result[high], result[i + 1]];
    return i + 1;
  }
  
  function sort(low, high) {
    if (low < high) {
      const pi = partition(low, high);
      sort(low, pi - 1);
      sort(pi + 1, high);
    }
  }
  
  sort(0, result.length - 1);
  return { ms: Math.round(performance.now() - startTime), comparisons, sorted: result };
}

// Merge Sort — O(n log n) guaranteed
function mergeSort(arr) {
  const result = [...arr];
  const startTime = performance.now();
  let merges = 0;
  
  function merge(left, right) {
    merges++;
    const merged = [];
    let leftIndex = 0;
    let rightIndex = 0;
    
    while (leftIndex < left.length && rightIndex < right.length) {
      if (left[leftIndex] <= right[rightIndex]) {
        merged.push(left[leftIndex++]);
      } else {
        merged.push(right[rightIndex++]);
      }
    }
    
    return merged.concat(left.slice(leftIndex)).concat(right.slice(rightIndex));
  }
  
  function sort(arr) {
    if (arr.length <= 1) return arr;
    const mid = Math.floor(arr.length / 2);
    const left = sort(arr.slice(0, mid));
    const right = sort(arr.slice(mid));
    return merge(left, right);
  }
  
  const sortedResult = sort(result);
  return { ms: Math.round(performance.now() - startTime), merges, sorted: sortedResult };
}

// Heap Sort — O(n log n) guaranteed, in-place
function heapSort(arr) {
  const result = [...arr];
  const startTime = performance.now();
  let heapifyCalls = 0;
  
  function heapify(n, i) {
    heapifyCalls++;
    let largest = i;
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    
    if (left < n && result[left] > result[largest]) largest = left;
    if (right < n && result[right] > result[largest]) largest = right;
    
    if (largest !== i) {
      [result[i], result[largest]] = [result[largest], result[i]];
      heapifyCalls++;
      heapify(n, largest);
    }
  }
  
  const n = result.length;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heapify(n, i);
  for (let i = n - 1; i > 0; i--) {
    [result[0], result[i]] = [result[i], result[0]];
    heapify(i, 0);
  }
  
  return { ms: Math.round(performance.now() - startTime), heapifyCalls, sorted: result };
}

// Radix Sort — O(n·k) for integers
function radixSort(arr) {
  const result = [...arr];
  const startTime = performance.now();
  const maxDigits = Math.max(...result.map(n => String(Math.abs(n)).length));

  for (let digit = 0; digit < maxDigits; digit++) {
    const buckets = Array.from({ length: 10 }, () => []);
    for (const num of result) {
      const d = Math.floor(Math.abs(num) / Math.pow(10, digit)) % 10;
      buckets[d].push(num);
    }
    result.length = 0;
    for (const bucket of buckets) result.push(...bucket);
  }
  
  return { ms: Math.round(performance.now() - startTime), passes: maxDigits, sorted: result };
}

// Verify sort correctness
function verifySorted(sortedArray) {
  for (let i = 0; i < sortedArray.length - 1; i++) {
    if (sortedArray[i] > sortedArray[i + 1]) return false;
  }
  return true;
}

// Main benchmark
async function main() {
  const start = performance.now();
  
  const bubble = bubbleSort(DATA);
  const quick = quickSort(DATA);
  const merge = mergeSort(DATA);
  const heap = heapSort(DATA);
  const radix = radixSort(DATA);
  
  const totalMs = Math.round(performance.now() - start);
  
  emitResult({
    demo: 'sorting-complexities',
    durationMs: totalMs,
    dataSize: DATA_SIZE,
    seed: SEED,
    algorithms: {
      bubble: {
        name: 'bubbleSort',
        ms: bubble.ms,
        swaps: bubble.swaps,
        correct: verifySorted(bubble.sorted)
      },
      quick: {
        name: 'quickSort',
        ms: quick.ms,
        comparisons: quick.comparisons,
        correct: verifySorted(quick.sorted)
      },
      merge: {
        name: 'mergeSort',
        ms: merge.ms,
        merges: merge.merges,
        correct: verifySorted(merge.sorted)
      },
      heap: {
        name: 'heapSort',
        ms: heap.ms,
        heapifyCalls: heap.heapifyCalls,
        correct: verifySorted(heap.sorted)
      },
      radix: {
        name: 'radixSort',
        ms: radix.ms,
        passes: radix.passes,
        correct: verifySorted(radix.sorted)
      }
    },
    headline: `Sorting ${DATA_SIZE} ints: Bubble(${bubble.ms}ms) Quick(${quick.ms}ms) Merge(${merge.ms}ms) Heap(${heap.ms}ms) Radix(${radix.ms}ms) — O(n²) vs O(n log n) ${bubble.ms / Math.max(quick.ms, 1)}x slower`
  });
}

main().catch(err => {
  console.error('Sorting benchmark failed:', err);
  process.exit(1);
});