#!/usr/bin/env node
/**
 * graph-traversal/bench.js
 *
 * Benchmark: Graph algorithms with different traversal strategies
 * Tests: BFS, DFS, Dijkstra's shortest path, and Floyd-Warshall all-pairs.
 * Demonstrates algorithmic complexity differences on graph structures.
 *
 * Complexity: Graph algorithms (O(V+E) through O(V³))
 */
'use strict';

const { emitResult } = require('../lib/common');

const NODES = 1000;
const EDGES_PER_NODE = 4;

// Generate a random graph
function generateGraph(nodes, edgesPerNode) {
  const graph = new Map();
  for (let i = 0; i < nodes; i++) {
    graph.set(i, []);
  }
  
  for (let i = 0; i < nodes; i++) {
    for (let j = 0; j < edgesPerNode; j++) {
      const target = Math.floor(Math.random() * nodes);
      const weight = Math.floor(Math.random() * 100) + 1;
      graph.get(i).push({ to: target, weight });
    }
  }
  
  return graph;
}

// BFS — O(V+E)
function bfs(graph, start) {
  const visited = new Set();
  const queue = [start];
  const distances = new Map();
  distances.set(start, 0);
  
  const startTime = performance.now();
  let visitedCount = 0;
  
  while (queue.length > 0) {
    const node = queue.shift();
    if (visited.has(node)) continue;
    visited.add(node);
    visitedCount++;
    
    for (const edge of graph.get(node)) {
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
        if (!distances.has(edge.to)) {
          distances.set(edge.to, distances.get(node) + 1);
        }
      }
    }
  }
  
  return { ms: Math.round(performance.now() - startTime), visited: visitedCount, reachable: distances.size };
}

// DFS — O(V+E)
function dfs(graph, start) {
  const visited = new Set();
  const startTime = performance.now();
  let visitedCount = 0;
  
  function traverse(node) {
    if (visited.has(node)) return;
    visited.add(node);
    visitedCount++;
    
    for (const edge of graph.get(node)) {
      traverse(edge.to);
    }
  }
  
  traverse(start);
  
  return { ms: Math.round(performance.now() - startTime), visited: visitedCount };
}

// Dijkstra's Shortest Path — O((V+E) log V)
function dijkstra(graph, start) {
  const distances = new Map();
  const visited = new Set();
  const queue = [{ node: start, dist: 0 }];
  
  const startTime = performance.now();
  let processed = 0;
  
  while (queue.length > 0) {
    // Extract min (simple linear scan for benchmark purposes)
    let minIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].dist < queue[minIdx].dist) minIdx = i;
    }
    const { node, dist } = queue.splice(minIdx, 1)[0];
    
    if (visited.has(node)) continue;
    visited.add(node);
    distances.set(node, dist);
    processed++;
    
    for (const edge of graph.get(node)) {
      if (!visited.has(edge.to)) {
        const newDist = dist + edge.weight;
        const existing = queue.find(q => q.node === edge.to);
        if (existing) {
          if (newDist < existing.dist) existing.dist = newDist;
        } else {
          queue.push({ node: edge.to, dist: newDist });
        }
      }
    }
  }
  
  return { ms: Math.round(performance.now() - startTime), processed, reachable: distances.size };
}

// Floyd-Warshall All-Pairs Shortest Path — O(V³)
function floydWarshall(graph) {
  const n = graph.size;
  const dist = Array.from({ length: n }, () => Array(n).fill(Infinity));
  
  // Initialize
  for (let i = 0; i < n; i++) {
    dist[i][i] = 0;
    for (const edge of graph.get(i)) {
      dist[i][edge.to] = Math.min(dist[i][edge.to], edge.weight);
    }
  }
  
  const startTime = performance.now();
  let relaxationSteps = 0;
  
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        relaxationSteps++;
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
        }
      }
    }
  }
  
  return { ms: Math.round(performance.now() - startTime), steps: relaxationSteps, paths: n * n };
}

// Main benchmark
async function main() {
  const start = performance.now();
  
  console.log(`Generating graph with ${NODES} nodes, ${EDGES_PER_NODE} edges each...`);
  const graph = generateGraph(NODES, EDGES_PER_NODE);
  
  console.log('Running BFS...');
  const bfsResult = bfs(graph, 0);
  console.log(`BFS: ${bfsResult.ms}ms, visited=${bfsResult.visited}, reachable=${bfsResult.reachable}`);
  
  console.log('Running DFS...');
  const dfsResult = dfs(graph, 0);
  console.log(`DFS: ${dfsResult.ms}ms, visited=${dfsResult.visited}`);
  
  console.log('Running Dijkstra...');
  const dijkstraResult = dijkstra(graph, 0);
  console.log(`Dijkstra: ${dijkstraResult.ms}ms, processed=${dijkstraResult.processed}, reachable=${dijkstraResult.reachable}`);
  
  console.log('Running Floyd-Warshall...');
  const fwResult = floydWarshall(graph);
  console.log(`Floyd-Warshall: ${fwResult.ms}ms, steps=${fwResult.steps}, paths=${fwResult.paths}`);
  
  const totalMs = Math.round(performance.now() - start);
  
  emitResult({
    demo: 'graph-traversal',
    durationMs: totalMs,
    nodes: NODES,
    edgesPerNode: EDGES_PER_NODE,
    algorithms: {
      bfs: { ms: bfsResult.ms, visited: bfsResult.visited, reachable: bfsResult.reachable },
      dfs: { ms: dfsResult.ms, visited: dfsResult.visited },
      dijkstra: { ms: dijkstraResult.ms, processed: dijkstraResult.processed, reachable: dijkstraResult.reachable },
      floydWarshall: { ms: fwResult.ms, steps: fwResult.steps, paths: fwResult.paths }
    },
    headline: `Graph ${NODES} nodes: BFS(${bfsResult.ms}ms) DFS(${dfsResult.ms}ms) Dijkstra(${dijkstraResult.ms}ms) FW(${fwResult.ms}ms) — O(V+E) vs O(V³) ${fwResult.ms / Math.max(bfsResult.ms, 1)}x slower`
  });
}

main().catch(err => {
  console.error('Graph benchmark failed:', err);
  process.exit(1);
});