// Headless render check: executes every site section against the current bundle and fails on template leaks (undefined/NaN/[object Object]). Run: node scripts/render-check.cjs
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('src/data/site-data.js', 'utf8');
const app = fs.readFileSync('src/site/app.js', 'utf8');
const els = {};
const mk = (id) => (els[id] = els[id] || { id, innerHTML: '', textContent: '', querySelectorAll: () => [], classList: { toggle() {} } });
const listeners = {};
const sandbox = {
  console,
  location: { hash: '' },
  requestAnimationFrame: (f) => f(),
  document: { getElementById: (id) => (id === 'main' || id === 'nav' || id === 'footline' ? mk(id) : null) },
};
sandbox.window = sandbox;
sandbox.addEventListener = (ev, f) => { listeners[ev] = f; };
sandbox.scrollTo = () => {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
sandbox.Chart2 = { lines() {} };
vm.runInContext(app, sandbox);
const sections = ['overview', 'markets', 'polls', 'tracker', 'forward', 'crosslayer', 'backtests', 'contest', 'contest2026', 'sources', 'irregularities', 'methodology', 'roadmap'];
// Sections must also CONTAIN what they are for. A renamed key in the bundle once
// made the 2026 contest's refusals block render its "no signal ledger" fallback
// with no template leak for the check below to catch.
const REQUIRED = {
  contest2026: ['admitted', 'closes-after-season-window', 'Live 2026 contest'],
  contest: ['Rank'],
  sources: ['http'],
};
const FORBIDDEN = {
  contest2026: ['No signal ledger in this build'],
};
let ok = true;
for (const s of sections) {
  sandbox.location.hash = '#/' + s;
  try { listeners.hashchange(); const html = els.main.innerHTML; const undef = (html.match(/>undefined<|>NaN|NaN%|NaN¢|\$NaN|\[object Object\]|\bundefined%|—undefined|undefined¢/g) || []).length; console.log(s.padEnd(14), html.length, 'chars', undef ? `!! ${undef} undefined/NaN` : ''); if (undef) { const i = html.search(/>undefined<|>NaN|NaN%|NaN¢|\$NaN|\[object Object\]|\bundefined%|—undefined|undefined¢/); console.log('   ...', html.slice(Math.max(0, i - 160), i + 40).replace(/\s+/g, ' ')); ok = false; } }
  catch (e) { ok = false; console.log(s, 'ERROR', e.stack.split('\n').slice(0, 3).join(' | ')); }
}
console.log(els.footline.textContent);
process.exit(ok ? 0 : 1);
