#!/usr/bin/env node
/**
 * trace-runner.js — Trace-enabled benchmark runner
 *
 * Runs every `bench.js` found in a directory, collects RESULT_JSON,
 * and adds comprehensive trace-level performance monitoring.
 *
 * Usage:
 *   node trace-runner.js [DIR] [--json] [--only a,b] [--timeout SECS] [--trace] [--trace-output FORMAT]
 *
 *   --trace              Enable trace-level monitoring for all benchmarks
 *   --trace-output FORMAT  Output format: stdout|json|csv|all (default: stdout)
 *   --trace-memory       Enable memory tracking (default: true)
 *   --trace-gc           Enable GC monitoring (default: false)
 *   --trace-stack        Enable call stack capture (default: false)
 *   --trace-events N     Max events per benchmark (default: 5000)
 *   --idle-baseline      Wait for CPU idle baseline before each benchmark
 *   --idle-threshold MS  CPU idle threshold in ms (default: 50)
 *   --idle-timeout SEC   Max wait for idle (default: 30)
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { performance, PerformanceObserver } = require('perf_hooks');

let fmt = null;
try {
  fmt = require('./bench-runner/formatting/lib/format.js');
} catch {}

const TRACE_AVAILABLE = true;
const { Tracer } = require('./lib/trace');

function usage() {
  console.log('usage: trace-runner [DIR] [--json] [--only a,b] [--timeout SECS] [--trace] [--trace-output FORMAT] [--idle-baseline]');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    dir: process.cwd(),
    json: false,
    only: null,
    timeout: 180,
    trace: false,
    traceOutput: 'stdout',
    traceMemory: true,
    traceGc: false,
    traceStack: false,
    traceEvents: 5000,
    idleBaseline: false,
    idleThreshold: 50,
    idleTimeout: 30
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') opts.json = true;
    else if (a === '--only') opts.only = args[++i].split(',');
    else if (a === '--timeout') opts.timeout = parseInt(args[++i], 10);
    else if (a === '--trace') opts.trace = true;
    else if (a === '--trace-output') opts.traceOutput = args[++i];
    else if (a === '--trace-memory') opts.traceMemory = true;
    else if (a === '--trace-gc') opts.traceGc = true;
    else if (a === '--trace-stack') opts.traceStack = true;
    else if (a === '--trace-events') opts.traceEvents = parseInt(args[++i], 10);
    else if (a === '--idle-baseline') opts.idleBaseline = true;
    else if (a === '--idle-threshold') opts.idleThreshold = parseInt(args[++i], 10);
    else if (a === '--idle-timeout') opts.idleTimeout = parseInt(args[++i], 10);
    else if (!a.startsWith('-')) opts.dir = a;
    else { console.error('unknown flag:', a); usage(); process.exit(2); }
  }
  return opts;
}

function findDemos(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const demos = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(d => fs.existsSync(path.join(root, d, 'bench.js')))
    .sort();
  return demos;
}

async function waitForIdleBaseline(thresholdMs = 50, timeoutSec = 30) {
  const startTime = performance.now();
  const threshold = thresholdMs;
  let consecutiveIdle = 0;
  const requiredIdle = 3;

  return new Promise((resolve, reject) => {
    const checkIdle = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed > timeoutSec * 1000) {
        reject(new Error(`Idle baseline timeout after ${timeoutSec}s`));
        return;
      }

      const usage = process.cpuUsage();
      const userMs = usage.user / 1000;
      const systemMs = usage.system / 1000;
      const totalMs = userMs + systemMs;

      if (totalMs < threshold) {
        consecutiveIdle++;
        if (consecutiveIdle >= requiredIdle) {
          resolve({ userMs, systemMs, totalMs, waitMs: elapsed });
        }
      } else {
        consecutiveIdle = 0;
      }
      setTimeout(checkIdle, 100);
    };
    checkIdle();
  });
}

function runDemo(root, name, timeoutSecs, traceOpts = null) {
  return new Promise(async (resolve, reject) => {
    const script = path.join(root, name, 'bench.js');
    let stdout = '';
    let stderr = '';

    let tracer = null;
    if (traceOpts) {
      tracer = new Tracer({
        captureMemory: traceOpts.memory,
        captureGc: traceOpts.gc,
        captureStack: traceOpts.stack,
        maxEvents: traceOpts.events,
        autoStart: false,
        labels: [name]
      });
      tracer.start();
      if (traceOpts.idleBaseline) {
        try {
          await waitForIdleBaseline(traceOpts.idleThreshold, traceOpts.idleTimeout);
          tracer.mark('idle-baseline-achieved');
        } catch (e) {
          tracer.mark('idle-baseline-timeout');
        }
      }
      tracer.mark('demo-started');
    }

    const child = spawn(process.execPath, [script], { cwd: root, timeout: timeoutSecs * 1000 });
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('close', code => {
      if (tracer) {
        tracer.mark('demo-completed');
        tracer.stop();
        const traceResult = tracer.export('callback');
        resolve({ code, stdout, stderr, trace: traceResult });
      } else {
        resolve({ code, stdout, stderr });
      }
    });
  });
}

function parseResult(stdout) {
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('RESULT_JSON ')) {
      try {
        return JSON.parse(line.slice('RESULT_JSON '.length));
      } catch {}
    }
  }
  return null;
}

function statusOf(r) {
  if (!r) return 'fail';
  if (r.code && r.code !== 0) return 'fail';
  if (r.stdout.includes('unhandled rejection') || r.stderr) return 'warn';
  return 'ok';
}

async function main() {
  const opts = parseArgs(process.argv);
  const demos = findDemos(opts.dir);

  if (demos.length === 0) {
    console.error('no demos found in', opts.dir);
    process.exit(2);
  }

  const toRun = opts.only ? demos.filter(d => opts.only.includes(d)) : demos;
  if (toRun.length === 0) {
    console.error('no matching demos for --only', opts.only);
    process.exit(2);
  }

  const traceOpts = opts.trace ? {
    memory: opts.traceMemory,
    gc: opts.traceGc,
    stack: opts.traceStack,
    events: opts.traceEvents,
    idleBaseline: opts.idleBaseline,
    idleThreshold: opts.idleThreshold,
    idleTimeout: opts.idleTimeout
  } : null;

  const results = [];
  let allOk = true;

  console.log(`=== trace-runner: ${toRun.length} demos${opts.trace ? ' (trace enabled)' : ''} ===`);

  for (const name of toRun) {
    console.log(`\n=== ${name} ===`);
    const r = await runDemo(opts.dir, name, opts.timeout, traceOpts);

    const result = parseResult(r.stdout);
    const status = statusOf(r);

    if (status === 'fail') allOk = false;

    const traceSummary = r.trace ? {
      totalSpans: r.trace.summary?.spanCount || 0,
      totalEvents: r.trace.summary?.totalEvents || 0,
      gcCount: r.trace.memory?.gcCount || 0,
      gcPauseTotalMs: r.trace.memory?.gcPauseTotalMs || 0,
      peakRssMb: r.trace.memory?.peakRssMb || 0,
      peakHeapUsedMb: r.trace.memory?.peakHeapUsedMb || 0,
      peakHeapDeltaMb: r.trace.memory?.peakHeapDeltaMb || 0,
      traceDurationMs: r.trace.summary?.durationMs || 0,
      errorCount: r.trace.summary?.errorCount || 0
    } : null;

    const record = {
      demo: name,
      durationMs: result?.durationMs || 0,
      status,
      headline: result?.headline || '(no headline)',
      code: r.code,
      trace: traceSummary
    };

    results.push(record);

    if (!opts.json) {
      if (result && Object.keys(result).length > 1) {
        for (const [k, v] of Object.entries(result)) {
          if (k !== 'headline' && k !== 'durationMs') {
            console.log(`${k}:`, typeof v === 'object' ? JSON.stringify(v) : v);
          }
        }
      }
      console.log(`status: ${status}  ${result?.headline || ''}`);
    }

    if (traceSummary && opts.traceOutput !== 'none') {
      console.log(`  trace: ${traceSummary.totalSpans} spans, ${traceSummary.totalEvents} events, ${traceSummary.gcCount} GCs, ${traceSummary.gcPauseTotalMs}ms GC pause, RSS Δ${traceSummary.peakRssDeltaMb || traceSummary.peakHeapDeltaMb || 0}MB`);
    }

    if (opts.traceOutput === 'all' && r.trace) {
      console.log('TRACE_JSON ' + JSON.stringify(r.trace));
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('\n=== summary ===');
    if (fmt && fmt.renderTable) {
      const cols = ['demo', 'durationMs', 'status', 'headline'];
      const rows = results.map(r => [r.demo, r.durationMs + 'ms', r.status, r.headline]);
      console.log(fmt.renderTable(cols, rows));
    } else {
      const w = Math.max(...results.map(r => r.demo.length));
      console.log('demo'.padEnd(w) + ' | dur | status | headline');
      console.log('-'.repeat(w) + '-+------+--------+----------------------------------');
      for (const r of results) {
        console.log(r.demo.padEnd(w) + ` | ${String(r.durationMs).padStart(4)}ms | ${r.status.padEnd(6)} | ${r.headline}`);
      }
    }
    console.log(`total: ${results.filter(r => r.status === 'ok').length}/${results.length} demos ok`);
  }

  if (opts.traceOutput === 'json') {
    console.log('TRACE_ALL_JSON ' + JSON.stringify(results.map(r => r.trace).filter(Boolean), null, 2));
  }

  if (!allOk) process.exit(1);
}

main().catch(err => {
  console.error('runner error:', err);
  process.exit(2);
});