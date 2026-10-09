#!/usr/bin/env node
/**
 * memory-intensive/bench.js
 *
 * Benchmark: Memory allocation patterns and GC pressure
 * Tests: Large object creation, array buffers, typed arrays, memory pooling,
 * and repeated allocation/deallocation cycles.
 *
 * Complexity: Memory-intensive (allocates ~200MB across phases)
 */
'use strict';
const gcStats = { count: 0, totalMs: 0 };
function onGC(t) { gcStats.count++; gcStats.totalMs += (performance.now()-t); }

const { emitResult } = require('../lib/common');

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
const TOTAL_CHUNKS = 200; // ~200MB total

function allocateLargeObjects(count) {
  const objects = [];
  for (let i = 0; i < count; i++) {
    objects.push({
      id: i,
      buffer: new ArrayBuffer(CHUNK_SIZE),
      view: new Float64Array(CHUNK_SIZE / 8),
      data: Buffer.alloc(CHUNK_SIZE),
      metadata: {
        created: Date.now(),
        size: CHUNK_SIZE,
        checksum: Math.random().toString(36).substring(2, 15),
        tags: Array.from({ length: 100 }, (_, j) => `tag-${j}`)
      }
    });
    
    // Fill the Float64Array
    for (let j = 0; j < objects[i].view.length; j++) {
      objects[i].view[j] = Math.sin(j * 0.01) * i;
    }
  }
  return objects;
}

function processInChunks(objects) {
  const results = [];
  for (const obj of objects) {
    let sum = 0;
    for (let j = 0; j < obj.view.length; j += 1000) {
      sum += obj.view[j];
    }
    results.push({
      id: obj.id,
      sum: sum,
      processed: true
    });
  }
  return results;
}

// Memory pool simulation
class MemoryPool {
  constructor(poolSize) {
    this.pool = [];
    for (let i = 0; i < poolSize; i++) {
      this.pool.push({
        buffer: new ArrayBuffer(64 * 1024), // 64KB
        inUse: false,
        data: null
      });
    }
  }
  
  acquire() {
    const free = this.pool.find(p => !p.inUse);
    if (!free) return null;
    free.inUse = true;
    free.data = new Float64Array(free.buffer);
    return free;
  }
  
  release(obj) {
    obj.inUse = false;
    obj.data = null;
  }
}

async function main() {
  const start = performance.now();
  const memBefore = process.memoryUsage();
  
  // Phase 1: Large allocations
  console.log('Phase 1: Allocating large objects...');
  const largeObjects = allocateLargeObjects(TOTAL_CHUNKS);
  const memAfterAlloc = process.memoryUsage();
  
  // Force some computation on the data
  console.log('Phase 2: Processing objects...');
  const processed = processInChunks(largeObjects);
  
  // Phase 3: Memory pool operations
  console.log('Phase 3: Memory pool operations...');
  const pool = new MemoryPool(1000);
  const poolOps = [];
  
  for (let i = 0; i < 5000; i++) {
    const item = pool.acquire();
    if (item) {
      for (let j = 0; j < item.data.length; j++) {
        item.data[j] = Math.random() * 100;
      }
      pool.release(item);
      poolOps.push({ op: i, acquired: true });
    } else {
      poolOps.push({ op: i, acquired: false });
    }
  }
  
  // Phase 4: Clear and reallocate (GC pressure)
  console.log('Phase 4: Clearing and reallocating...');
  largeObjects.length = 0; // Clear array
  
  // Small reallocation
  const smallObjects = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    arr: new Uint8Array(4096), // 4KB each
    sum: 0
  }));
  
  for (let i = 0; i < smallObjects.length; i++) {
    const obj = smallObjects[i];
    for (let j = 0; j < obj.arr.length; j++) {
      obj.arr[j] = i % 256;
    }
  }
  
  const memAfter = process.memoryUsage();
  const durationMs = performance.now() - start;
  
  emitResult({
    demo: 'memory-intensive',
    durationMs: Math.round(durationMs),
    heapUsedBefore: Math.round(memBefore.heapUsed / 1024 / 1024),
    heapUsedAfterAlloc: Math.round(memAfterAlloc.heapUsed / 1024 / 1024),
    heapUsedAfter: Math.round(memAfter.heapUsed / 1024 / 1024),
    heapDelta: Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024),
    largeObjectsCreated: TOTAL_CHUNKS,
    poolOpsCompleted: poolOps.filter(p => p.acquired).length,
    poolOpsTotal: poolOps.length,
    smallObjectsCreated: smallObjects.length,
    headline: `Memory-intensive: ${TOTAL_CHUNKS}MB allocated, ${poolOps.filter(p => p.acquired).length}/${poolOps.length} pool ops, ${smallObjects.length} small objects, heap delta ${Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024)}MB, ${Math.round(durationMs)}ms`
  });
}

main().catch(err => {
  console.error('Memory benchmark failed:', err);
  process.exit(1);
});