'use strict';
/**
 * Shared helpers for the demos: browser launch with system-Chromium
 * preference, fixture server, process-tree RSS measurement, and the
 * snapshot/restore primitives.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const CHROME_PATHS = ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'];
const findSystemChrome = () => CHROME_PATHS.find((p) => fs.existsSync(p));

// Prefer a system Chromium (no download, matches a real user's browser);
// fall back to Puppeteer's bundled Chrome, then chrome-headless-shell.
async function launch() {
  const exe = findSystemChrome();
  if (exe) return puppeteer.launch({ headless: true, executablePath: exe });
  try {
    return await puppeteer.launch({ headless: true });
  } catch (err) {
    console.warn(
      'bundled chrome unavailable, falling back to chrome-headless-shell:',
      err.message.split('\n')[0]
    );
    return puppeteer.launch({ headless: 'shell' });
  }
}

// Serve the shared heavy fixture over local HTTP so reloads pay a real
// (if local) network + parse cost.
function serveFixture() {
  const fixture = fs.readFileSync(
    path.join(__dirname, '..', 'snap-restore', 'fixture.html'),
    'utf8'
  );
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fixture);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}/fixture`,
        close: () => new Promise((r) => server.close(r)),
      })
    )
  );
}

// Total RSS (kB) of pid and every descendant, read from /proc. Linux-only;
// gives us the browser process tree (browser + zygote + renderers + GPU).
function treeRssKb(rootPid) {
  const children = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync('/proc/' + d + '/stat', 'utf8');
      const close = stat.lastIndexOf(')');
      const fields = stat.slice(close + 2).split(' ');
      const ppid = parseInt(fields[1], 10);
      if (!children.has(ppid)) children.set(ppid, []);
      children.get(ppid).push(parseInt(d, 10));
    } catch {
      /* process exited mid-scan */
    }
  }
  const rss = (pid) => {
    try {
      const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
      const m = status.match(/^VmRSS:\s+(\d+) kB/m);
      return m ? parseInt(m[1], 10) : 0;
    } catch {
      return 0;
    }
  };
  let total = 0;
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    total += rss(pid);
    for (const c of children.get(pid) || []) stack.push(c);
  }
  return total;
}

const heap = async (page) => (await page.metrics()).JSHeapUsedSize;

// Capture the "render state" of a live tab: rendered DOM (scripts stripped),
// scroll position, form values, and shallow top-level JS state.
async function snapshot(page) {
  return page.evaluate(() => {
    const html = document.documentElement.outerHTML.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ''
    );
    const forms = [...document.querySelectorAll('input, textarea, select')].map((el) => ({
      selector: uniqueSelector(el),
      tag: el.tagName,
      type: el.type || '',
      value: el.value,
      checked: el.checked,
      selectedIndex: el.selectedIndex,
    }));

    function uniqueSelector(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 4) {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          part = '#' + CSS.escape(node.id);
          parts.unshift(part);
          break;
        }
        const siblings = [...node.parentNode.children].filter(
          (s) => s.tagName === node.tagName
        );
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        parts.unshift(part);
        node = node.parentNode;
      }
      return parts.join(' > ');
    }

    return {
      html,
      forms,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      demoState: window.__demoState,
      nodeCount: document.querySelectorAll('*').length,
      bytes: html.length,
    };
  });
}

// New tab, replay the snapshot: no network, no script re-execution.
async function restore(page, snap) {
  await page.setContent(snap.html, { waitUntil: 'load' });
  await page.evaluate((s) => {
    window.scrollTo(s.scrollX, s.scrollY);
    for (const f of s.forms) {
      const el = document.querySelector(f.selector);
      if (!el) continue;
      if (f.tag === 'SELECT') el.selectedIndex = f.selectedIndex;
      else if (f.type === 'checkbox' || f.type === 'radio') el.checked = f.checked;
      else el.value = f.value;
    }
    window.__demoState = s.demoState;
  }, snap);
}

module.exports = { launch, serveFixture, treeRssKb, heap, snapshot, restore };
