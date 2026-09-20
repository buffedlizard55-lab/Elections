/**
 * Cross-layer scorer (ROADMAP R14 / "P0 after Nov 3").
 * ======================================================
 * Three intelligence layers forecast the same 2026 control questions:
 *   market   — Kalshi (this project's own capture: yes_bid / yes_ask, capturedAt)
 *   forecast — Metaculus community forecasts (midterms hub, server-rendered numbers)
 *   context  — third-party renderings (DDHQ Votes odds, Election Betting Odds cross-platform blend)
 *
 * Nothing here is scored until an OFFICIAL outcome is recorded in data/crosslayer/outcomes.json
 * with a canvass/certification source. Until then every snapshot row is "pending" and the site
 * shows the spread only. This is the look-ahead guard from irregularity #37 applied across layers:
 * a probability captured after the outcome is known is not a forecast and is refused by
 * scoreSnapshots() (capturedAt must precede the electionDate).
 *
 * Scoring rules (documented, not tuned): Brier = (p - y)^2, log-loss = -[y ln p + (1-y) ln(1-p)]
 * with p clamped to [0.005, 0.995] so a confident miss is penalised but finite. Kalshi's p is the
 * bid/ask midpoint of the YES-Democrats market; a layer that only publishes a range (EBO bid-ask)
 * is scored at its midpoint too. Per-layer aggregates are simple means over the questions the layer
 * actually answered — layers are never compared on different question sets without saying so.
 */

export const LAYERS = ['kalshi', 'metaculus', 'ddhq', 'ebo'];

export function clampP(p, lo = 0.005, hi = 0.995) {
  if (typeof p !== 'number' || Number.isNaN(p)) return null;
  return Math.min(hi, Math.max(lo, p));
}

export function brier(p, y) {
  const q = clampP(p);
  if (q === null) return null;
  return (q - y) ** 2;
}

export function logLoss(p, y) {
  const q = clampP(p);
  if (q === null) return null;
  return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
}

/** Midpoint of a {bid, ask} pair or a plain number; null when nothing usable. */
export function midpoint(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const { bid, ask } = v;
  if (typeof bid === 'number' && typeof ask === 'number') return (bid + ask) / 2;
  if (typeof bid === 'number') return bid;
  if (typeof ask === 'number') return ask;
  return null;
}

/** Largest pairwise gap between the layers that answered a question (probability points, 0-1). */
export function spread(layerProbs) {
  const ps = Object.values(layerProbs).map(midpoint).filter((p) => typeof p === 'number');
  if (ps.length < 2) return null;
  return Math.max(...ps) - Math.min(...ps);
}

/**
 * Build the pending/scored table.
 * snapshots: [{ id, question, electionDate, capturedAt, layers: { kalshi:{bid,ask,ticker}, metaculus:p, ddhq:p, ebo:{bid,ask} } }]
 * outcomes:  { [questionId]: { y: 0|1, certifiedOn, sources:[{name,url}] } }
 * asOf: ISO date used ONLY to label rows; scoring is gated by the outcome record, never by the clock.
 */
export function scoreSnapshots(snapshots, outcomes = {}, { asOf = null } = {}) {
  const rows = [];
  const refused = [];
  for (const s of snapshots) {
    const out = outcomes[s.question];
    const layers = {};
    for (const L of LAYERS) {
      const p = midpoint(s.layers?.[L]);
      if (typeof p !== 'number') continue;
      layers[L] = { p: Number(p.toFixed(4)) };
    }
    const row = { id: s.id, question: s.question, electionDate: s.electionDate, capturedAt: s.capturedAt, layers, spread: spread(s.layers || {}), status: 'pending' };
    if (out && out.y !== undefined) {
      if (out.y !== 0 && out.y !== 1) {
        refused.push({ id: s.id, reason: `outcome y must be 0 or 1 (got ${JSON.stringify(out.y)}) — not scored` });
        rows.push(row);
        continue;
      }
      if (!(Array.isArray(out.sources) && out.sources.length && out.sources.every((x) => x.url))) {
        refused.push({ id: s.id, reason: 'outcome recorded without an official source url — not scored' });
        rows.push(row);
        continue;
      }
      if (s.capturedAt >= `${s.electionDate}T00:00:00Z`) {
        refused.push({ id: s.id, reason: `look-ahead: snapshot captured ${s.capturedAt} on/after election day ${s.electionDate}` });
        row.status = 'refused-lookahead';
        rows.push(row);
        continue;
      }
      row.status = 'scored';
      row.y = out.y;
      row.certifiedOn = out.certifiedOn || null;
      for (const L of Object.keys(layers)) {
        layers[L].brier = Number(brier(layers[L].p, out.y).toFixed(4));
        layers[L].logLoss = Number(logLoss(layers[L].p, out.y).toFixed(4));
      }
    }
    rows.push(row);
  }
  const byLayer = {};
  for (const L of LAYERS) {
    const scored = rows.filter((r) => r.status === 'scored' && r.layers[L]);
    const answered = rows.filter((r) => r.layers[L]);
    byLayer[L] = {
      answered: answered.length,
      scored: scored.length,
      meanBrier: scored.length ? Number((scored.reduce((a, r) => a + r.layers[L].brier, 0) / scored.length).toFixed(4)) : null,
      meanLogLoss: scored.length ? Number((scored.reduce((a, r) => a + r.layers[L].logLoss, 0) / scored.length).toFixed(4)) : null,
    };
  }
  return { asOf, rows, byLayer, refused, scoredCount: rows.filter((r) => r.status === 'scored').length, pendingCount: rows.filter((r) => r.status === 'pending').length };
}
