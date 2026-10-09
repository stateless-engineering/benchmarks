#!/usr/bin/env node
/**
 * @stateless-engineering/trace
 *
 * Trace-level performance monitoring with nanosecond-precision timing,
 * event-based tracing, call-stack tracking, memory event capture,
 * garbage collection monitoring, and exportable trace records.
 *
 * Stateless: no config, no cache, no file writes. All output via stdout
 * (RESULT_JSON) or callback. Zero npm dependencies.
 *
 * Usage:
 *   const trace = new Tracer();
 *   trace.start();
 *   // ... code to trace ...
 *   trace.stop();
 *   trace.export('stdout');  // prints RESULT_JSON
 *
 * Features:
 *   - High-precision timing (performance.now, process.hrtime.bigint)
 *   - Event-based tracing (custom events, auto-wrapped functions)
 *   - Memory event capture (process.memoryUsage snapshots, gc events)
 *   - Garbage collection monitoring (v8.getHeapStatistics, gc event listener)
 *   - Call stack tracking with function names
 *   - Span timing with parent-child relationships
 *   - Circular buffer trace storage with configurable capacity
 *   - Export to stdout, JSON string, CSV, or callback
 *   - Deterministic ordering by timestamp
 */
'use strict';

const { performance, PerformanceObserver } = require('perf_hooks');
const v8 = process.v8 || {};
const { getHeapStatistics, getHeapSpaceStatistics } = v8 || {};
const os = require('os');
const { platform, arch, version, release, totalmem, freemem, cpus, uptime } = os;

// ---------------------------------------------------------------- environment capture
const ENV = {
  node: process.version,
  platform: platform(),
  arch: arch(),
  cpuCores: cpus().length,
  cpuModel: cpus()[0]?.model?.split('@')[0]?.trim() || 'unknown',
  totalMemBytes: totalmem(),
  freeMemBytes: freemem(),
  host: os.hostname(),
  osVersion: version(),
  osRelease: release(),
  uptime: uptime(),
  pid: process.pid,
  archBits: process.arch === 'x64' ? 64 : process.arch === 'arm64' ? 64 : process.arch === 'ia32' ? 32 : process.arch,
  uvThreads: null,
  workerThreads: process.versions.workers || 'n/a'
};

try {
  const uv = process.binding('uv');
  if (typeof uv.defaultLoop?.threadPoolSize === 'function') {
    ENV.uvThreads = uv.defaultLoop.threadPoolSize();
  } else if (typeof uv.threadPoolSize === 'function') {
    ENV.uvThreads = uv.threadPoolSize();
  }
} catch {
  ENV.uvThreads = 'unknown';
}

// ---------------------------------------------------------------- micro timer
class MicroTimer {
  constructor() {
    this.startNs = 0n;
    this.running = false;
    this.samples = [];
    this.samplingRate = 0;
    this.sampleCount = 0;
    this.totalElapsedNs = 0n;
    this.minNs = null;
    this.maxNs = null;
    this.sumNs = 0n;
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this.startNs = process.hrtime.bigint();
    return this;
  }

  stop() {
    if (!this.running) return this;
    const endNs = process.hrtime.bigint();
    const elapsedNs = endNs - this.startNs;
    this.totalElapsedNs += elapsedNs;
    this.sampleCount++;
    this.sumNs += elapsedNs;
    if (this.minNs === null || elapsedNs < this.minNs) this.minNs = elapsedNs;
    if (this.maxNs === null || elapsedNs > this.maxNs) this.maxNs = elapsedNs;
    this.samples.push(elapsedNs);
    this.running = false;
    return this;
  }

  tick(label = '') {
    if (!this.running) return this;
    const ns = process.hrtime.bigint();
    if (this.samplingRate === 0 || ++this.sampleCount % this.samplingRate === 0) {
      this.samples.push(ns);
    }
    if (label) {
      this._sampleLabels.push(label);
    }
    return this;
  }

  tickRate(rate) {
    this.samplingRate = rate;
    this._sampleLabels = [];
    return this;
  }

  elapsedMs() {
    if (this.running) {
      return Number(process.hrtime.bigint() - this.startNs) / 1e6;
    }
    return 0;
  }

  stats() {
    const n = this.samples.length;
    if (n === 0) {
      return { count: 0, minMs: null, maxMs: null, avgMs: null, totalMs: null, sumNs: null };
    }
    const sorted = [...this.samples].sort((a, b) => Number(a) - Number(b));
    const median = sorted[Math.floor(n / 2)];
    const p90 = sorted[Math.floor(n * 0.9)];
    const p95 = sorted[Math.floor(n * 0.95)];
    const p99 = sorted[Math.floor(n * 0.99)];
    const mean = Number(this.sumNs) / n;
    let variance = 0;
    for (const s of this.samples) {
      const diff = Number(s) - mean;
      variance += diff * diff;
    }
    variance /= n;
    const stddev = Math.sqrt(variance);
    const cv = mean > 0 ? stddev / mean : 0;

    return {
      count: n,
      minNs: Number(this.minNs),
      maxNs: Number(this.maxNs),
      totalNs: Number(this.totalElapsedNs),
      minMs: Number(this.minNs) / 1e6,
      maxMs: Number(this.maxNs) / 1e6,
      totalMs: Number(this.totalElapsedNs) / 1e6,
      meanMs: mean / 1e6,
      medianMs: Number(median) / 1e6,
      p90Ms: Number(p90) / 1e6,
      p95Ms: Number(p95) / 1e6,
      p99Ms: Number(p99) / 1e6,
      p999Ms: Number(sorted[Math.min(Math.floor(n * 0.999), n - 1)]) / 1e6,
      stddevMs: stddev / 1e6,
      cv: cv,
      labels: this._sampleLabels
    };
  }
}

// ---------------------------------------------------------------- event recorder
class EventRecorder {
  constructor(tracer) {
    this.tracer = tracer;
    this.events = [];
    this.eventId = 0;
    this.eventTypes = new Map();
    this.eventStack = [];
    this.maxEvents = 5000;
  }

  record(type, detail = {}, tags = {}) {
    const id = ++this.eventId;
    const nowNs = process.hrtime.bigint();
    const event = {
      id,
      type,
      detail: JSON.parse(JSON.stringify(detail)),
      tags: JSON.parse(JSON.stringify(tags)),
      timestampNs: Number(nowNs),
      timestampMs: nowNs / 1000000n,
      stack: this.eventStack.slice(0),
      parentId: this.eventStack.length > 0 ? this.eventStack[this.eventStack.length - 1] : null,
      threadId: process.threadId || 'main'
    };
    this.events.push(event);
    this.eventTypes.set(type, (this.eventTypes.get(type) || 0) + 1);

    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    return event.id;
  }

  enter(label) {
    const id = this.eventId + 1;
    this.eventStack.push(id);
    this.record('span:enter', { label }, { phase: 'enter' });
    return id;
  }

  exit(id, result = null, error = null) {
    const idx = this.eventStack.lastIndexOf(id);
    if (idx !== -1) {
      this.eventStack.splice(idx);
    }
    this.record('span:exit', { result: result !== null ? 'ok' : 'error' }, { phase: 'exit' });
    if (error) {
      this.record('error', { message: error.message, stack: error.stack }, {});
    }
  }

  mark(label) {
    return this.record('mark', { label }, {});
  }

  count() {
    return this.events.length;
  }

  byType() {
    return Object.fromEntries(this.eventTypes);
  }
}

// ---------------------------------------------------------------- memory tracker
class MemoryTracker {
  constructor(tracer) {
    this.tracer = tracer;
    this.snapshots = [];
    this.allocations = [];
    this.deallocations = [];
    this.gcEvents = [];
    this.allocationsSinceLastGc = 0;
    this.peakHeapUsed = 0;
    this.peakHeapTotal = 0;
    this.peakRss = 0;
    this.initialHeapUsed = 0;
    this.initialRss = 0;
    this.gcCount = 0;
    this.gcPauseNs = 0n;
    this.gcPauses = [];
    this.totalGcPauseNs = 0n;
    this.totalBytesAllocated = 0;
  }

  snapshot(label = '') {
    const stats = getHeapStatistics ? getHeapStatistics() : {};
    const spaceStats = getHeapSpaceStatistics ? getHeapSpaceStatistics() : [];
    const rss = process.memoryUsage().rss;
    this.snapshots.push({
      label,
      timestampNs: Number(process.hrtime.bigint()),
      timestampMs: process.hrtime.bigint() / 1000000n,
      rss: rss,
      rssMb: rss / 1048576,
      heapUsed: stats.used_heap_size || 0,
      heapUsedMb: (stats.used_heap_size || 0) / 1048576,
      heapTotal: stats.total_heap_size || 0,
      heapTotalMb: (stats.total_heap_size || 0) / 1048576,
      external: process.memoryUsage().external || 0,
      externalMb: (process.memoryUsage().external || 0) / 1048576,
      arrayBuffers: (process.memoryUsage().arrayBuffers || 0) / 1048576,
      nativeBuffers: (process.memoryUsage().nativeBuffers || 0) / 1048576,
      totalHeapSpaceMb: spaceStats.reduce((sum, s) => sum + s.usedSize, 0) / 1048576,
      heapSpaceDetails: spaceStats.map(s => ({
        name: s.space_name,
        sizeMb: s.space_size / 1048576,
        usedMb: s.space_used_size / 1048576,
        available: s.space_available_size / 1048576,
        physicalSize: s.space_size / 1048576
      }))
    });

    const rssMb = rss / 1048576;
    const heapUsedMb = stats.used_heap_size / 1048576;
    const heapTotalMb = stats.total_heap_size / 1048576;

    if (this.peakRss < rssMb) this.peakRss = rssMb;
    if (this.peakHeapUsed < heapUsedMb) this.peakHeapUsed = heapUsedMb;
    if (this.peakHeapTotal < heapTotalMb) this.peakHeapTotal = heapTotalMb;

    if (this.initialRss === 0) this.initialRss = rss;
    if (this.initialHeapUsed === 0) this.initialHeapUsed = stats.used_heap_size;

    return this.snapshots[this.snapshots.length - 1];
  }

  trackAllocation(size) {
    this.allocations.push({
      size,
      timestampNs: Number(process.hrtime.bigint())
    });
    this.allocationsSinceLastGc++;
    this.totalBytesAllocated += size;
  }

  trackDeallocation(size) {
    this.deallocations.push({
      size,
      timestampNs: Number(process.hrtime.bigint())
    });
  }

  startGcMonitoring() {
    if (process.onGC) {
      process.onGC((type, flags) => {
        this.gcCount++;
        const nowNs = process.hrtime.bigint();
        const pauseNs = nowNs - this.gcStartNs || 0n;
        this.gcPauseNs += pauseNs;
        this.gcPauses.push(Number(pauseNs));
        this.totalGcPauseNs += pauseNs;
        this.gcEvents.push({
          type,
          flags,
          timestampNs: Number(nowNs),
          pauseNs: Number(pauseNs),
          pauseMs: Number(pauseNs) / 1e6,
          allocationsSinceLastGc: this.allocationsSinceLastGc
        });
        this.allocationsSinceLastGc = 0;
      });
    }
  }

  report() {
    const deltaRssMb = this.peakRss - (this.initialRss / 1048576);
    const deltaHeapUsedMb = this.peakHeapUsed - (this.initialHeapUsed / 1048576);
    const heapUtilization = this.peakHeapTotal > 0
      ? this.peakHeapUsed / this.peakHeapTotal
      : 0;

    return {
      snapshotCount: this.snapshots.length,
      peakRssMb: Math.round(this.peakRss * 100) / 100,
      peakHeapUsedMb: Math.round(this.peakHeapUsed * 100) / 100,
      peakHeapTotalMb: Math.round(this.peakHeapTotal * 100) / 100,
      initialHeapUsedMb: Math.round((this.initialHeapUsed / 1048576) * 100) / 100,
      peakRssDeltaMb: Math.round(deltaRssMb * 100) / 100,
      peakHeapDeltaMb: Math.round(deltaHeapUsedMb * 100) / 100,
      heapUtilization: Math.round(heapUtilization * 1000) / 1000,
      gcCount: this.gcCount,
      gcPauseTotalMs: Math.round((Number(this.totalGcPauseNs) / 1e6) * 100) / 100,
      gcPauseMaxMs: Math.round((Math.max(...this.gcPauses, 0) / 1e6) * 100) / 100,
      gcPauseAvgMs: Math.round(((this.gcCount ? Number(this.totalGcPauseNs) / this.gcCount : 0) / 1e6) * 100) / 100,
      allocationsSinceLastGc: this.allocationsSinceLastGc,
      totalAllocations: this.allocations.length,
      totalDeallocations: this.deallocations.length,
      bytesAllocated: this.totalBytesAllocated,
      bytesAllocatedMb: Math.round(this.totalBytesAllocated / 1048576 * 100) / 100,
      averageAllocationSize: this.allocations.length ? Math.round(this.totalBytesAllocated / this.allocations.length) : 0,
      samples: this.snapshots.slice(-5)
    };
  }
}

// ---------------------------------------------------------------- tracer
class Tracer {
  constructor(options = {}) {
    this.options = {
      maxEvents: options.maxEvents || 5000,
      captureMemory: options.captureMemory !== false,
      captureGc: options.captureGc !== false,
      captureStack: options.captureStack !== true,
      autoStart: options.autoStart || false,
      labels: options.labels || [],
      ...options
    };
    this.timers = new Map();
    this.microTimer = new MicroTimer();
    this.eventRecorder = new EventRecorder(this);
    this.memoryTracker = new MemoryTracker(this);
    this.tracedFunctions = new Map();
    this.spans = [];
    this.activeSpans = new Map();
    this.eventRecorder.maxEvents = this.options.maxEvents;
    this.exported = false;
    if (this.options.autoStart) this.start();
  }

  start() {
    this.microTimer.start();
    if (this.options.captureMemory) {
      this.memoryTracker.snapshot('tracer_start');
    }
    if (this.options.captureGc && process.onGC) {
      this.memoryTracker.startGcMonitoring();
    }
    this.eventRecorder.record('tracer:started', {
      options: {
        captureMemory: this.options.captureMemory,
        captureGc: this.options.captureGc,
        captureStack: this.options.captureStack
      }
    });
    return this;
  }

  stop() {
    this.microTimer.stop();
    if (this.options.captureMemory) {
      this.memoryTracker.snapshot('tracer_stop');
    }
    this.eventRecorder.record('tracer:stopped', {
      elapsedNs: Number(this.microTimer.totalElapsedNs),
      sampleCount: this.microTimer.sampleCount
    });
    return this;
  }

  getMemory() {
    return this.memoryTracker.report();
  }

  getTiming() {
    return this.microTimer.stats();
  }

  getEvents() {
    return {
      total: this.eventRecorder.count(),
      byType: this.eventRecorder.byType(),
      events: this.eventRecorder.events
    };
  }

  time(label, fn, ...args) {
    this.eventRecorder.enter(label);
    const startTime = process.hrtime.bigint();
    let result;
    let error;
    try {
      result = fn(...args);
    } catch (e) {
      error = e;
      throw e;
    } finally {
      const elapsedNs = process.hrtime.bigint() - startTime;
      const span = {
        label,
        startTime: Number(startTime),
        endTime: Number(process.hrtime.bigint()),
        elapsedNs: Number(elapsedNs),
        elapsedMs: Number(elapsedNs) / 1e6,
        error: error ? true : false
      };
      this.spans.push(span);
      this.eventRecorder.exit(this.eventRecorder.eventId, result, error);
    }
    return result;
  }

  timeAsync(label, fn, ...args) {
    return new Promise((resolve, reject) => {
      this.eventRecorder.enter(label);
      const startTime = process.hrtime.bigint();
      fn(...args)
        .then(result => {
          const elapsedNs = process.hrtime.bigint() - startTime;
          this.spans.push({
            label,
            startTime: Number(startTime),
            endTime: Number(process.hrtime.bigint()),
            elapsedNs: Number(elapsedNs),
            elapsedMs: Number(elapsedNs) / 1e6
          });
          this.eventRecorder.exit(this.eventRecorder.eventId, result);
          resolve(result);
        })
        .catch(error => {
          this.eventRecorder.exit(this.eventRecorder.eventId, null, error);
          reject(error);
        });
    });
  }

  wrap(label, fn) {
    const tracer = this;
    const wrapped = function (...args) {
      tracer.eventRecorder.enter(label);
      const startTime = process.hrtime.bigint();
      let result;
      let error;
      try {
        result = fn.apply(this, args);
      } catch (e) {
        error = e;
        throw e;
      } finally {
        const elapsedNs = process.hrtime.bigint() - startTime;
        tracer.spans.push({
          label,
          startTime: Number(startTime),
          endTime: Number(process.hrtime.bigint()),
          elapsedNs: Number(elapsedNs),
          elapsedMs: Number(elapsedNs) / 1e6,
          error: error ? true : false
        });
        tracer.eventRecorder.exit(tracer.eventRecorder.eventId, result, error);
      }
      return result;
    };
    this.tracedFunctions.set(label, fn);
    return wrapped;
  }

  mark(label) {
    return this.eventRecorder.mark(label);
  }

  snapshot(label = '') {
    return this.memoryTracker.snapshot(label);
  }

  allocate(size) {
    this.memoryTracker.trackAllocation(size);
  }

  deallocate(size) {
    this.memoryTracker.trackDeallocation(size);
  }

  export(format = 'stdout') {
    this.exported = true;
    const payload = this.buildExport();
    switch (format) {
      case 'json':
        return JSON.stringify(payload, null, 2);
      case 'csv':
        return this.toCsv(payload);
      case 'callback':
        if (typeof this.options.callback === 'function') {
          this.options.callback(payload);
        }
        return payload;
      case 'stdout':
      default:
        console.log('TRACE_JSON ' + JSON.stringify(payload));
        return payload;
    }
  }

  buildExport() {
    const timing = this.microTimer.stats();
    const memory = this.memoryTracker.report();
    const events = this.eventRecorder.events.slice(-1000);

    return {
      type: 'trace',
      version: '1.0.0',
      environment: { ...ENV },
      summary: {
        totalSpans: this.spans.length,
        totalEvents: this.eventRecorder.count(),
        totalMemorySnapshots: memory.snapshotCount,
        totalGcPauses: memory.gcCount,
        gcPauseTotalMs: memory.gcPauseTotalMs,
        peakRssMb: memory.peakRssMb,
        peakHeapUsedMb: memory.peakHeapUsedMb,
        peakHeapTotalMb: memory.peakHeapTotalMb,
        peakHeapDeltaMb: memory.peakHeapDeltaMb,
        durationMs: timing.totalMs,
        sampleCount: timing.count,
        durationNs: Number(timing.totalNs),
        spanCount: this.spans.length,
        errorCount: this.spans.filter(s => s.error).length
      },
      timing: {
        durationMs: timing.totalMs,
        durationNs: Number(timing.totalNs),
        minMs: timing.minMs,
        maxMs: timing.maxMs,
        meanMs: timing.meanMs,
        medianMs: timing.medianMs,
        stddevMs: timing.stddevMs,
        cv: timing.cv,
        p50Ms: timing.medianMs,
        p90Ms: timing.p90Ms,
        p95Ms: timing.p95Ms,
        p99Ms: timing.p99Ms,
        p999Ms: timing.p999Ms,
        sampleCount: timing.count,
        samples: timing.samples.map(s => Number(s))
      },
      memory: memory,
      events: events,
      spans: this.spans,
      exportedAt: new Date().toISOString(),
      exportedAtNs: Number(process.hrtime.bigint())
    };
  }

  toCsv(payload) {
    const header = 'type,label,startTimeNs,endTimeNs,elapsedNs,elapsedMs,error';
    const rows = payload.spans.map(s =>
      [s.label, s.startTime, s.endTime, s.elapsedNs, Number((s.elapsedNs / 1e6).toFixed(4)), s.error ? 1 : 0].join(',')
    );
    return header + '\n' + rows.join('\n');
  }
}

// ---------------------------------------------------------------- convenience
function trace(label, fn, ...args) {
  const tracer = new Tracer();
  tracer.start();
  const result = tracer.time(label, fn, ...args);
  tracer.stop();
  tracer.export();
  return result;
}

function traceAsync(label, fn, ...args) {
  const tracer = new Tracer();
  tracer.start();
  return tracer.timeAsync(label, fn, ...args).then(result => {
    tracer.stop();
    tracer.export();
    return result;
  });
}

module.exports = { Tracer, trace, traceAsync, ENV, MicroTimer, EventRecorder, MemoryTracker };
