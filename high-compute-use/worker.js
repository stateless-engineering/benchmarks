#!/usr/bin/env node
'use strict';
// Worker script for concurrent benchmark — real worker_threads baseline
const { parentPort } = require('worker_threads');

parentPort.on('message', (msg) => {
  const { id, iterations } = msg;
  let acc = 0;
  for (let i = 0; i < iterations; i++) {
    acc += Math.sqrt(i) * Math.sin(i) + Math.pow(i % 10, 2);
  }
  parentPort.postMessage({ id, result: Math.round(acc) });
});