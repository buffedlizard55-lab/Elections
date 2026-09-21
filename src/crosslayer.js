/** Cross-layer scores are diagnostics, never official results or trading advice.
 * Probabilities must be finite and in [0,1]. Brier uses the exact probability;
 * only log-loss is clipped to [0.005,0.995]. Outcomes require certification
 * evidence on a registry-approved election authority's origin. No URL alone
 * establishes certification. Forecasts must precede election day (UTC, a
 * deliberately conservative cutoff), including each layer's own timestamp.
 */
export const LAYERS = ['kalshi', 'metaculus', 'ddhq', 'ebo'];
export const isProbability = (p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;
export function clampP(p, lo = 0.005, hi = 0.995) {
  return isProbability(p) ? Math.min(hi, Math.max(lo, p)) : null;
}
export function brier(p, y) {
  return isProbability(p) && (y === 0 || y === 1) ? (p - y) ** 2 : null;
}
export function logLoss(p, y) {
  const q = clampP(p);
  return q !== null && (y === 0 || y === 1) ? -(y * Math.log(q) + (1 - y) * Math.log(1 - q)) : null;
}
/** A quote pair must be complete and non-crossed. A lone quote is not a midpoint. */
export function midpoint(v) {
  if (isProbability(v)) return v;
  if (v && isProbability(v.bid) && isProbability(v.ask) && v.bid <= v.ask) return (v.bid + v.ask) / 2;
  return null;
}
export function spread(layerProbs) {
  const ps = Object.values(layerProbs).map(midpoint).filter((p) => p !== null);
  return ps.length < 2 ? null : Math.max(...ps) - Math.min(...ps);
}
export function validDay(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
export function timestamp(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) || !validDay(s.slice(0, 10))) return NaN;
  return Date.parse(s);
}
function origin(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password ? u.origin : null; } catch { return null; }
}
/** Scope of trust is explicit: verified government entries, not all .gov hosts,
 * news calls, court-document aggregators, forecasts, or exchange settlements.
 * Additional vendor/CDN origins must be directly verified before registration.
 */
export function validateOutcome(out, electionDate, { asOf, authorities = [] } = {}) {
  if (out.y !== 0 && out.y !== 1) return 'outcome y must be 0 or 1';
  if (!validDay(out.certifiedOn) || out.certifiedOn < electionDate) return 'missing/invalid certification date or certification before election';
  if (!validDay(asOf) || out.certifiedOn > asOf) return 'certification is after asOf (or asOf is invalid)';
  if (!Array.isArray(out.sources) || !out.sources.length) return 'outcome has no official certification sources';
  for (const s of out.sources) {
    if (!s || typeof s !== 'object') return 'invalid certification source record';
    const a = authorities.find((x) => x && x.id === s.sourceId && /^Government — /.test(x.category) && x.status === 'verified');
    const allowed = a ? [a.url, ...(a.resultOrigins || [])].map(origin).filter(Boolean) : [];
    if (!origin(s.url) || !allowed.includes(origin(s.url))) return 'outcome source is not on its verified election authority origin';
    if (s.kind !== 'certified-canvass' || typeof s.certificationQuote !== 'string' || s.certificationQuote.trim().length < 20) return 'outcome lacks a certified-canvass evidence quote';
    const fetched = timestamp(s.retrievedAt);
    if (!Number.isFinite(fetched) || fetched < Date.parse(out.certifiedOn) || fetched >= Date.parse(asOf) + 86400000) return 'invalid certification retrieval timestamp';
  }
  return null;
}
const round = (n) => Number(n.toFixed(6));
const mean = (xs) => xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

export function scoreSnapshots(snapshots, outcomes = {}, { asOf = new Date().toISOString().slice(0, 10), authorities = [] } = {}) {
  const rows = [], refused = [], seen = new Set();
  for (const s of snapshots) {
    const layers = {};
    const row = { id: s.id, question: s.question, electionDate: s.electionDate, capturedAt: s.capturedAt, layers, spread: null, status: 'pending' };
    const refuse = (reason, status = 'pending') => { refused.push({ id: s.id, reason }); row.status = status; };
    rows.push(row);
    if (!s.id || !s.question || seen.has(s.id)) { refuse('missing identity or duplicate snapshot id', 'refused-invalid'); continue; }
    seen.add(s.id);
    const captured = timestamp(s.capturedAt), cutoff = Date.parse(s.electionDate);
    if (!validDay(s.electionDate) || !Number.isFinite(captured) || !validDay(asOf) || captured >= Date.parse(asOf) + 86400000) {
      refuse('invalid or future snapshot/election/asOf timestamp', 'refused-invalid'); continue;
    }
    if (captured >= cutoff) { refuse('look-ahead: snapshot on/after election day', 'refused-lookahead'); continue; }
    for (const L of LAYERS) {
      const v = s.layers?.[L];
      if (v == null) continue;
      const p = midpoint(v);
      const t = typeof v === 'object' && v.capturedAt != null ? timestamp(v.capturedAt) : captured;
      if (p === null || !Number.isFinite(t) || t >= cutoff || t >= Date.parse(asOf) + 86400000) {
        refused.push({ id: s.id, layer: L, reason: 'invalid probability, incomplete/crossed quote, or invalid/look-ahead layer timestamp' });
        continue;
      }
      layers[L] = { p }; // keep precision; round only displayed scores
    }
    row.spread = spread(Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.p])));
    const out = Object.hasOwn(outcomes, s.question) ? outcomes[s.question] : null;
    if (!out) continue;
    const why = validateOutcome(out, s.electionDate, { asOf, authorities });
    if (why) { refuse(why); continue; }
    if (!Object.keys(layers).length) { refuse('no valid probabilities', 'refused-invalid'); continue; }
    Object.assign(row, { status: 'scored', y: out.y, certifiedOn: out.certifiedOn, sources: out.sources });
    for (const L of Object.keys(layers)) {
      layers[L].brier = round(brier(layers[L].p, out.y));
      layers[L].logLoss = round(logLoss(layers[L].p, out.y));
    }
  }
  const byLayer = {};
  for (const L of LAYERS) {
    const scored = rows.filter((r) => r.status === 'scored' && r.layers[L]);
    byLayer[L] = { answered: rows.filter((r) => r.layers[L]).length, scored: scored.length,
      meanBrier: mean(scored.map((r) => r.layers[L].brier)), meanLogLoss: mean(scored.map((r) => r.layers[L].logLoss)) };
  }
  // Same question set, one observation per question. Daily snapshots are highly
  // correlated and must not masquerade as independent election outcomes.
  const latest = new Map();
  for (const r of rows) {
    if (r.status !== 'scored' || !r.layers.kalshi || !r.layers.metaculus) continue;
    if (!latest.has(r.question) || timestamp(r.capturedAt) > timestamp(latest.get(r.question).capturedAt)) latest.set(r.question, r);
  }
  const paired = [...latest.values()].map((r) => ({ question: r.question, snapshotId: r.id, capturedAt: r.capturedAt,
    gap: round(r.layers.metaculus.p - r.layers.kalshi.p),
    brierDelta: round(r.layers.metaculus.brier - r.layers.kalshi.brier),
    logLossDelta: round(r.layers.metaculus.logLoss - r.layers.kalshi.logLoss), sources: r.sources }));
  return { asOf, rows, byLayer, refused, pairedComparison: { method: 'Latest eligible jointly answered snapshot per question; deltas = Metaculus minus Kalshi (negative loss delta favors Metaculus). Observational: paired captures can have different intraday timestamps. No claim of independent samples or statistical significance.', rows: paired, questions: paired.length, meanBrierDelta: mean(paired.map((r) => r.brierDelta)), meanLogLossDelta: mean(paired.map((r) => r.logLossDelta)) },
    scoredCount: rows.filter((r) => r.status === 'scored').length, pendingCount: rows.filter((r) => r.status === 'pending').length };
}
