/**
 * Elections — static site renderer (no build step at browse time).
 * All data arrives from src/data/site-data.js (generated bundle of the
 * verified files under data/). Nothing on the page is typed in by hand
 * except explanatory prose; every figure is read from the bundle.
 */
(function () {
  const D = window.SITE_DATA;
  const C = window.Chart2;
  if (!D) { document.getElementById('main').innerHTML = '<p>site-data.js missing — run <span class="kbd">npm run build-site</span>.</p>'; return; }

  const SECTIONS = [
    ['overview', 'Overview'],
    ['markets', '2026 Markets'],
    ['polls', '2026 Polls'],
    ['tracker', 'Tracker'],
    ['forward', 'Forward Loop (full universe)'],
    ['crosslayer', 'Cross-layer'],
    ['backtests', 'Backtests'],
    ['contest', 'Contest'],
    ['sources', 'Sources'],
    ['irregularities', 'Irregularities'],
    ['methodology', 'Methodology'],
    ['roadmap', 'Roadmap'],
  ];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (x) => (x == null ? '—' : '$' + Number(x).toLocaleString('en-US', { maximumFractionDigits: 0 }));
  const usd = (x) => (x == null ? '—' : '$' + Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  const int = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US', { maximumFractionDigits: 0 }));
  const pct = (x, d = 1) => (x == null ? '—' : (x * 100).toFixed(d) + '%');
  // Market lifecycle chip: exchange status when recorded (closed/finalized/settled), else a past close_time
  // (trading ended, settlement pending — the event stays open until every market settles).
  const lifeChip = (m, ref) => {
    if (!m) return '';
    if (m.status && m.status !== 'active' && m.status !== 'open') return ` <span class="chip warn" title="exchange status at capture">${esc(m.status)}</span>`;
    if (m.close_time && ref && m.close_time < ref) return ' <span class="chip warn" title="close_time is before the capture; trading has ended, settlement pending">past close</span>';
    return '';
  };
  const cents = (x) => (x == null ? '—' : (x * 100).toFixed(x < 0.1 ? 1 : 0) + '¢');
  const pp = (x, d = 1) => (x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(d) + 'pp');
  const cls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
  const day = (iso) => (iso ? String(iso).slice(0, 10) : '—');

  function srcs(urls) {
    if (!urls || !urls.length) return '';
    const seen = new Set();
    const items = urls.filter((u) => u && /^https?:/.test(u) && !seen.has(u) && seen.add(u))
      .map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, '').slice(0, 60))}</a>`).join('');
    return items ? `<div class="srcs">${items}</div>` : '';
  }

  // implied probability: same rule as src/kalshi-api.js impliedProb (book mid when tight, else last)
  function implied(m) {
    if (m.yes_bid != null && m.yes_ask != null && m.yes_bid > 0 && m.yes_ask < 1 && m.yes_ask - m.yes_bid <= 0.10) return { p: (m.yes_bid + m.yes_ask) / 2, basis: 'mid' };
    if (m.last_price != null && m.last_price > 0) return { p: m.last_price, basis: 'last' };
    return { p: null, basis: 'none' };
  }
  const U = D.universe; // may be null before the first collector run
  const PL = D.pollLayer;
  const BT = D.backtests.marketBacktest;
  const CT = D.contest;
  const allLb = CT.universes && CT.universes['all-2024'] ? CT.universes['all-2024'].leaderboard : CT.leaderboard;
  const coreLb = CT.universes && CT.universes['core-2024'] ? CT.universes['core-2024'].leaderboard : CT.leaderboard;

  function findEvent(ticker) { return U ? U.events.find((e) => e.event_ticker === ticker) : null; }

  // ---------- OVERVIEW ----------
  function overview() {
    const sources = D.sources.sources.length;
    const irregular = D.irregularities.items.length;
    const leader = allLb[0];
    const t1 = BT.aggregate.find((a) => a.nDays === 1);
    const fav1 = (BT.favoriteAccuracy || []).find((a) => a.nDays === 1);
    const days = D.tracker ? D.tracker.days.length : 0;
    return `
    <div class="eyebrow">PUBLIC DATA · REPRODUCIBLE RESEARCH · PAPER TRADING ONLY</div>
    <h1>Election intelligence, with evidence.</h1>
    <div class="evidence-strip" aria-label="Data status">
      <div><span class="chip info">Source review</span><strong>${esc(D.sources.updated)}</strong><span>${sources} registered sources · <a href="#/sources">Review the evidence →</a></span></div>
      <div><span class="chip info">Market snapshot</span><strong>${U ? esc(day(U.capturedAt)) : 'Not available'}</strong><span>Capture time, not real-time prices · <a href="#/markets">Browse markets →</a></span></div>
      <div><span class="chip warn">Official scoring</span><strong>${D.crossLayer ? D.crossLayer.scored.scoredCount : 0} scored snapshots</strong><span>2026 outcomes await certified canvasses · <a href="#/crosslayer">View comparisons →</a></span></div>
    </div>
    <p class="lead">A verification-first election intelligence project: <strong>official, free, public data only</strong>.
    It collects the open political/election prediction-market universe every day, backtests <em>polls and markets</em> against
    <em>verified official outcomes</em>, tracks a live 2026 poll layer, flags every irregularity it finds, and runs a paper-trading
    forecasting contest (reverse-engineered from TradingView's <a href="https://www.tradingview.com/the-leap/crypto-series-may-2026/" target="_blank" rel="noopener">The Leap</a>)
    on Kalshi's settled election markets.</p>
    <div class="grid cols4">
      <div class="stat"><div class="n">${sources}</div><div class="l">verified sources in the master list (line-by-line; last batch ${esc(D.sources.updated)})</div></div>
      <div class="stat"><div class="n">${BT.universe.total}</div><div class="l">settled 2024 Kalshi markets backtested (${BT.universe.core2024} core + ${BT.universe.senate2024} per-state Senate) · favourite at T-1 right ${fav1 ? pct(fav1.rate, 1) : '—'} of ${fav1 ? fav1.n : '—'}</div></div>
      <div class="stat"><div class="n">${U ? int(U.counts.openMarketsTraded) : '—'}</div><div class="l">traded open political markets in the daily tracker (${U ? int(U.counts.openEvents) : '—'} events · ${days} day${days === 1 ? '' : 's'} collected)</div></div>
      <div class="stat"><div class="n">${irregular}</div><div class="l">irregularities &amp; discrepancies flagged for review</div></div>
    </div>
    <div class="callout good"><strong>Evidence, not guarantees.</strong> Source links and capture metadata are recorded in <span class="mono">data/</span>.
    <span class="mono">npm run lint</span> checks provenance structure, not the truth of a source. Registry admission does not certify every linked result. Captured-vs-inferred values are labeled; modelled mappings are called modelled.
    Strategies contain no hard-coded outcomes — only executable <span class="mono">decide()</span> rules. Fills are refused on days with no trade and capped at 10% of the day's volume.</div>
    <div class="grid cols2">
      <div class="card"><h3>What's inside</h3>
        <ul style="margin:8px 0 0; padding-left:20px; font-size:14.5px">
          <li><a href="#/markets">2026 Markets</a> — chamber control, all priced Senate races with Cook/Inside Elections ratings, the most-traded events, and cross-market consistency checks — from the daily API capture.</li>
          <li><a href="#/polls">2026 Polls</a> — generic-ballot and state-race polls transcribed from primary releases, put next to the market price and the raters.</li>
          <li><a href="#/tracker">Tracker</a> — the forward "expected vs actual" loop: what is collected each day, the calibration scorer waiting for settlements, and the two-collector cross-check.</li>
          <li><a href="#/backtests">Backtests</a> — ${BT.universe.total} settled 2024 markets (Brier / log-loss / calibration curve) and the 538 poll archive vs market vs outcome.</li>
          <li><a href="#/contest">Contest</a> — ${CT.results.length} paper-trading entrants with testable theses, $100k each, Kalshi's real fee schedule, The Leap's ranking rules.</li>
          <li><a href="#/sources">Sources</a> — the master list with per-entry verification notes; <a href="#/irregularities">Irregularities</a> — everything that didn't reconcile.</li>
        </ul>
      </div>
      <div class="card"><h3>Headline findings (verified)</h3>
        <p style="font-size:14.5px; margin:6px 0"><strong>2024 markets:</strong> across ${t1 ? t1.nMarkets : '—'} settled markets the day-before price had a mean Brier of <strong>${t1 && t1.meanBrier != null ? t1.meanBrier.toFixed(3) : '—'}</strong>;
        the market favourite won ${fav1 ? pct(fav1.rate, 1) : '—'} of the time. <a href="#/backtests">Details</a>.</p>
        <p style="font-size:14.5px; margin:6px 0"><strong>2024 polls:</strong> the final archived 538 national average (2024-09-12) was <strong>Harris +2.82pp</strong>;
        the official outcome was <strong>Trump +1.45pp</strong> — a 4.3pp miss in the wrong direction. The Kalshi presidential market was closer.</p>
        <p style="font-size:14.5px; margin:6px 0"><strong>2026 so far:</strong> ${PL && PL.ratingsComparison ? `Kalshi prices <strong>${PL.ratingsComparison.reviewCount} of ${PL.ratingsComparison.rows.length}</strong> rated Senate races outside the bands implied by both Cook and Inside Elections (all toward Democrats) — flagged for review, not asserted.` : 'poll layer not built yet.'}
        Contest leader on the full 2024 universe: <span class="mono">@${esc(leader ? leader.username : '—')}</span> at ${leader ? (leader.realizedPnlPct > 0 ? '+' : '') + leader.realizedPnlPct.toFixed(1) : '—'}%.</p>
      </div>
    </div>`;
  }

  // ---------- 2026 MARKETS ----------
  function ratingChip(label) {
    if (!label) return '';
    const l = label.toLowerCase();
    const c = l.includes('toss') ? 'warn' : l.includes('solid') ? 'bad' : l.includes('likely') ? 'info' : 'good';
    return `<span class="chip ${c}">${esc(label)}</span>`;
  }
  function markets() {
    if (!U) return `<h1>2026 Markets</h1><p class="lead">No daily capture yet — the collector runs on GitHub Actions (<span class="mono">daily-collection.yml</span>).</p>${legacySnapshot()}`;
    const ratings = {};
    if (PL && PL.raceRatings) for (const r of PL.raceRatings.senate2026) ratings[r.kalshiEvent] = r;
    const control = ['CONTROLS-2026', 'CONTROLH-2026'].map((t) => {
      const ev = findEvent(t);
      if (!ev) return '';
      const rows = ev.markets.map((m) => { const ip = implied(m); return `<tr><td>${esc(m.yes_sub_title)}</td><td class="num">${cents(m.yes_bid)}–${cents(m.yes_ask)}</td><td class="num">${cents(m.last_price)}</td><td class="num"><strong>${pct(ip.p, 1)}</strong></td><td class="num">${int(m.volume)}</td></tr>`; }).join('');
      return `<div class="card"><h3 style="margin-top:0">${esc(ev.title)}</h3>
        <table><thead><tr><th>Outcome</th><th class="num">Bid–ask</th><th class="num">Last</th><th class="num">Implied</th><th class="num">Volume (contracts)</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="small">${esc(ev.sub_title || '')} · <a href="https://kalshi.com/markets/${esc(ev.series_ticker.toLowerCase())}" target="_blank" rel="noopener">kalshi.com</a> · <a href="https://api.elections.kalshi.com/trade-api/v2/events/${esc(ev.event_ticker)}?with_nested_markets=true" target="_blank" rel="noopener">API</a></p></div>`;
    }).join('');
    const senate = U.events.filter((e) => /^SENATE[A-Z]{2}S?-26$/.test(e.event_ticker)).map((e) => {
      const dem = e.markets.find((m) => /-D$/.test(m.ticker)) || null;
      const rep = e.markets.find((m) => /-R$/.test(m.ticker)) || null;
      const other = e.markets.filter((m) => m !== dem && m !== rep);
      const pd = dem ? implied(dem).p : null;
      const pr = rep ? implied(rep).p : null;
      const r = ratings[e.event_ticker];
      return { state: e.event_ticker.replace(/^SENATE([A-Z]{2})S?-26$/, '$1') + (e.event_ticker.includes('S-26') ? ' (special)' : ''), title: e.title, dem, rep, other, pd, pr, r, vol: e.volume, ticker: e.event_ticker };
    }).sort((a, b) => (b.pd || 0) - (a.pd || 0));
    const senateRows = senate.map((s) => `<tr>
      <td><strong>${esc(s.state)}</strong></td>
      <td>${s.dem ? esc(s.dem.yes_sub_title) : '—'}</td>
      <td><div class="bar-track"><div class="bar-fill dem" style="width:${s.pd == null ? 0 : Math.round(s.pd * 100)}%"></div></div></td>
      <td class="num">${pct(s.pd, 1)}</td>
      <td>${s.rep ? esc(s.rep.yes_sub_title) : '—'}</td>
      <td class="num">${pct(s.pr, 1)}</td>
      <td class="small">${s.other.map((m) => `${esc(m.yes_sub_title)} ${pct(implied(m).p, 1)}`).join(' · ')}</td>
      <td>${s.r ? ratingChip(s.r.cook) + ' ' + ratingChip(s.r.inside) : ''}</td>
      <td class="num">${int(s.vol)}</td></tr>`).join('');
    const top = U.topMarkets.filter((m) => m.us_election).slice(0, 25).map((m) => `<tr>
      <td><span class="mono small">${esc(m.ticker)}</span><br>${esc(m.title)}</td>
      <td class="num">${cents(m.yes_bid)}–${cents(m.yes_ask)}</td>
      <td class="num"><strong>${pct(m.p, 1)}</strong> <span class="small">${esc(m.basis)}</span></td>
      <td class="num">${int(m.volume)}</td><td class="num">${int(m.open_interest)}</td><td class="small">${day(m.close_time)}${lifeChip(m, U.capturedAt)}</td></tr>`).join('');
    const events = U.events.filter((e) => !/^(SENATE|CONTROL)/.test(e.event_ticker)).slice(0, 40).map((e) => `
      <div class="card"><div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <strong>${esc(e.title)}</strong><span class="small">${int(e.volume)} contracts · ${e.markets_total} market${e.markets_total === 1 ? '' : 's'}${e.markets_untraded ? ` (${e.markets_untraded} untraded)` : ''}</span></div>
        <div class="legend" style="margin-top:8px">${e.markets.slice(0, 6).map((m) => `<span><i style="background:var(--accent)"></i>${esc(m.yes_sub_title || m.ticker)} — <strong>${pct(implied(m).p, 1)}</strong>${lifeChip(m, U.capturedAt)}</span>`).join('')}${e.markets.length > 6 ? `<span class="small">+${e.markets.length - 6} more</span>` : ''}</div>
        <div class="small" style="margin-top:6px"><span class="mono">${esc(e.event_ticker)}</span> · ${esc(e.category)} · closes ${day(e.markets[0] && e.markets[0].close_time)}</div></div>`).join('');
    const dw = D.discrepancyWatch;
    const findings = dw ? dw.findings.filter((f) => f.us_election).slice(0, 12).map((f) => `<tr>
      <td><span class="chip ${f.severity === 'high' ? 'bad' : ''}">${esc(f.check)}</span></td>
      <td><span class="mono small">${esc(f.ticker || f.event_ticker)}</span>${f.title ? '<br>' + esc(f.title) : ''}</td>
      <td class="small">${f.sumOfMids != null ? `sum of YES mids ${f.sumOfMids.toFixed(3)} over ${f.markets} markets` : `bid ${cents(f.yes_bid)} / ask ${cents(f.yes_ask)} / last ${cents(f.last_price)}`}</td>
      <td class="num">${int(f.volume)}</td></tr>`).join('') : '';
    return `
    <h1>2026 Markets (daily capture ${esc(U.date)})</h1>
    <p class="lead">The open political/election universe on Kalshi from the official public API: ${int(U.counts.openEvents)} open events
    (${int(U.counts.usElectionEvents)} tagged U.S. election) with ${int(U.counts.openMarkets)} markets, ${int(U.counts.openMarketsTraded)} of them ever traded.
    Implied probability = order-book midpoint when the book is tight, else last trade (basis shown). Source per table: the event's API URL.</p>

    <h2>Chamber control</h2>
    <div class="grid cols2">${control}</div>

    <h2>Senate races priced on Kalshi (${senate.length}) — with Cook / Inside Elections ratings</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>State</th><th>Democrat</th><th>D share</th><th class="num">D %</th><th>Republican</th><th class="num">R %</th><th>Other listed</th><th>Cook · Inside</th><th class="num">Volume</th></tr></thead>
      <tbody>${senateRows}</tbody></table>
      <p class="small">Ratings: Cook Political Report (${PL && PL.raceRatings ? esc(PL.raceRatings.sources.cook.asOf) : '—'}) · Inside Elections (${PL && PL.raceRatings ? esc(PL.raceRatings.sources.inside.asOf) : '—'}); only the 13 rated-competitive seats carry chips.
      Nebraska's main non-Republican candidate is independent Dan Osborn (listed under "Other"). Market-vs-rating gaps are analysed on the <a href="#/polls">2026 Polls</a> page.</p></div>

    <h2>Most-traded U.S. election markets</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>Market</th><th class="num">Bid–ask</th><th class="num">Implied</th><th class="num">Volume</th><th class="num">Open interest</th><th>Closes</th></tr></thead>
      <tbody>${top}</tbody></table></div>

    <h2>Other U.S. election events by volume (governors, mayors, primaries, seat counts…)</h2>
    <div class="grid cols2">${events}</div>

    <h2>Cross-market consistency (U.S. election findings, today)</h2>
    <div class="card" style="overflow-x:auto">
      <p class="small" style="margin-top:0">${dw ? esc(dw.method) : ''} Today: ${dw ? Object.entries(dw.counts).map(([k, v]) => `${esc(k)} ${v}`).join(' · ') : '—'} over ${dw ? int(dw.eventsChecked) : '—'} events.</p>
      <table><thead><tr><th>Check</th><th>Market / event</th><th>Observation</th><th class="num">Volume</th></tr></thead><tbody>${findings || '<tr><td colspan="4">none</td></tr>'}</tbody></table></div>
    ${legacySnapshot()}`;
  }

  function legacySnapshot() {
    const s = D.snapshot;
    const checks = (s.crossPlatformChecks || []).map((c) => `
      <div class="card"><strong>${esc(c.market)}</strong>
        <div class="small" style="margin-top:6px">Kalshi: ${esc(c.kalshiPct != null ? c.kalshiPct + '%' : (c.kalshi || ''))}
        ${c.polymarketPct != null ? `· Polymarket: ${c.polymarketPct}% (${money(c.polymarketVolumeDollars)} vol)` : ''}
        ${c.predictit ? `· PredictIt: ${esc(c.predictit)}` : ''}
        ${c.asOf ? `· as of ${esc(c.asOf)}` : ''}</div>
        ${c.divergence ? `<div class="small" style="margin-top:4px"><strong>Assessment:</strong> ${esc(c.divergence)}</div>` : ''}
        ${(c.historical || []).map((h) => `<div class="small">— ${esc(h.date)}: ${esc(h.value)}</div>`).join('')}
        ${srcs((c.sources || []).concat(c.historical || []).map((x) => x.source || x))}</div>`).join('');
    return `
    <h2>Cross-platform checks (hand-captured ${esc(day(s.capturedAt))})</h2>
    ${checks}
    <div class="callout warn"><strong>Universe note.</strong> 34 of 35 Senate seats have tradeable markets (Louisiana thin) and only a minority of House districts are individually priced
    (irregularity #9). The hand-captured Midterms Hub board of ${esc(day(s.capturedAt))} remains in <span class="mono">data/kalshi/snapshot-2026-09-18.json</span>; the tables above are regenerated from the API every day.</div>`;
  }

  // ---------- 2026 POLLS ----------
  function polls() {
    if (!PL) return '<h1>2026 Polls</h1><p class="lead">Poll layer not built.</p>';
    const gb = PL.genericBallot.map((p) => `<tr>
      <td><strong>${esc(p.pollster)}</strong><br><span class="small">${esc(p.question)}</span>${p.methodFamily ? ` <span class="chip info" title="method family (irregularity #49): ${esc(p.methodNote || '')}">${esc(p.methodFamily)}</span>` : ''}${p.scope ? `<br><span class="small">${esc(p.scope)}</span>` : ''}</td>
      <td class="small">${esc(p.fieldDates)}</td><td class="small">${esc(p.population)}${p.n ? ` · n=${int(p.n)}` : ''}${p.moe ? ` · ±${p.moe}` : ''}</td>
      <td class="num">${p.D}</td><td class="num">${p.R}</td><td class="num ${cls(p.D - p.R)}">${pp(p.D - p.R, 0)}</td>
      <td class="num">${p.trumpApproval && p.trumpApproval.approve != null ? `${p.trumpApproval.approve} / ${p.trumpApproval.disapprove == null ? '—' : p.trumpApproval.disapprove}` : '—'}</td>
      <td>${srcs([p.source])}</td></tr>`).join('');
    const agg = PL.aggregatorReadings.map((a) => `<tr><td><strong>${esc(a.aggregator)}</strong><br><span class="small">${esc(a.verifiedVia)}</span></td><td class="small">${esc(a.window)} (as of ${esc(a.asOf)})</td><td class="small">${a.pollsInAverage} polls</td><td class="num">${a.D}</td><td class="num">${a.R}</td><td class="num pos">${esc(a.spread)}</td><td></td><td>${srcs([a.source])}</td></tr>`).join('');
    const mc = PL.marketComparison;
    // group by race (state), newest field period first inside a race; JSON order stays provenance order
    const raceRows = mc.rows.map((r, i) => ({ r, i })).sort((a, b) => a.r.race.localeCompare(b.r.race) || String(b.r.fieldDates).localeCompare(String(a.r.fieldDates)) || a.i - b.i).map((x) => x.r);
    const races = raceRows.map((r) => `<tr>
      <td><strong>${esc(r.race)}</strong><br><span class="small">${esc(r.pollster)} · ${esc(r.fieldDates)}${r.n ? ` · n=${int(r.n)}` : ''}${r.moe ? ` · ±${r.moe}` : ''}${r.review ? ` <span class="chip warn" title="${esc(r.candidateMismatch || r.methodNote || 'Incomplete source metadata; see primary release')}">review</span>` : ''}${r.methodFamily ? ` <span class="chip info" title="${esc(r.methodNote || 'method family (irregularity #49)')}">${esc(r.methodFamily)}</span>` : ' <span class="chip warn">method unclassified</span>'}</span></td>
      <td>${esc(r.dem)} <strong>${r.demPct}</strong> · ${esc(r.rep)} <strong>${r.repPct}</strong></td>
      <td class="num ${cls(r.demMargin)}">${pp(r.demMargin, 0)}${r.withinMoe ? ' <span class="small">(within MoE)</span>' : ''}</td>
      <td class="num">${pct(r.pollImpliedDemProb, 1)}</td>
      <td class="num"><strong>${pct(r.marketDemProb, 1)}</strong> <span class="small">${r.kalshiDemTicker ? esc(r.kalshiDemTicker) : '— (null by design)'} · ${esc(r.marketBasis)}</span></td>
      <td class="num ${cls(r.gap)}">${r.gap == null ? '—' : pp(r.gap * 100, 1)}</td>
      <td>${srcs([r.source])}</td></tr>`).join('');
    const rc = PL.ratingsComparison;
    const rat = rc.rows.map((r) => `<tr ${r.review ? 'style="background:var(--warn-soft)"' : ''}>
      <td><strong>${esc(r.state)}</strong> <span class="small">${esc(r.seat)}</span></td>
      <td>${ratingChip(r.cook)}</td><td>${ratingChip(r.inside)}</td>
      <td>${esc(r.candidate || '')} <span class="small">(${esc(r.side)})</span></td>
      <td class="num"><strong>${pct(r.marketProb, 1)}</strong></td>
      <td class="small">${r.withinCookBand == null ? '—' : r.withinCookBand ? 'in band' : 'outside'} · ${r.withinInsideBand == null ? '—' : r.withinInsideBand ? 'in band' : 'outside'}</td>
      <td>${r.review ? '<span class="chip warn">review</span>' : ''}${r.note ? `<div class="small">${esc(r.note)}</div>` : ''}</td></tr>`).join('');
    const ex = PL.exitPollStatus;
    return `
    <h1>2026 Polls — verified poll layer vs the market</h1>
    <p class="lead">${esc(PL.method)}</p>
    <div class="callout"><strong>Admission rule.</strong> ${esc(PL.policy)}</div>

    <h2>Generic congressional ballot</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>Poll</th><th>Field dates</th><th>Sample</th><th class="num">D</th><th class="num">R</th><th class="num">Margin</th><th class="num">Trump appr. / disappr.</th><th>Source</th></tr></thead>
      <tbody>${gb}${agg}</tbody></table>
      <p class="small">The RealClearPolling row is an aggregator reading (component polls listed on its page), not a poll.</p></div>
    <div class="card"><h3 style="margin-top:0">Marquette Law School national trend (Nov 2025 → Sep 2026)</h3>
      <canvas id="mq-chart" class="chart"></canvas>
      <div class="legend"><span><i style="background:#1f5fbf"></i>Likely voters, D − R (pp)</span><span><i style="background:#9aa7b5"></i>Registered voters, D − R (pp)</span></div>
      <p class="small">Source: Marquette Law School Poll national release PDF (trend tables), fetched ${esc(PL.genericBallot.find((p) => p.id === 'marquette-national-2026-09').verifiedOn)}.</p></div>

    <h2>State Senate races — poll margin vs Kalshi price</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>Race / poll</th><th>Toplines</th><th class="num">D − R</th><th class="num">Poll ⇒ P(D)<sup>a</sup></th><th class="num">Kalshi P(D) ${esc(mc.rows[0] ? mc.rows[0].marketDate : '')}</th><th class="num">Market − poll</th><th>Source</th></tr></thead>
      <tbody>${races}</tbody></table>
      <p class="small"><sup>a</sup> ${esc(mc.method)}</p></div>

    <h2>Race ratings vs Kalshi (13 rated-competitive Senate seats)</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>Seat</th><th>Cook (${esc(rc.asOf.cook)})</th><th>Inside Elections (${esc(rc.asOf.inside)})</th><th>Kalshi market (non-R side)</th><th class="num">P</th><th>Cook · Inside band</th><th></th></tr></thead>
      <tbody>${rat}</tbody></table>
      <p class="small">${esc(rc.method)} <strong>${rc.reviewCount} of ${rc.rows.length}</strong> flagged today (irregularity #33).</p></div>

    <h2>Exit polls — status</h2>
    <div class="card"><p style="font-size:14.5px; margin:0">${esc(ex.finding)}</p>${srcs(ex.sources)}</div>`;
  }
  function drawPollCharts() {
    const cv = document.getElementById('mq-chart');
    const mq = PL && PL.genericBallot.find((p) => p.id === 'marquette-national-2026-09');
    if (!cv || !mq) return;
    const toPts = (arr) => arr.map((w) => ({ x: w.fieldDates.slice(11), y: w.D - w.R }));
    C.lines(cv, [
      { label: 'LV', color: '#1f5fbf', points: toPts(mq.trend.likelyVoters) },
      { label: 'RV', color: '#9aa7b5', points: toPts(mq.trend.registeredVoters) },
    ], { yFmt: (v) => (v > 0 ? '+' : '') + v.toFixed(0), hLines: [{ y: 0, label: 'tie', color: '#9aa7b5' }] });
  }

  // ---------- TRACKER ----------
  function tracker() {
    const cal = D.calibration;
    const cc = D.crosscheck;
    const st = D.settlements;
    if (!U || !cal) return '<h1>Tracker</h1><p class="lead">No collector output yet.</p>';
    const cats = Object.entries(U.counts.byCategory || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${int(v)}</td></tr>`).join('');
    const leads = cal.byLead.map((b) => `<tr><td class="num">T-${b.nDays}</td><td class="num">${b.nMarkets}</td><td class="num">${b.meanBrier == null ? '—' : b.meanBrier.toFixed(3)}</td><td class="num">${b.meanLogloss == null ? '—' : b.meanLogloss.toFixed(3)}</td></tr>`).join('');
    const hist = D.tracker && D.tracker.days.length > 1 ? U.topMarkets.filter((m) => m.us_election).slice(0, 6).map((m, i) => `<div class="card"><strong>${esc(m.title)}</strong><canvas id="tr-${i}" class="chart" style="height:150px"></canvas></div>`).join('') : `<div class="card"><p class="small" style="margin:0">Price history charts appear once more than one day has been collected (currently ${D.tracker ? D.tracker.days.length : 0}).</p></div>`;
    // the watchlist only contains U.S.-election events; the flag is kept for clarity
    const upcoming = (m) => m.close_time && m.close_time >= U.capturedAt && (!m.status || m.status === 'active' || m.status === 'open');
    const soon = U.events.filter((e) => e.us_election !== 0 && e.markets.some(upcoming)).map((e) => ({ e, close: e.markets.filter(upcoming).reduce((m, x) => (x.close_time < m ? x.close_time : m), '9999') })).sort((a, b) => (a.close < b.close ? -1 : 1)).slice(0, 12)
      .map(({ e, close }) => `<tr><td><span class="mono small">${esc(e.event_ticker)}</span><br>${esc(e.title)}</td><td>${day(close)}</td><td class="num">${int(e.volume)}</td></tr>`).join('');
    const runs = (D.tracker.runs || []).slice().reverse().map((r) => {
      const c = r.consistency || {};
      const x = r.crosscheck;
      return `<tr><td class="mono small">${esc(r.date)}${r.replayedAt ? ' <span class="chip info" title="record rebuilt offline from the saved capture">replayed</span>' : ''}${r.shrinkRatioVsPrevious != null && r.shrinkRatioVsPrevious < 0.9 ? ` <span class="chip warn">${pct(r.shrinkRatioVsPrevious, 0)} of previous</span>` : ''}</td><td class="num">${int(r.seriesInRegistry)}</td><td class="num">${int(r.openEvents)}</td><td class="num">${int(r.usElectionEvents)}</td><td class="num">${int(r.openMarketsTraded)} / ${int(r.openMarkets)}</td><td class="num">${int(r.settlementsKnown)}${r.settlementsFound ? ` (+${int(r.settlementsFound)})` : ''}</td><td class="num">${int(r.settledMarketsScored)}${r.brierT1 != null ? ` · ${r.brierT1.toFixed(3)}` : ''}</td><td class="num">${int(c['mutually-exclusive-sum-over'] || 0)} / ${int(c['mutually-exclusive-sum-under'] || 0)} / ${int(c['stale-last-vs-book'] || 0)}</td><td class="num">${x ? `${pct(x.lastShare, 1)} of ${int(x.overlap)}${x.volumeDecreased ? ` · <span class="chip warn">${x.volumeDecreased} volume decreases</span>` : ''}` : '—'}</td><td class="num">${r.apiRequests ? `${int(r.apiRequests)} · ${(r.apiBytes / 1e6).toFixed(0)}` : '—'}${r.errors ? ` <span class="chip warn">${r.errors} err</span>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="10">No run history yet.</td></tr>';
    const ccRows = cc ? (cc.largestLastPriceDifferences || []).map((o) => `<tr><td class="mono small">${esc(o.ticker)}</td><td class="num">${cents(o.node.last)} (${cents(o.node.bid)}–${cents(o.node.ask)})</td><td class="num">${cents(o.python.last)} (${cents(o.python.bid)}–${cents(o.python.ask)})</td><td class="num">${(o.dLast * 100).toFixed(1)}¢</td></tr>`).join('') : '';
    return `
    <h1>Tracker — the forward "expected vs actual" loop</h1>
    <p class="lead">Every day a GitHub Actions job (<span class="mono">daily-collection.yml</span>, 12:30 UTC) captures the series registry (<span class="mono">GET /series?category=Elections|Politics</span>),
    every open event with nested markets, and re-checks earlier tickers for settlements (<span class="mono">GET /markets?tickers=…</span>). Prices are appended to
    <span class="mono">data/kalshi/tracker/daily/YYYY-MM-DD.csv</span>; when a market settles, the scorer computes Brier / log-loss at fixed lead times and a pooled calibration curve.
    Nothing is imputed: the empty state below is the honest state.</p>
    <div class="grid cols4">
      <div class="stat"><div class="n">${D.tracker.days.length}</div><div class="l">collection day${D.tracker.days.length === 1 ? '' : 's'} (${esc(D.tracker.days[0])} → ${esc(D.tracker.days[D.tracker.days.length - 1])})</div></div>
      <div class="stat"><div class="n">${int(D.tracker.tickers)}</div><div class="l">traded tickers in the index (untraded ladders counted, not stored)${(() => { const fin = U.counts.openMarketsFinalizedInFeed || 0; const pend = U.counts.openMarketsClosedBeforeCapture != null ? Math.max(0, U.counts.openMarketsClosedBeforeCapture - fin) : null; return `${pend ? ` · ${int(pend)} past their close_time, settlement pending` : ''}${fin ? ` · ${int(fin)} already settled in the feed (recorded as settlements, not tracked)` : ''}`; })()}</div></div>
      <div class="stat"><div class="n">${int(cal.scoreableMarkets != null ? cal.scoreableMarkets : cal.settledMarkets)}</div><div class="l">settled markets scored (priced before they settled) · ${st ? int(st.count) : 0} settlements known${cal.observationsExcludedAsLookAhead ? ` · ${int(cal.observationsExcludedAsLookAhead)} post-settlement price rows excluded as look-ahead` : ''}</div></div>
      <div class="stat"><div class="n">${cc ? pct(cc.lastPrice.share, 2) : '—'}</div><div class="l">Node-vs-Python last-price agreement (≤2¢) on ${cc ? int(cc.overlap) : '—'} overlapping tickers</div></div>
    </div>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Universe by category (${esc(U.date)})</h3>
        <table><thead><tr><th>Category (series)</th><th class="num">Open events</th></tr></thead><tbody>${cats}</tbody></table>
        <p class="small">Registry: ${int(U.counts.seriesInRegistry)} series · exchange-wide open events (all categories): ${int(U.counts.exchangeWideOpenEvents)} · U.S.-election tag: ${int(U.counts.usElectionEvents)} events.</p></div>
      <div class="card"><h3 style="margin-top:0">Live calibration (settled markets only)</h3>
        <table><thead><tr><th class="num">Lead</th><th class="num">Markets</th><th class="num">Mean Brier</th><th class="num">Mean log-loss</th></tr></thead><tbody>${leads}</tbody></table>
        <p class="small">${esc(cal.method)}</p>
        <p class="small">First large U.S. settlements expected after <strong>Nov 3, 2026</strong> (Los Angeles mayor, 35 Senate races, governors); primaries and specials settle earlier. ${st && st.count ? `The ${int(st.count)} settlements already on file are rungs that had settled before the tracker's first day (found nested inside still-open events, irregularity #37) — they are recorded, but a price captured after settlement is not a forecast, so they are not scored.` : ''}</p></div>
    </div>
    ${st && st.recent && st.recent.length ? `<h2>Settlements on file (${int(st.count)}: ${Object.entries(st.byResult || {}).map(([k, v]) => `${int(v)} ${esc(k)}`).join(', ')})</h2>
    <div class="card" style="overflow-x:auto"><p class="small" style="margin-top:0">Official exchange results re-read from <span class="mono">GET /markets?tickers=…</span> (<span class="mono">data/kalshi/tracker/settlements.json</span>). Most recent ${st.recent.length} shown; results are recorded as returned, never inferred from prices.</p>
      <table><thead><tr><th>Settled</th><th>Market</th><th>Result</th><th class="num">Volume</th></tr></thead><tbody>${st.recent.map((m) => `<tr><td class="small">${esc(m.settlementDay)}</td><td><span class="mono small">${esc(m.ticker)}</span><br>${esc(m.title)}</td><td><span class="chip ${m.result === 'yes' ? 'good' : m.result === 'no' ? 'bad' : ''}">${esc(m.result)}</span></td><td class="num">${int(m.volume)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <h2>Run log — one row per collection day</h2>
    <div class="card" style="overflow-x:auto">
      <p class="small" style="margin-top:0">Counts only (<span class="mono">data/kalshi/tracker/history.json</span>). A same-day re-run replaces the row. Consistency = mutually-exclusive ladders whose YES mids sum to more than 1.06 (fully two-sided) / less than 0.94 (≥3 markets), and last trades more than 10¢ outside the quoted book; cross-check = Node vs Python last price within 2¢.</p>
      <table><thead><tr><th>Date (UTC)</th><th class="num">Series</th><th class="num">Open events</th><th class="num">U.S. election</th><th class="num">Traded markets</th><th class="num">Settlements known</th><th class="num">Scored · Brier T-1</th><th class="num">Consistency over / under / stale</th><th class="num">Cross-check</th><th class="num">API req · MB</th></tr></thead>
      <tbody>${runs}</tbody></table>
    </div>
    <h2>Earliest-closing U.S. election events in the watchlist</h2>
    <div class="card" style="overflow-x:auto"><table><thead><tr><th>Event</th><th>Closes</th><th class="num">Volume</th></tr></thead><tbody>${soon}</tbody></table></div>
    <h2>Price history (top U.S. election markets)</h2>
    <div class="grid cols2">${hist}</div>
    <h2>Two independent collectors, one truth</h2>
    <div class="card" style="overflow-x:auto">
      <p class="small" style="margin-top:0">${cc ? esc(cc.method) : 'Cross-check not yet run.'}</p>
      ${cc ? `<p style="font-size:14.5px">Node events feed (${esc(day(cc.date))}) vs Python markets feed (${esc(cc.pythonCapturedAt)}): overlap ${int(cc.overlap)} of ${int(cc.pythonMarkets)} sampled markets ·
      last price within 2¢: <strong>${int(cc.lastPrice.withinTolerance)}/${int(cc.lastPrice.compared)}</strong> · bid &amp; ask within 2¢: <strong>${int(cc.book.withinTolerance)}/${int(cc.book.compared)}</strong> ·
      lifetime volume decreased between captures: <strong>${cc.volumeDecreased}</strong> (must be 0).</p>
      <table><thead><tr><th>Ticker</th><th class="num">Node last (bid–ask)</th><th class="num">Python last (bid–ask)</th><th class="num">|Δ last|</th></tr></thead><tbody>${ccRows}</tbody></table>` : ''}
    </div>`;
  }
  function drawTrackerCharts() {
    if (!U || !D.tracker || D.tracker.days.length < 2) return;
    U.topMarkets.filter((m) => m.us_election).slice(0, 6).forEach((m, i) => {
      const cv = document.getElementById('tr-' + i);
      const h = D.tracker.history[m.ticker];
      if (!cv || !h) return;
      C.lines(cv, [{ label: m.ticker, color: '#1f5fbf', points: h.map((p) => ({ x: p.date, y: p.bid != null && p.ask != null ? (p.bid + p.ask) / 2 : p.last })) }], { yMin: 0, yMax: 1, yFmt: (v) => Math.round(v * 100) + '¢' });
    });
  }

  // ---------- BACKTESTS ----------
  function backtests() {
    const bt = BT;
    const pb = D.backtests.pollBacktest;
    const aggRows = (agg) => agg.map((a) => `<tr>
      <td class="num">T-${a.nDays}</td><td class="num">${a.nMarkets}</td><td class="num">${pct(a.meanProbYes)}</td>
      <td class="num">${a.meanBrier == null ? '—' : a.meanBrier.toFixed(3)}</td><td class="num">${a.meanLogloss == null ? '—' : a.meanLogloss.toFixed(3)}</td>
      <td class="num ${cls(a.meanHoldPnlPerContract)}">${a.meanHoldPnlPerContract == null ? '—' : (a.meanHoldPnlPerContract > 0 ? '+' : '') + a.meanHoldPnlPerContract.toFixed(3)}</td></tr>`).join('');
    const fav = (bt.favoriteAccuracy || []).map((a) => `<tr><td class="num">T-${a.nDays}</td><td class="num">${a.n}</td><td class="num">${a.hits}</td><td class="num">${pct(a.rate, 1)}</td></tr>`).join('');
    const core = bt.markets.filter((m) => m.group === 'core-2024');
    const senate = bt.markets.filter((m) => m.group === 'senate-2024');
    const mkCharts = core.map((m, i) => `
      <div class="card"><h3 style="margin-top:0">${esc(m.ticker)} — ${esc(m.title)}</h3>
        <canvas id="mk-${i}" class="chart"></canvas>
        <p class="small">Outcome: <span class="chip ${m.outcomeIsYes ? 'good' : 'bad'}">${m.outcomeIsYes ? 'YES' : 'NO'}</span> (official settlement). ${m.electionDayBarCaptured ? 'Election-day bar captured.' : 'Last captured bar 2024-11-04 (election-day bar not captured — irregularity #11).'}</p></div>`).join('');
    const senRows = senate.map((m) => {
      const l7 = m.leadTimes.find((x) => x.nDays === 7); const l1 = m.leadTimes.find((x) => x.nDays === 1);
      return `<tr><td><span class="mono small">${esc(m.ticker)}</span><br>${esc(m.yesSubTitle || m.title)}</td><td>${esc(m.state || '')}</td>
      <td class="num">${l7 && l7.p != null ? cents(l7.p) : '—'}</td><td class="num">${l1 && l1.p != null ? cents(l1.p) : '—'}</td>
      <td><span class="chip ${m.outcomeIsYes ? 'good' : 'bad'}">${m.outcomeIsYes ? 'YES' : 'NO'}</span></td>
      <td class="num">${l1 && l1.brier != null ? l1.brier.toFixed(3) : '—'}</td><td class="num">${int(m.volume)}</td><td class="num">${m.barsPreElection}</td></tr>`;
    }).join('');
    const pooled = bt.pooledCalibrationDeduped;
    const pooledRows = pooled.buckets.map((b) => `<tr><td>${(b.lo * 100).toFixed(0)}–${(b.hi * 100).toFixed(0)}¢</td><td class="num">${b.n}</td><td class="num">${b.markets}</td><td class="num">${pct(b.meanP, 1)}</td><td class="num">${pct(b.observedYesRate, 1)}</td></tr>`).join('');
    const outcomes = D.outcomes.outcomes.map((o) => `
      <tr><td>${o.cycle} ${esc(o.office)}</td><td>${esc(o.winner)}</td>
      <td class="small">${esc((o.detail && (o.detail.senateComposition || o.detail.houseComposition)) ? '' : (o.detail.electoralVotes ? `EV ${o.detail.electoralVotes[Object.keys(o.detail.electoralVotes)[0]]}–${o.detail.electoralVotes[Object.keys(o.detail.electoralVotes)[1]]}` : ''))}</td>
      <td><span class="chip good">${esc(o.crossCheck.split(' —')[0])}</span></td></tr>`).join('');
    const checkpoints = pb.checkpoints.map((c) => `<tr>
      <td>${c.date}</td><td class="num">${pp(c.poll2PartyMargin)}</td>
      <td class="num">${pct(c.pollImpliedTrumpProb, 0)}</td>
      <td class="num">${c.kalshiDjtClose == null ? 'market not open' : (c.kalshiDjtClose * 100).toFixed(0) + '¢'}</td></tr>`).join('');
    const late = pb.lateWindow.map((c) => `<tr>
      <td>${c.date} <span class="small">(poll age ${c.pollAnchorAgeDays}d)</span></td>
      <td class="num">${pp(c.poll2PartyMargin)}</td>
      <td class="num">${pct(c.pollImpliedTrumpProb, 0)}</td>
      <td class="num">${c.kalshiDjtClose == null ? '—' : (c.kalshiDjtClose * 100).toFixed(0) + '¢'}</td>
      <td class="num ${cls(-c.gapPollVsMarket)}">${pp(c.gapPollVsMarket * 100, 1)}</td></tr>`).join('');
    const s24 = D.senate2024;
    return `
    <h1>Backtests — polls &amp; markets vs verified outcomes</h1>
    <p class="lead">Inputs: ${bt.universe.total} settled 2024 Kalshi markets (official API history: ${bt.universe.core2024} hand-verified core markets + ${bt.universe.senate2024} per-state Senate markets captured ${esc(day(bt.universe.senate2024CapturedAt))}), the archived 538 national poll averages, and official results (FEC-cited).
    Deterministic — re-run with <span class="mono">npm run backtest</span>.</p>

    <h2>1 · Official outcomes (cross-check targets)</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>Race</th><th>Official result</th><th>Detail</th><th>Kalshi vs official</th></tr></thead>
      <tbody>${outcomes}</tbody></table>
    <p class="small">Sources per outcome: <a href="data/outcomes/verified-outcomes.json" target="_blank" rel="noopener">data/outcomes/verified-outcomes.json</a>. The ${bt.universe.senate2024} Senate markets use Kalshi's official settlement (result field) — every state has exactly one YES (test-enforced); Texas cross-checked against the Texas SoS results portal (Cruz 5,990,741 – Allred 5,031,249).</p></div>

    <h2>2 · Kalshi market calibration (2024, ${bt.universe.total} markets)</h2>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">All markets — mean by lead time</h3>
        <table><thead><tr><th class="num">Lead</th><th class="num">Markets</th><th class="num">Mean P(YES)</th><th class="num">Brier</th><th class="num">Log-loss</th><th class="num">Hold PnL $/contract</th></tr></thead>
        <tbody>${aggRows(bt.aggregate)}</tbody></table>
        <p class="small">Markets enter a lead time only if they had a trade on or before it; most per-state Senate markets opened in October 2024, hence fewer markets at T-30/T-60 — reported, not imputed.</p></div>
      <div class="card"><h3 style="margin-top:0">Did the favourite win?</h3>
        <table><thead><tr><th class="num">Lead</th><th class="num">Markets priced</th><th class="num">Favourite won</th><th class="num">Rate</th></tr></thead><tbody>${fav}</tbody></table>
        <p class="small">"Favourite" = the side above 50¢ at that lead; markets exactly at 50¢ are excluded.</p></div>
    </div>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Core 3 (presidency + chamber controls)</h3>
        <table><thead><tr><th class="num">Lead</th><th class="num">Markets</th><th class="num">Mean P(YES)</th><th class="num">Brier</th><th class="num">Log-loss</th><th class="num">Hold PnL</th></tr></thead><tbody>${aggRows(bt.groups['core-2024'].aggregate)}</tbody></table></div>
      <div class="card"><h3 style="margin-top:0">Per-state Senate (${bt.groups['senate-2024'].nMarkets})</h3>
        <table><thead><tr><th class="num">Lead</th><th class="num">Markets</th><th class="num">Mean P(YES)</th><th class="num">Brier</th><th class="num">Log-loss</th><th class="num">Hold PnL</th></tr></thead><tbody>${aggRows(bt.groups['senate-2024'].aggregate)}</tbody></table></div>
    </div>
    <div class="card"><h3 style="margin-top:0">Pooled calibration curve (one YES market per event, every pre-election daily close)</h3>
      <canvas id="cal-chart" class="chart"></canvas>
      <table><thead><tr><th>Price bucket</th><th class="num">Observations</th><th class="num">Markets</th><th class="num">Mean price</th><th class="num">Observed YES rate</th></tr></thead><tbody>${pooledRows}</tbody></table>
      <p class="small">${pooled.marketsUsed} markets used (complementary D/R legs de-duplicated so each race counts once). A perfectly calibrated market would sit on the diagonal; with one cycle the curve is indicative, not conclusive.</p></div>
    ${mkCharts}

    <h2>3 · Per-state Senate 2024 markets (${senate.length})</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>Market</th><th>State</th><th class="num">T-7</th><th class="num">T-1</th><th>Result</th><th class="num">Brier T-1</th><th class="num">Volume</th><th class="num">Bars</th></tr></thead>
      <tbody>${senRows}</tbody></table>
      <p class="small">Capture: <span class="mono">${esc(s24 ? s24.capturedFrom : '')}</span> at ${esc(day(s24 && s24.capturedAt))}; ${s24 ? s24.summary.markets : '—'} markets over ${s24 ? s24.summary.statesWith2024Markets : '—'} states (all 50 SENATE{ST} series were queried; ${s24 ? 50 - s24.summary.statesWith2024Markets : '—'} had no 2024 market). Nebraska's third candidate market, where present, is scored as a YES market of its own.</p></div>

    ${D.senate2024Races ? (() => {
      const s = D.senate2024Races;
      const cc = s.settlementCrossCheck;
      const senAgg = s.aggregate.map((a) => `<tr>
        <td class="num">T-${a.nDays}</td><td class="num">${a.nMarkets}</td>
        <td class="num">${pct(a.meanProbYes)}</td>
        <td class="num">${a.meanBrier == null ? '—' : a.meanBrier.toFixed(3)}</td>
        <td class="num">${a.meanLogloss == null ? '—' : a.meanLogloss.toFixed(3)}</td>
        <td class="num ${cls(a.meanHoldPnlPerContract)}">${a.meanHoldPnlPerContract == null ? '—' : (a.meanHoldPnlPerContract > 0 ? '+' : '') + a.meanHoldPnlPerContract.toFixed(3) + ' $/contract'}</td>
      </tr>`).join('');
      const bands = s.aggregateByBandT7.map((b) => `<tr><td>${esc(b.band)}</td><td class="num">${b.nMarkets}</td>
        <td class="num">${b.meanP7 == null ? '—' : (b.meanP7 * 100).toFixed(1) + '¢'}</td>
        <td class="num">${b.meanBrierT7 == null ? '—' : b.meanBrierT7.toFixed(3)}</td>
        <td class="num">${b.nMarkets ? Math.round((b.winnersAtT7 / b.nMarkets) * 100) : '—'}%</td></tr>`).join('');
      const hold = s.holdOfficialWinners.filter((h) => h.nRaces).map((h) => `<tr><td class="num">T-${h.nDays}</td><td class="num">${h.nRaces}</td>
        <td class="num">${(h.meanPrice * 100).toFixed(1)}¢</td>
        <td class="num ${cls(h.meanHoldPnlPerContract)}">${(h.meanHoldPnlPerContract > 0 ? '+' : '') + h.meanHoldPnlPerContract.toFixed(3)} $/contract</td></tr>`).join('');
      const rows = s.markets.slice().sort((a, b) => a.state.localeCompare(b.state) || a.ticker.localeCompare(b.ticker)).map((m) => {
        const l7 = m.leadTimes.find((x) => x.nDays === 7);
        return `<tr><td class="mono small">${esc(m.ticker)}</td><td>${esc(m.state)}</td><td class="small">${esc(m.side || '')}</td>
          <td class="num">${l7 && l7.p != null ? (l7.p * 100).toFixed(0) + '¢' : '—'}</td>
          <td class="num">${l7 && l7.brier != null ? l7.brier.toFixed(3) : '—'}</td>
          <td><span class="chip ${m.result === 'yes' ? 'good' : ''}">${esc(String(m.result || '').toUpperCase())}</span></td>
          <td class="small">${esc(m.officialWinner || '')} (${esc(m.officialWinnerParty || '?')})</td>
          <td><span class="chip ${m.crossCheck === 'PASS' ? 'good' : m.crossCheck === 'FAIL' ? 'bad' : 'warn'}">${esc(m.crossCheck)}</span></td></tr>`;
      }).join('');
      const featured = ['SENATEMI-24-D', 'SENATEPA-24-R', 'SENATEOH-24-R', 'SENATEMT-24-R', 'SENATENV-24-D', 'SENATEWI-24-D', 'SENATEAZ-24-D', 'SENATENE-24-I'];
      const charts = s.markets.map((m, i) => ({ m, i })).filter(({ m }) => featured.includes(m.ticker)).map(({ m, i }) => `
        <div class="card"><h3 style="margin-top:0">${esc(m.ticker)} — ${esc(m.state)} · ${esc(m.side || '')}</h3>
          <canvas id="sen-mk-${i}" class="chart"></canvas>
          <p class="small">Settled <span class="chip ${m.result === 'yes' ? 'good' : ''}">${esc(String(m.result || '').toUpperCase())}</span> ·
          official winner ${esc(m.officialWinner || '—')} · cross-check <span class="chip ${m.crossCheck === 'PASS' ? 'good' : 'bad'}">${esc(m.crossCheck)}</span> ·
          volume ${m.volume == null ? '—' : Number(m.volume).toLocaleString('en-US', { maximumFractionDigits: 0 })} contracts.</p>
        </div>`).join('');
      return `
    <h2>2b · Per-state Senate races 2024 — the R2 expansion (${s.nMarkets} markets)</h2>
    <p class="lead">Captured live from the official historical API (exhaustive SENATE{ST} enumeration over all 50 states, 2024-cycle window
    close ∈ [2024-11-01, 2025-02-01)) and cross-checked market-by-market against the official winners (Wikipedia race-summary table fetched
    2026-09-19 via the MediaWiki API; per-state pages cite certified results). Election-day bar INCLUDED here (candles captured through 2024-12-01 —
    the irregularity #11 gap does not apply to this capture). Settlement cross-checks:
    <strong>${cc.pass} PASS / ${cc.fail} FAIL${cc.noOfficialRow ? ' / ' + cc.noOfficialRow + ' no-official-row' : ''}</strong>.</p>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Aggregate across all ${s.nMarkets} Senate markets</h3>
        <table><thead><tr><th class="num">Lead</th><th class="num">Markets</th><th class="num">Mean P(YES)</th><th class="num">Brier</th><th class="num">Log-loss</th><th class="num">Hold PnL (all YES sides)</th></tr></thead>
        <tbody>${senAgg}</tbody></table>
        <p class="small">Combined with the 3 chamber/presidential markets above, the 2024 market backtest now spans ${3 + s.nMarkets} markets.</p></div>
      <div class="card"><h3 style="margin-top:0">Hold the official winner (per race, winning side only)</h3>
        <table><thead><tr><th class="num">Lead</th><th class="num">Races</th><th class="num">Mean price</th><th class="num">Hold PnL</th></tr></thead>
        <tbody>${hold}</tbody></table>
        <h4 style="margin:10px 0 4px">By T-7 confidence band</h4>
        <table><thead><tr><th>Band</th><th class="num">Markets</th><th class="num">Mean P(YES) @T-7</th><th class="num">Brier @T-7</th><th class="num">Favorite won</th></tr></thead>
        <tbody>${bands}</tbody></table></div>
    </div>
    ${charts}
    <div class="card"><h3 style="margin-top:0">All ${s.nMarkets} markets @ T-7 vs official outcomes</h3>
      <div style="overflow-x:auto"><table><thead><tr><th>Market</th><th>State</th><th>Side</th><th class="num">P(YES) @T-7</th><th class="num">Brier @T-7</th><th>Settled</th><th>Official winner</th><th>Cross-check</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="small">Universe coverage: Kalshi ran per-state markets in ${s.universeCoverage.statesWith2024Markets.length} of the 35 contests —
      ${esc(s.universeCoverage.note || '')}</p>
      ${srcs([s.inputs && s.inputs[0] && s.inputs[0].source, s.inputs && s.inputs[1] && s.inputs[1].source])}</div>
    <div class="callout good"><strong>R2 result.</strong> The 2024 market backtest grew from 3 to ${3 + s.nMarkets} markets.
    ${cc.fail === 0 ? `Every Kalshi settlement matched the official winner (${cc.pass}/${cc.n} PASS).` : `${cc.fail} settlement mismatches are published above — flagged, not normalized.`}
    Aggregate Brier at T-7 across the Senate markets: ${(() => { const a = s.aggregate.find((x) => x.nDays === 7); return a && a.meanBrier != null ? a.meanBrier.toFixed(3) : '—'; })()} (chance baseline 0.25).</div>`;
    })() : `
    <h2>2b · Per-state Senate races 2024 (R2 expansion)</h2>
    <div class="card"><p style="font-size:14.5px">The capture script (<span class="mono">scripts/collect-senate-2024-races.mjs</span>) enumerates all 50
    <span class="mono">SENATE{ST}</span> series on the official historical tier and captures every 2024-cycle market with daily candles
    (through 2024-12-01 — election day included). It runs on the networked daily-collection runner; this block fills in when the capture
    (<span class="mono">data/kalshi/historical-2024/senate-races.json</span>) lands. Cross-check targets are already verified:
    official winners for the 18 raced states in <span class="mono">data/outcomes/senate-2024-official.json</span>.</p></div>`}

    <h2>4 · Polls vs market vs outcome (2024 presidential)</h2>
    <div class="card"><canvas id="poll-chart" class="chart"></canvas>
      <div class="legend"><span><i style="background:#1f5fbf"></i>538 national 2-party margin (pp, archived series ends 2024-09-12)</span></div>
      <p class="small">Annotations: 2024-07-21 Biden withdrawal · 2024-08-05 Harris nomination. Final archived value Harris +2.82 vs official outcome Trump +1.45 (FEC).</p></div>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Checkpoints (poll archive)</h3>
        <table><thead><tr><th>Date</th><th class="num">Poll margin</th><th class="num">Poll⇒P(Trump)<sup>a</sup></th><th class="num">Kalshi DJT</th></tr></thead><tbody>${checkpoints}</tbody></table></div>
      <div class="card"><h3 style="margin-top:0">Late window (anchor reused, age disclosed)</h3>
        <table><thead><tr><th>Date</th><th class="num">Poll margin</th><th class="num">Poll⇒P(Trump)<sup>a</sup></th><th class="num">Kalshi DJT</th><th class="num">Poll − market</th></tr></thead><tbody>${late}</tbody></table>
        <p class="small"><sup>a</sup> logistic mapping k=4.5 — <em>modeled assumption, labeled</em> (irregularity #12). The 538 archive ends 2024-09-12, so late dates reuse the anchor with age in days.</p></div>
    </div>
    <div class="callout"><strong>Finding.</strong> The final poll average was off by <strong>${Math.abs(pb.pollAnchorAbsErrorPp).toFixed(1)}pp in the wrong direction</strong>;
    the market's T-7 price (58¢ Trump) implied a 16pp margin — still wrong in magnitude, but the market never crossed 50¢ the wrong way after October,
    while the poll average said the opposite.</div>`;
  }

  function drawBacktestCharts() {
    BT.markets.filter((m) => m.group === 'core-2024').forEach((m, i) => {
      const cv = document.getElementById('mk-' + i);
      if (!cv) return;
      C.lines(cv, [{ label: m.ticker, color: '#1f5fbf', points: m.series.map((p) => ({ x: p.date, y: p.p })) }], { yMin: 0, yMax: 1, yFmt: (v) => Math.round(v * 100) + '¢', hLines: [{ y: 0.5, label: '50¢' }] });
    });
    const cal = document.getElementById('cal-chart');
    if (cal) {
      const b = BT.pooledCalibrationDeduped.buckets.filter((x) => x.n > 0);
      C.lines(cal, [
        { label: 'observed', color: '#1f5fbf', points: b.map((x) => ({ x: ((x.lo + x.hi) / 2 * 100).toFixed(0) + '¢', y: x.observedYesRate })) },
        { label: 'perfect', color: '#9aa7b5', points: b.map((x) => ({ x: ((x.lo + x.hi) / 2 * 100).toFixed(0) + '¢', y: x.meanP })) },
      ], { yMin: 0, yMax: 1, yFmt: (v) => Math.round(v * 100) + '%' });
    }
    const pv = document.getElementById('poll-chart');
    if (pv) {
      C.lines(pv, [{ label: '538 margin', color: '#1f5fbf', points: D.pollSeries2024.map((p) => ({ x: p.date, y: p.margin })) }], { yFmt: (v) => (v > 0 ? '+' : '') + v.toFixed(1), hLines: [{ y: 0, label: 'tie', color: '#9aa7b5' }] });
    }
    // Senate-2024 featured races (ROADMAP R2 forward-loop capture), if present.
    if (D.senate2024Races) {
      D.senate2024Races.markets.forEach((m, i) => {
        const cv = document.getElementById('sen-mk-' + i);
        if (!cv || !m.series || !m.series.length) return;
        C.lines(cv, [{
          label: m.ticker, color: m.crossCheck === 'PASS' ? '#1f5fbf' : '#b3261e',
          points: m.series.map((p) => ({ x: p.date, y: p.p })),
        }], { yMin: 0, yMax: 1, yFmt: (v) => Math.round(v * 100) + '¢', hLines: [{ y: 0.5, label: '50¢' }] });
      });
    }
  }

  // ---------- CONTEST ----------
  function contest() {
    const c = CT;
    const lbRows = (lb) => lb.map((r, i) => `
      <tr ${i === 0 ? 'style="background:var(--accent-soft)"' : ''}>
        <td class="num"><strong>#${r.rank}</strong></td><td><span class="mono">@${esc(r.username)}</span></td>
        <td class="num">${usd(r.finalEquity)}</td>
        <td class="num ${cls(r.realizedPnl)}">${r.realizedPnl > 0 ? '+' : ''}${usd(r.realizedPnl)} (${r.realizedPnlPct > 0 ? '+' : ''}${r.realizedPnlPct.toFixed(2)}%)</td>
        <td class="num">${usd(r.feesPaid)}</td><td class="num">${r.trades}</td><td class="num">${r.tradingDays}</td><td class="num">${r.marketsTraded}</td></tr>`).join('');
    const all = c.universes && c.universes['all-2024'];
    const coreU = c.universes && c.universes['core-2024'];
    const results = all ? all.results : c.results;
    const unranked = results.filter((r) => !r.ranked).map((r) => `<li><span class="mono">@${esc(r.username)}</span> — ${esc(r.unrankedReason)}${r.trades ? ` (would have been ${r.realizedPnlPct > 0 ? '+' : ''}${r.realizedPnlPct.toFixed(2)}%)` : ''}</li>`).join('');
    const cards = results.filter((r) => r.ranked).map((r, i) => {
      const fills = (r.fillSample || []).filter((f) => f.date !== 'settlement').slice(0, 8).map((f) => `<div class="small mono">${f.date} ${f.ticker} ${f.action} ${f.side} ×${f.shares} @ ${f.price} (fee ${usd(f.fee)})</div>`).join('');
      return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px">
          <strong class="mono">@${esc(r.username)}</strong>
          <span class="chip ${r.realizedPnl >= 0 ? 'good' : 'bad'}">${r.realizedPnl > 0 ? '+' : ''}${r.realizedPnlPct.toFixed(2)}% · ${usd(r.finalEquity)}</span></div>
        <p class="small" style="margin:8px 0">${esc(r.thesis)}</p>
        <canvas id="eq-${i}" class="chart" style="height:170px"></canvas>
        <p class="small">${r.trades} fills over ${r.tradingDays} trading days in ${r.marketsTraded} markets · fees ${usd(r.feesPaid)} · skips ${r.skips}</p>
        ${fills ? `<details><summary>Fill sample</summary><div class="body">${fills}</div></details>` : ''}
      </div>`;
    }).join('');
    return `
    <h1>Contest — paper-trading forecasting entrants</h1>
    <p class="lead">A reverse-engineering of TradingView's <a href="https://www.tradingview.com/the-leap/crypto-series-may-2026/" target="_blank" rel="noopener">The Leap</a> contest, adapted to Kalshi election markets:
    $100,000 paper bankroll per entrant, ranked by <strong>realized P&amp;L at settlement</strong>, open positions force-closed at the official settlement value,
    Kalshi's official quadratic taker fees, honest fill rules (no fills on no-trade days; fills capped at 10% of the day's volume; NO-side prices labeled as derived reciprocals),
    and The Leap's eligibility rule: <strong>at least ${c.model.minTradingDaysToRank} active trading days</strong> to be ranked.</p>
    <div class="callout"><strong>Universes.</strong> <em>all-2024</em>: ${all ? all.universeSize : c.results[0].markets.length} settled 2024 markets (core 3 + per-state Senate). <em>core-2024</em>: the original three (kept so the first pilot stays reproducible).
    ${esc(c.model.note || '')}</div>

    <h2>Leaderboard — all-2024 (${all ? all.universeSize : '—'} markets)</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th class="num">Rank</th><th>Entrant</th><th class="num">Final equity</th><th class="num">Realized P&amp;L</th><th class="num">Fees</th><th class="num">Fills</th><th class="num">Days</th><th class="num">Markets</th></tr></thead>
      <tbody>${lbRows(allLb)}</tbody></table>
      <p class="small"><strong>Unranked</strong> (the rules, not the engine, suppressed them):</p><ul class="small" style="margin:4px 0; padding-left:20px">${unranked}</ul></div>

    <h2>Leaderboard — core-2024 (${coreU ? coreU.universeSize : 3} markets)</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th class="num">Rank</th><th>Entrant</th><th class="num">Final equity</th><th class="num">Realized P&amp;L</th><th class="num">Fees</th><th class="num">Fills</th><th class="num">Days</th><th class="num">Markets</th></tr></thead>
      <tbody>${lbRows(coreLb)}</tbody></table></div>

    <h2>Ranked entrants &amp; theses (all-2024)</h2>
    <div class="grid cols2">${cards}</div>
    <div class="callout warn"><strong>Read-out.</strong> One cycle, ${all ? all.universeSize : '—'} markets, most of which opened only in October 2024: results are evidence about the theses, not proof.
    The poll-anchor thesis lost on 2024 because the verified poll anchor was wrong and the market was right (see Backtests §4); late-consensus and fade theses paid.
    The 2026 tracker will supply the out-of-sample test when markets settle.</div>
    <p class="small">Determinism + attribution identity (finalEquity = capital + fee-aware realized P&amp;L) are enforced by the test suite (<span class="mono">npm test</span>, ${D.meta.tests} tests).</p>`;
  }

  function drawContestCharts() {
    const all = CT.universes && CT.universes['all-2024'];
    (all ? all.results : CT.results).filter((r) => r.ranked).forEach((r, i) => {
      const cv = document.getElementById('eq-' + i);
      if (!cv) return;
      C.lines(cv, [{ label: r.username, color: r.realizedPnl >= 0 ? '#177245' : '#b3261e', points: r.equityCurve.map((p) => ({ x: p.date, y: p.equity })) }], { yFmt: (v) => '$' + Math.round(v / 1000) + 'k', hLines: [{ y: 100000, label: 'start $100k', color: '#9aa7b5' }] });
    });
  }

  // ---------- SOURCES ----------
  // Grouped by the `category` label carried on every master-list entry, with a live filter so a
  // 100+ entry registry stays readable. Every figure here is read from the bundle (D.sources).
  function sources() {
    const all = D.sources.sources;
    const catOf = (s) => s.category || 'Uncategorised';
    const cats = (D.sources.categories && D.sources.categories.length
      ? D.sources.categories.map((c) => c.name)
      : [...new Set(all.map(catOf))]).filter((c) => all.some((s) => catOf(s) === c));
    const counts = {};
    all.forEach((s) => { counts[s.verifiedOn] = (counts[s.verifiedOn] || 0) + 1; });
    const byDate = Object.keys(counts).sort();
    const perSession = byDate.map((d) => `${d}: ${counts[d]}`).join(' · ');
    const searchBlob = (s) => [s.id, s.name, s.type, catOf(s), s.verified, s.notes || '', s.url,
      s.api || '', s.docs || '', s.marketsUrl || ''].join(' ').toLowerCase();
    const row = (s) => `
      <tr data-cat="${esc(catOf(s))}" data-date="${esc(s.verifiedOn)}" data-text="${esc(searchBlob(s))}">
        <td><a href="${esc(s.url)}" target="_blank" rel="noopener"><strong>${esc(s.name)}</strong></a>
          <div class="small mono" style="margin-top:2px">${esc(String(s.url).replace(/^https?:\/\//, '').replace(/\/$/, ''))}</div>
          <div class="small" style="margin-top:3px">${esc(s.type)}</div></td>
        <td><details class="src-more"><summary>What was verified</summary><div class="body">${esc(s.verified)}</div></details>
          ${s.notes ? `<div class="small" style="margin-top:8px"><strong>How this project uses it:</strong> ${esc(s.notes)}</div>` : ''}</td>
        <td class="small" style="white-space:nowrap">${esc(s.verifiedOn)}<br><span class="chip ${s.status === 'verified' ? 'good' : 'warn'}">${esc(s.status)}</span></td>
      </tr>`;
    const blocks = cats.map((c) => {
      const members = all.filter((s) => catOf(s) === c);
      return `
      <section class="src-cat" data-cat="${esc(c)}">
        <h2 style="margin-top:26px">${esc(c)} <span class="chip" data-count>${members.length}</span></h2>
        <div class="card" style="overflow-x:auto"><table>
          <thead><tr><th style="min-width:230px">Source — link for manual review</th>
            <th>What was verified (observed text) · how this project uses it</th>
            <th style="min-width:96px">When / status</th></tr></thead>
          <tbody>${members.map(row).join('')}</tbody></table></div>
      </section>`;
    }).join('');
    return `
    <h1>Master source list</h1>
    <p class="lead">${all.length} entries — verified on ${perSession} — each verified line-by-line in its session: the URL was fetched
    (or, where a direct fetch failed, located via live search — noted in the entry), and the expandable
    <em>What was verified</em> panel records <strong>exactly what was observed</strong>. Nothing is listed on assumption; every row
    carries a link for manual review. Machine-checked by <span class="mono">scripts/lint-verified.mjs</span>; full audit trail in
    <a href="VERIFICATION.md">VERIFICATION.md</a>. <a href="data/sources/master.json">Download source registry (JSON)</a>.</p>
    <div class="toolbar">
      <input type="search" id="src-q" placeholder="Filter ${all.length} sources — name, domain, keyword, method…" aria-label="Filter sources by text">
      <select id="src-cat" aria-label="Filter by category">
        <option value="">All ${cats.length} categories</option>
        ${cats.map((c) => `<option value="${esc(c)}">${esc(c)} (${all.filter((s) => catOf(s) === c).length})</option>`).join('')}
      </select>
      <select id="src-date" aria-label="Filter by verification date">
        <option value="">Any verification date</option>
        ${byDate.map((d) => `<option value="${esc(d)}">Verified ${esc(d)} (${counts[d]})</option>`).join('')}
      </select>
      <button type="button" id="src-reset" class="btn">Reset</button>
    </div>
    <p class="small" id="src-count" aria-live="polite" style="margin:2px 0 0"></p>
    ${blocks}
    ${D.sessionReview ? `<h2>Latest session re-tests · ${esc(D.sessionReview.verifiedOn)}</h2><p class="small">Direct page-fetch observations, separate from the automated runner below. Reachability is not admission or certification.</p><div class="card"><table><thead><tr><th>Source</th><th>Status</th><th>Observed / limitation</th></tr></thead><tbody>${D.sessionReview.rows.map((r) => `<tr><td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.id)}</a></td><td><span class="chip ${r.status === 'readable' ? 'good' : 'warn'}">${esc(r.status)}</span></td><td>${esc(r.observation)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${probeCard()}`;
  }

  // Host re-test monitor (R15): the standing job that re-tests every URL this project could not read. A 'reachable'
  // verdict is a cue to read the page in a session — it never admits a source by itself.
  function probeCard() {
    const P = D.probes;
    if (!P) return '';
    const byId = P.latest ? Object.fromEntries(P.latest.rows.map((r) => [r.id, r])) : {};
    const chip = (v) => !v ? '<span class="chip">no run yet</span>' : v.startsWith('reachable') ? `<span class="chip good">${esc(v)}</span>` : `<span class="chip warn">${esc(v)}</span>`;
    const rows = P.targets.map((t) => { const r = byId[t.id]; return `<tr><td><a href="${esc(t.url)}" target="_blank" rel="noopener"><strong>${esc(t.name)}</strong></a><div class="small mono">${esc(t.url.replace(/^https?:\/\//, ''))}</div></td><td class="small">${esc(t.why)}${t.irregularity ? ` <span class="mono">#${t.irregularity}</span>` : ''}</td><td>${chip(r && r.verdict)}${r ? `<div class="small">HTTP ${esc(r.status)}${r.challenge ? ' · ' + esc(r.challenge) : ''}${r.render ? ' · render ' + (r.render.ok ? (r.render.challenge ? 'still ' + esc(r.render.challenge) : 'ok') : esc(r.render.reason || 'failed')) : ''}${r.title ? '<br>' + esc(String(r.title).slice(0, 80)) : ''}</div>` : ''}</td></tr>`; }).join('');
    const stamp = P.latest ? `Last run ${esc(P.latest.capturedAt)}${P.latest.runner && P.latest.runner.github ? ` on GitHub Actions (run ${esc(P.latest.runner.github.runId)})` : ' (local)'} · ${P.runs} run(s) on file.` : 'No committed run yet: the first live run on 2026-09-20 crashed before writing its file (irregularity #61, fixed); verdicts appear after the next workflow run.';
    return `
    <h2 style="margin-top:30px">Host re-test monitor (R15) <span class="chip">${P.targets.length} targets</span></h2>
    <div class="card" style="overflow-x:auto"><p class="small">${esc(P.method)}</p><p class="small">${stamp}</p>
      <table><thead><tr><th style="min-width:220px">URL under test</th><th>Why it is watched</th><th style="min-width:160px">Latest verdict</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // Live filter for the Sources section (runs after render, like the chart hooks). Guarded so the
  // headless render check — whose DOM stub has no querySelectorAll results — passes unchanged.
  function wireSources() {
    const main = document.getElementById('main');
    if (!main || !main.querySelectorAll) return;
    const rows = main.querySelectorAll('tr[data-cat]');
    if (!rows || !rows.length) return;
    const blocks = main.querySelectorAll('section.src-cat');
    const q = document.getElementById('src-q');
    const cat = document.getElementById('src-cat');
    const date = document.getElementById('src-date');
    const reset = document.getElementById('src-reset');
    const count = document.getElementById('src-count');
    const apply = () => {
      const term = ((q && q.value) || '').trim().toLowerCase();
      const c = (cat && cat.value) || '';
      const d = (date && date.value) || '';
      let shown = 0;
      rows.forEach((tr) => {
        const ok = (!c || tr.dataset.cat === c) && (!d || tr.dataset.date === d)
          && (!term || String(tr.dataset.text || '').indexOf(term) !== -1);
        tr.style.display = ok ? '' : 'none';
        if (ok) shown += 1;
      });
      blocks.forEach((b) => {
        let vis = 0;
        b.querySelectorAll('tr[data-cat]').forEach((tr) => { if (tr.style.display !== 'none') vis += 1; });
        b.style.display = vis ? '' : 'none';
        const chip = b.querySelector('[data-count]');
        if (chip) chip.textContent = String(vis);
      });
      if (count) {
        count.textContent = `Showing ${shown} of ${rows.length} entries`
          + (c ? ` in “${c}”` : '') + (d ? ` verified ${d}` : '') + (term ? ` matching “${term}”` : '') + '.';
      }
    };
    if (q && q.addEventListener) q.addEventListener('input', apply);
    if (cat && cat.addEventListener) cat.addEventListener('change', apply);
    if (date && date.addEventListener) date.addEventListener('change', apply);
    if (reset && reset.addEventListener) reset.addEventListener('click', () => {
      if (q) q.value = '';
      if (cat) cat.value = '';
      if (date) date.value = '';
      apply();
    });
    apply();
  }

  // ---------- IRREGULARITIES ----------
  function irregularities() {
    const sev = (s) => ({ high: 'bad', medium: 'warn', low: '' })[s] || '';
    const items = [...D.irregularities.items].sort((a, b) => b.id - a.id).map((i) => `
      <div class="card">
        <div style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap">
          <span class="chip ${sev(i.severity)} sev-${i.severity}">#${i.id} · ${i.severity}</span>
          ${i.track ? `<span class="chip info">${i.track === 'node' ? 'Node track' : 'Python track'}</span>` : ''}
          <div style="flex:1; min-width:240px">
            <strong>${esc(i.title)}</strong>
            <div class="small" style="margin-top:4px">${esc(i.area)} — ${esc(i.detail)}</div>
            <div class="small" style="margin-top:6px"><strong>Action:</strong> ${esc(i.action)}</div>
          </div>
        </div>
        ${srcs([i.source])}
      </div>`).join('');
    const ids = D.irregularities.items.map((i) => i.id);
    const bySev = { high: 0, medium: 0, low: 0 };
    D.irregularities.items.forEach((i) => { bySev[i.severity] = (bySev[i.severity] || 0) + 1; });
    return `
    <h1>Irregularities &amp; discrepancies flagged for review</h1>
    <p class="lead">${D.irregularities.items.length} items (#${Math.min(...ids)}–#${Math.max(...ids)}, newest first) across both toolchains —
    <span class="chip bad">high ${bySev.high}</span> affects trust in a result ·
    <span class="chip warn">medium ${bySev.medium}</span> affects interpretation · <span class="chip">low ${bySev.low}</span> cosmetic/monitor.
    Nothing flagged here is silently normalized — each item states its action. Full human-readable table:
    <span class="mono">IRREGULARITIES.md</span>.</p>
    ${items}`;
  }

  // ---------- METHODOLOGY ----------
  // ---------- 2026 FORWARD LOOP (R1 collection · R3 calibration tracker · R4 poll layer) ----------
  function forward() {
    const u = D.universeSummary;
    const cal = D.calibrationForward;
    const p26 = D.polls2026;

    const universeBlock = u ? `
      <div class="card"><h3 style="margin-top:0">Full open-market universe — latest daily capture</h3>
        <p style="font-size:14.5px">Captured <strong>${esc(String(u.capturedAt).slice(0, 16).replace('T', ' '))} UTC</strong> from the official public API:
        <strong class="mono">${Number(u.count).toLocaleString('en-US')}</strong> open politics/elections markets across <strong>${u.seriesQueried}</strong> series.
        The daily loop (GitHub Actions, <span class="mono">daily-collection.yml</span>, 12:30 UTC) appends every open market's bid/ask to
        <span class="mono">data/kalshi/forward/open-prices.csv</span> — the forward "expected vs actual" feed.</p>
        <table><thead><tr><th>Market</th><th>Event</th><th>Outcome</th><th class="num">Bid</th><th class="num">Ask</th><th class="num">Volume</th><th class="num">Closes</th></tr></thead>
        <tbody>${u.top.map((m) => `<tr><td class="mono">${esc(m.ticker)}</td><td class="mono small">${esc(m.event || '')}</td><td>${esc(m.sub || '')}</td>
          <td class="num">${m.bid == null ? '—' : (Number(m.bid) * 100).toFixed(0) + '¢'}</td>
          <td class="num">${m.ask == null ? '—' : (Number(m.ask) * 100).toFixed(0) + '¢'}</td>
          <td class="num">${m.vol == null ? '—' : Number(m.vol).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
          <td class="num small">${esc(String(m.close_time || '').slice(0, 10))}</td></tr>`).join('')}</tbody></table>
        <p class="small">Top 15 by volume of ${Number(u.count).toLocaleString('en-US')}; full snapshot: <span class="mono">data/kalshi/forward/universe-open.json</span>.</p>
        ${srcs([u.capturedFrom])}</div>` : `
      <div class="card"><h3 style="margin-top:0">Full open-market universe</h3>
        <p style="font-size:14.5px">The daily collector (<span class="mono">.github/workflows/daily-collection.yml</span> → <span class="mono">scripts/collect-universe.mjs</span>)
        runs on GitHub-hosted runners at 12:30 UTC and commits the full open politics/elections universe, the series registry, the append-only price tracker
        and settled-2026 candle seeds to <span class="mono">data/kalshi/forward/</span>. No capture has been committed to this deployment yet — this block fills in automatically after the first run.</p></div>`;

    const days = cal ? cal.tracker.days : [];
    const rowsPerDay = cal ? cal.tracker.rowsPerDay : {};
    const trackerBlock = cal ? `
      <div class="card"><h3 style="margin-top:0">R3 · Live calibration tracker ("does 70% mean 70%?")</h3>
        <p style="font-size:14.5px">Tracking days: <strong>${days.length}</strong> (${days.map((d) => `${d}: ${Number(rowsPerDay[d]).toLocaleString('en-US')} markets`).join(' · ') || '—'}).
        Settled-2026 markets scored so far: <strong>${cal.settled2026.nScored}</strong> of ${cal.settled2026.nMarketsWithResult} with a result.
        First high-volume settlement on the watchlist: <strong>LA mayor general, 2026-11-03</strong>.</p>
        ${cal.settled2026.byLead.filter((l) => l.nMarkets).length ? `
        <table><thead><tr><th class="num">Lead</th><th class="num">Markets priced</th><th class="num">Mean price</th><th class="num">Outcome rate</th><th class="num">Brier</th><th class="num">Log-loss</th></tr></thead>
        <tbody>${cal.settled2026.byLead.filter((l) => l.nMarkets).map((l) => `<tr><td class="num">T-${l.nDays}</td><td class="num">${l.nMarkets}</td>
          <td class="num">${pct(l.meanProbYes)}</td><td class="num">${pct(l.outcomeRate)}</td>
          <td class="num">${l.meanBrier == null ? '—' : l.meanBrier.toFixed(3)}</td><td class="num">${l.meanLogloss == null ? '—' : l.meanLogloss.toFixed(3)}</td></tr>`).join('')}</tbody></table>` : '<p class="small">No settled 2026 market has a usable price history yet.</p>'}
        ${cal.settled2026.bucketsT7 && cal.settled2026.bucketsT7.nPoints ? `
        <h4 style="margin:10px 0 4px">Calibration buckets @ T-7 (${cal.settled2026.bucketsT7.nPoints} market-observations)</h4>
        <table><thead><tr><th class="num">Price bucket</th><th class="num">n</th><th class="num">Mean price</th><th class="num">Hit rate</th></tr></thead>
        <tbody>${cal.settled2026.bucketsT7.buckets.map((b) => `<tr><td class="num">${b.lo}–${b.hi}¢</td><td class="num">${b.n}</td>
          <td class="num">${(b.meanP * 100).toFixed(1)}¢</td><td class="num">${(b.hitRate * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>
        <p class="small">Perfect calibration = mean price ≈ hit rate in every bucket. Pooled across all settled 2026 election markets; grows as markets settle.</p>` : ''}
        ${cal.watch && cal.watch.laMayor && cal.watch.laMayor.length ? `
        <h4 style="margin:10px 0 4px">LA mayor watch (first big settlement, 2026-11-03)</h4>
        <table><thead><tr><th>Market</th><th>Outcome</th><th class="num">Bid</th><th class="num">Ask</th><th class="num">Volume</th><th class="num">Closes</th></tr></thead>
        <tbody>${cal.watch.laMayor.map((m) => `<tr><td class="mono">${esc(m.ticker)}</td><td>${esc(m.sub || '')}</td>
          <td class="num">${m.bid == null ? '—' : (Number(m.bid) * 100).toFixed(0) + '¢'}</td><td class="num">${m.ask == null ? '—' : (Number(m.ask) * 100).toFixed(0) + '¢'}</td>
          <td class="num">${m.vol == null ? '—' : Number(m.vol).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td><td class="num small">${esc(String(m.close_time || '').slice(0, 10))}</td></tr>`).join('')}</tbody></table>` : ''}
        ${cal.watch && cal.watch.upcomingSettlements && cal.watch.upcomingSettlements.length ? `
        <h4 style="margin:10px 0 4px">Next settlements (earliest close times in the open universe)</h4>
        <table><thead><tr><th>Market</th><th>Outcome</th><th class="num">Bid</th><th class="num">Ask</th><th class="num">Closes (UTC)</th></tr></thead>
        <tbody>${cal.watch.upcomingSettlements.map((m) => `<tr><td class="mono small">${esc(m.ticker)}</td><td class="small">${esc(m.sub || '')}</td>
          <td class="num">${m.bid == null ? '—' : (Number(m.bid) * 100).toFixed(0) + '¢'}</td><td class="num">${m.ask == null ? '—' : (Number(m.ask) * 100).toFixed(0) + '¢'}</td>
          <td class="num small">${esc(String(m.close_time || '').slice(0, 16).replace('T', ' '))}</td></tr>`).join('')}</tbody></table>` : ''}
        <div id="headline-chart-wrap">${Object.keys(cal.tracker.headlineSeries || {}).length ? `<h4 style="margin:10px 0 4px">Headline control markets — daily tracker history</h4><canvas id="fwd-headline" class="chart"></canvas><p class="small">Mid of the API order book per tracker day (CONTROLS/CONTROLH 2026). One point per day — the line grows as the daily loop accumulates.</p>` : ''}</div>
      </div>` : `
      <div class="card"><h3 style="margin-top:0">R3 · Live calibration tracker</h3>
        <p style="font-size:14.5px">The tracker scores every settled 2026 election market at T-1…T-60 (same metrics as the 2024 backtest) and pools
        price-vs-outcome calibration buckets as R1's daily captures accumulate. Output: <span class="mono">data/calibration-2026.json</span>
        (written by <span class="mono">scripts/run-calibration.mjs</span>). It publishes honestly empty until the first networked collection commits.</p></div>`;

    const pollsBlock = p26 ? `
      <div class="card"><h3 style="margin-top:0">R4 · Continuous 2026 poll layer (verified releases only)</h3>
        <table><thead><tr><th>Pollster</th><th>Released</th><th>Field</th><th>Sample</th><th class="num">D</th><th class="num">R</th><th class="num">Unsure</th><th class="num">Margin (computed)</th></tr></thead>
        <tbody>${p26.rows.filter((r) => r.metric === 'house-generic-preference').map((r) => `<tr>
          <td>${esc(r.pollster.split('(')[0].trim())}</td>
          <td class="small">${esc(r.released ? String(r.released).slice(0, 10) : r.releasedMonth || '')}</td>
          <td class="small">${esc(r.fieldDates || '—')}</td>
          <td class="small">${esc(r.sample || 'n/p in source')}</td>
          <td class="num">${r.results.preferD}%</td><td class="num">${r.results.preferR}%</td><td class="num">${r.results.unsure ?? '—'}</td>
          <td class="num">D+${r.results.marginDComputed}</td></tr>`).join('')}</tbody></table>
        <p class="small">Generic congressional ballot (house-control preference). Approval rows and per-wave question wording:
        <span class="mono">data/polls/polls-2026-series.json</span> — every row carries its fetched source URL and verification date.
        Historical NBC waves (2025-03, 2025-10, 2026-03) come from the trend chart inside the directly fetched 2026-06-14 NBC article; wave-level sample/MoE were not published there and are labeled as such.</p>
        <canvas id="polls-2026-chart" class="chart"></canvas>
        <div class="legend"><span><i style="background:#1f5fbf"></i>NBC News</span><span><i style="background:#7a5fbf"></i>Quinnipiac</span></div>
        ${srcs([...new Set(p26.rows.map((r) => r.sourceUrl))])}</div>` : '';

    return `
    <h1>2026 forward loop — collect daily, track expected vs actual</h1>
    <p class="lead">ROADMAP R1 (full open-market universe, daily collection on a networked runner) feeds R3 (live calibration tracker; first big
    settlement: LA mayor, 2026-11-03) and R4 (continuous verified poll layer). Every artifact below is captured, never modeled; empty states are shown as empty.</p>
    ${universeBlock}
    <div class="grid cols2" style="align-items:start">
      ${trackerBlock}
      ${pollsBlock}
    </div>`;
  }

  function drawForwardCharts() {
    const cal = D.calibrationForward;
    if (cal) {
      const hl = document.getElementById('fwd-headline');
      const entries = Object.entries(cal.tracker.headlineSeries || {});
      if (hl && entries.length) {
        const colors = ['#1f5fbf', '#b3261e', '#2e7d32', '#7a5fbf'];
        C.lines(hl, entries.map(([t, pts], i) => ({ label: t, color: colors[i % colors.length], points: pts.map((p) => ({ x: p.date, y: p.mid })) })),
          { yMin: 0, yMax: 1, yFmt: (v) => Math.round(v * 100) + '¢', hLines: [{ y: 0.5, label: '50¢' }] });
      }
    }
    const p26 = D.polls2026;
    const pc = document.getElementById('polls-2026-chart');
    if (p26 && pc) {
      const byPollster = {};
      for (const r of p26.rows.filter((x) => x.metric === 'house-generic-preference')) {
        const label = r.pollster.startsWith('NBC') ? 'NBC News' : r.pollster.startsWith('Quinnipiac') ? 'Quinnipiac' : r.pollster.split('(')[0].trim();
        const date = (r.released || r.releasedMonth || '').slice(0, 10);
        (byPollster[label] = byPollster[label] || []).push({ x: date, y: r.results.marginDComputed });
      }
      const colors = { 'NBC News': '#1f5fbf', Quinnipiac: '#7a5fbf' };
      C.lines(pc, Object.entries(byPollster).map(([label, points]) => ({ label, color: colors[label] || '#2e7d32', points: points.sort((a, b) => a.x.localeCompare(b.x)) })),
        { yFmt: (v) => 'D+' + v.toFixed(0), hLines: [{ y: 0, label: 'tie', color: '#9aa7b5' }] });
    }
  }

  function methodology() {
    return `
    <h1>Methodology</h1>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Data capture</h3>
        <ul style="font-size:14.5px; margin:6px 0; padding-left:20px">
          <li><strong>Forward loop (R1–R4, same daily workflow)</strong>: <span class="mono">scripts/collect-universe.mjs</span> captures the FULL open-market universe (~24k markets, not just top-volume) + a settled-2026 candle seed into <span class="mono">data/kalshi/forward/</span>; <span class="mono">collect-senate-2024-races.mjs</span> refreshes the per-state 2024 Senate capture; <span class="mono">run-calibration.mjs</span> scores the live 2026 calibration tracker (expected vs actual) and <span class="mono">run-senate-backtest.mjs</span> re-runs the T-1..T-60 backtest — rendered in the Forward Loop section.</li>
          <li><strong>Kalshi, daily (GitHub Actions)</strong>: <span class="mono">GET /series?category=Elections|Politics</span> → every open event with nested markets (<span class="mono">mve_filter=exclude</span>) → traded markets appended to <span class="mono">data/kalshi/tracker/daily/</span>; static descriptors in <span class="mono">tracker/index.json</span>; settlements re-checked via <span class="mono">GET /markets?tickers=…</span>. A second, independent Python collector samples the 2,000 most-traded markets from <span class="mono">GET /markets?status=open</span> and the two are cross-checked every run.</li>
          <li><strong>Kalshi, 2024 history</strong>: <span class="mono">/historical/markets?series_ticker=SENATE{ST}</span> for all 50 states + daily candlesticks (<span class="mono">period_interval=1440</span>, ending at midnight Eastern) + per-series fee configs; the hand-verified core three (presidency, chamber controls) from the prior sessions.</li>
          <li><strong>Official outcomes</strong>: FEC-cited figures, congress.gov roll calls, IFES (FEC-sourced), state election authorities (e.g. Texas SoS results portal).</li>
          <li><strong>Polls</strong>: 538's official GitHub archive cloned verbatim (byte sizes, git blob SHA-1 and SHA-256 in <span class="mono">data/polls/PROVENANCE.md</span>); 2026 polls transcribed from the pollster's primary release (PDF or release page) into <span class="mono">data/polls/poll-layer-2026.json</span>.</li>
          <li><strong>Master list</strong>: ${D.sources.sources.length} entries, each fetched and described as observed; cross-platform prices (Polymarket, PredictIt) are used only for discrepancy checks, never as a trading layer.</li>
        </ul></div>
      <div class="card"><h3 style="margin-top:0">Backtest, calibration &amp; contest mechanics</h3>
        <ul style="font-size:14.5px; margin:6px 0; padding-left:20px">
          <li><strong>No look-ahead</strong>: at T-N only bars with end ≤ that date are used; the last known trade close is the forecast price.</li>
          <li><strong>Metrics</strong>: Brier (p−o)², log-loss (clipped 1e-4), hold-to-settlement PnL per contract, favourite hit-rate, pooled calibration buckets (complementary legs de-duplicated).</li>
          <li><strong>Implied probability (live)</strong>: order-book midpoint when a two-sided book with spread ≤ 10¢ exists, else last trade — because the shared API host has served stale last prices (irregularity #2).</li>
          <li><strong>Fees</strong>: Kalshi official schedule — taker = roundUp(M·0.07·C·P·(1−P)) to a centicent; per-series M captured from <span class="mono">GET /series</span>; no settlement/membership fees.</li>
          <li><strong>Fills</strong>: taker at the day's trade close; refused on no-trade days; capped at 10% of the day's volume; NO-side = derived reciprocal, labeled per fill. Ranking requires ≥ ${CT.model.minTradingDaysToRank} active trading days (The Leap).</li>
          <li><strong>Poll→probability</strong>: logistic k=4.5, a labeled modeled mapping used identically for 2024 and 2026.</li>
          <li><strong>Consistency monitor</strong>: mutually-exclusive over-sum (high), under-sum (info — the exchange flag does not imply exhaustiveness), crossed books, stale last-vs-book; findings are published, never corrected.</li>
          <li><strong>Determinism</strong>: zero randomness anywhere; the test suite re-runs the pipeline and asserts byte-equal outputs + the fee-aware attribution identity.</li>
        </ul></div>
    </div>
    <h2>Verification tooling</h2>
    <div class="card">
      <p style="font-size:14.5px"><span class="mono">npm test</span> — ${D.meta.tests} tests: fee math vs the official schedule, engine determinism, attribution identity, no-fill-on-no-trade, 10% fill cap, outcome cross-checks, candlestick normalisation, CSV round-trips, implied-probability rule, calibration scorer (empty state, lead times, pooled curve), consistency checks, collector cross-check, Senate-2024 capture invariants (one YES per state, hand-verified spot bar), source-count and provenance lint.</p>
      <p style="font-size:14.5px"><span class="mono">npm run lint</span> — fails if any data file lacks provenance, if the master list has &lt;20 entries, or if any outcome lacks cited sources.</p>
      <p style="font-size:14.5px"><span class="mono">npm run pipeline</span> — regenerates all published numbers and this site's data bundle; the daily workflow runs it after every capture and commits the result.</p>
    </div>`;
  }


  // ---------- CROSS-LAYER (R14) ----------
  function crosslayer() {
    const X = D.crossLayer;
    if (!X) return '<h1>Cross-layer scoreboard</h1><p class="lead">No cross-layer snapshots yet (data/crosslayer/snapshots.json missing).</p>';
    const S = X.scored;
    const layerName = { kalshi: 'Kalshi (own capture, bid/ask mid)', metaculus: 'Metaculus (community, hub)', ddhq: 'DDHQ Votes (context)', ebo: 'EBO-rendered Kalshi (bid/ask mid)' };
    const rows = S.rows.map((r) => `<tr>
      <td><strong>${esc(r.question)}</strong><br><span class="small">captured ${esc(r.capturedAt)} · election ${esc(r.electionDate)}</span></td>
      ${['kalshi', 'metaculus', 'ddhq', 'ebo'].map((L) => `<td class="num">${r.layers[L] ? pct(r.layers[L].p) + (r.layers[L].brier != null ? `<br><span class="small">Brier ${r.layers[L].brier}</span>` : '') : '—'}</td>`).join('')}
      <td class="num">${r.spread == null ? '—' : (r.spread * 100).toFixed(1) + ' pts'}</td>
      <td>${r.status === 'scored' ? `<span class="chip good">scored · y=${r.y}</span>` : r.status === 'pending' ? '<span class="chip warn">pending canvass</span>' : `<span class="chip warn">${esc(r.status)}</span>`}</td></tr>`).join('');
    const byLayer = Object.entries(S.byLayer).map(([L, v]) => `<tr><td>${esc(layerName[L] || L)}</td><td class="num">${v.answered}</td><td class="num">${v.scored}</td><td class="num">${v.meanBrier == null ? '—' : v.meanBrier}</td><td class="num">${v.meanLogLoss == null ? '—' : v.meanLogLoss}</td></tr>`).join('');
    const official = (X.officialSources || []).map((o) => `<li><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a></li>`).join('');
    const q = Object.entries(X.questions || {}).map(([id, v]) => `<li><span class="mono">${esc(id)}</span> — ${esc(v.text)} · Kalshi event <span class="mono">${esc(v.kalshiEvent)}</span> · <a href="${esc(v.metaculusQuestion)}" target="_blank" rel="noopener">Metaculus question</a></li>`).join('');
    const snLatest = X.stateNavigate && X.stateNavigate.latest ? X.stateNavigate.latest : null;
    const sn = snLatest && snLatest.national && snLatest.national.parse === 'ok' ? snLatest.national : null;
    const snFailed = snLatest && !sn ? `<p class="small"><strong>Latest automated attempt ${esc(snLatest.date || snLatest.capturedAt)}:</strong> national page read via <span class="mono">${esc((snLatest.national && snLatest.national.fetchMethod) || 'fetch')}</span> but <span class="chip warn">parse failed</span> — the free pages are client-rendered (irregularities #58, #62); ${Object.values(snLatest.chambers || {}).filter((c) => c.parse === 'ok').length} of ${Object.keys(snLatest.chambers || {}).length} chamber pages parsed. Nothing is estimated from the shell; the hand-verified 2026-09-19 figures below stay labelled as such until a rendered row parses.</p>` : '';
    const snChambers = X.stateNavigate && X.stateNavigate.latest ? Object.entries(X.stateNavigate.latest.chambers || {}).filter(([, c]) => c.parse === 'ok').slice(0, 40).map(([k, c]) => `<tr><td class="mono">${esc(k)}</td><td>${c.D ? `D ${c.D.seats} (${c.D.change > 0 ? '+' : ''}${c.D.change})` : '—'}</td><td>${c.R ? `R ${c.R.seats} (${c.R.change > 0 ? '+' : ''}${c.R.change})` : '—'}</td><td class="num">${c.odds && c.odds.dMajority != null ? c.odds.dMajority + '%' : '—'}</td><td><a href="${esc(c.capturedFrom)}" target="_blank" rel="noopener">page</a></td></tr>`).join('') : '';
    const rend = X.renderings && X.renderings.rows.length ? X.renderings.rows.slice().reverse().map((r) => `<tr><td>${esc(r.date)}</td><td>${r.renderers.ebo && r.renderers.ebo.senateDemKalshi ? `${pct(r.renderers.ebo.senateDemKalshi.bid)}–${pct(r.renderers.ebo.senateDemKalshi.ask)}` : esc((r.renderers.ebo || {}).extract || '—')}${r.renderers.ebo && r.renderers.ebo.vsCaptured && r.renderers.ebo.vsCaptured.comparable ? `<br><span class="small">vs captured mid ${pct(r.renderers.ebo.vsCaptured.capturedMid)} (diff ${(r.renderers.ebo.vsCaptured.diff * 100).toFixed(1)} pts)</span>` : ''}</td><td>${r.renderers.ddhq ? `House ${pct(r.renderers.ddhq.houseD, 0)} · Senate ${pct(r.renderers.ddhq.senateD, 0)}` : '—'}</td><td>${r.renderers['270towin'] && r.renderers['270towin'].kalshiPanel ? `${pct(r.renderers['270towin'].kalshiPanel.dem, 0)} / ${pct(r.renderers['270towin'].kalshiPanel.rep, 0)} (${esc(r.renderers['270towin'].kalshiPanel.asOf)})` : esc((r.renderers['270towin'] || {}).extract || '—')}</td><td>${r.flags.length ? `<span class="chip warn">${r.flags.length} flag(s)</span><div class="small">${r.flags.map(esc).join('<br>')}</div>` : '<span class="chip good">none</span>'}</td></tr>`).join('') : '';
    // Per-seat / plurality questions from the latest collector row: each row says HOW it was read (fetch, headless
    // render, or nothing) so a rendered number is never confused with a missing one (#62).
    const lastMet = X.metaculusRows.length ? X.metaculusRows[X.metaculusRows.length - 1] : null;
    const metQRows = lastMet && Array.isArray(lastMet.questions) ? lastMet.questions.map((q) => `<tr><td><span class="mono">${esc(q.id)}</span><br><span class="small">${esc(q.state ? q.state + ' · ' : '')}${esc(q.office || '')}</span></td><td class="num">${q.D != null ? q.D + '%' : q.kind === 'binary' && q.p != null ? 'yes ' + q.p + '%' : q.kind === 'state-group' && q.states ? Object.keys(q.states).length + ' states' : '—'}</td><td class="num">${q.R == null ? '—' : q.R + '%'}</td><td class="num">${q.forecasters == null ? '—' : q.forecasters}</td><td>${q.parse === 'ok' ? '<span class="chip good">ok</span>' : `<span class="chip warn">${esc(q.parse || 'failed')}</span>`}<div class="small">${esc(q.fetchMethod || 'not fetched')}${q.fetchError ? ' · ' + esc(String(q.fetchError).slice(0, 90)) : ''}</div></td><td><a href="${esc(q.capturedFrom)}" target="_blank" rel="noopener">question</a></td></tr>`).join('') : '';
    const metQ = metQRows ? `<div class="card"><table><thead><tr><th>Question (latest row ${esc(lastMet.date)})</th><th>D</th><th>R</th><th>Forecasters</th><th>Read via</th><th>Source</th></tr></thead><tbody>${metQRows}</tbody></table><p class="small">Per-seat rows are paired with the same-day Kalshi <span class="mono">SENATE{ST}-26-D</span> market by event title (Kentucky is tickered <span class="mono">SENATELA-26</span> on the exchange — irregularity #59) and appended to the snapshots above. Metaculus sits behind a bot check from the runner: rows marked <em>headless-chrome</em> were rendered, rows marked <em>not fetched</em> record the failure (#62).</p></div>` : '';
    const flagged = (r, key) => (r.consistencyFlags || []).some((f) => f.startsWith(key));
    const chamberCell = (r, key, v) => v == null ? '—' : flagged(r, key) ? `<span class="chip warn" title="contradicts the page's own control quadrants — not written to the scoreboard (#63)">${v}% ?</span>` : v + '%';
    const met = X.metaculusRows.length ? X.metaculusRows.slice().reverse().map((r) => `<tr><td>${esc(r.date)}<br><span class="small">${esc(String(r.capturedAt || '').slice(11, 16))}Z · ${esc(r.fetchMethod || 'not fetched')}</span></td><td class="num">${chamberCell(r, 'houseD', r.houseD)}</td><td class="num">${chamberCell(r, 'senateD', r.senateD)}</td><td class="num">${r.control ? [r.control.DH_DS, r.control.DH_RS, r.control.RH_RS, r.control.RH_DS].map((v) => v == null ? '—' : v).join(' / ') : '—'}</td><td>${r.parse === 'ok' ? '<span class="chip good">ok</span>' : '<span class="chip warn">parse failed</span>'}${r.consistencyFlags && r.consistencyFlags.length ? `<div class="small">${r.consistencyFlags.map(esc).join('; ')}</div>` : ''}</td></tr>`).join('') : '';
    return `
    <h1>Cross-layer scoreboard — market vs forecast vs model</h1>
    <p class="lead">Three independent layers answer the same 2026 control questions. They are recorded side by side today and <strong>scored only against official canvasses</strong> after November 3 (Brier and log-loss per layer). Nothing is scored from a news call or a market settlement; see the method note below.</p>
    <div class="card"><p class="small">${esc(X.method)}</p></div>
    <h2>Snapshots (${S.pendingCount} pending · ${S.scoredCount} scored)</h2>
    <div class="card"><table><thead><tr><th>Question</th><th>Kalshi</th><th>Metaculus</th><th>DDHQ</th><th>EBO→Kalshi</th><th>Max spread</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="small">Kalshi = this project's own API capture (<span class="mono">data/kalshi/universe/latest.json</span>). Metaculus = <a href="https://www.metaculus.com/midterms-2026/" target="_blank" rel="noopener">midterms hub</a>. DDHQ = <a href="https://votes.decisiondeskhq.com/" target="_blank" rel="noopener">DDHQ Votes</a>. EBO = <a href="https://electionbettingodds.com/" target="_blank" rel="noopener">Election Betting Odds</a>' Kalshi row. Irregularity #57 records the spread.</p></div>
    <h2>Paired Metaculus vs Kalshi evaluation</h2>
    <div class="card"><p>${S.pairedComparison.questions} jointly scored question(s). <strong>Mean Brier difference: ${S.pairedComparison.meanBrierDelta == null ? 'pending certification' : S.pairedComparison.meanBrierDelta}</strong></p><p class="small">${esc(S.pairedComparison.method)}</p>
    ${S.pairedComparison.rows.length ? `<table><thead><tr><th>Question</th><th>Probability gap</th><th>Brier difference</th><th>Official evidence</th></tr></thead><tbody>${S.pairedComparison.rows.map((r) => `<tr><td>${esc(r.question)}</td><td>${pp(r.gap * 100)}</td><td>${r.brierDelta}</td><td>${srcs(r.sources.map((s) => s.url))}</td></tr>`).join('')}</tbody></table>` : '<p class="small">A forecast gap is not an error until a matching official outcome is available. November 3 is election day, not an automatic certification deadline.</p>'}</div>
    ${S.refused.length ? `<details><summary>Scoring / input refusals (${S.refused.length})</summary><ul>${S.refused.map((r) => `<li><span class="mono">${esc(r.id)} ${esc(r.layer || '')}</span>: ${esc(r.reason)}</li>`).join('')}</ul></details>` : ''}
    <h2>Per-layer snapshot scores</h2><p class="small">These aggregates count repeated dated snapshots, not independent elections; question sets may differ. Use the paired evaluation above for the same-question comparison.</p>
    <div class="card"><table><thead><tr><th>Layer</th><th>Snapshots answered</th><th>Scored</th><th>Mean Brier</th><th>Mean log-loss</th></tr></thead><tbody>${byLayer}</tbody></table>
      <p class="small">${esc(X.outcomesMethod || '')}</p><p class="small"><strong>Official outcome sources to be used:</strong></p><ul class="small">${official}</ul><p class="small"><strong>Questions:</strong></p><ul class="small">${q}</ul></div>
    <h2>Metaculus daily capture</h2>
    ${metQ}
    <div class="card">${met ? `<table><thead><tr><th>Date</th><th>House D</th><th>Senate D</th><th>DH/DS · DH/RS · RH/RS · RH/DS</th><th>Parse</th></tr></thead><tbody>${met}</tbody></table>` : '<p class="small">No automated Metaculus rows yet — <span class="mono">scripts/collect-metaculus.mjs</span> runs in the daily workflow (first row appears after the first networked run). The seed snapshot above was transcribed by hand from the hub on 2026-09-19.</p>'}</div>
    <h2>State Navigate — state-legislative layer (not priced by Kalshi)</h2>
    <div class="card">${sn ? `<div class="stats"><div class="stat"><div class="n">${int(sn.seatsForecasted)}</div><div class="l">seats forecasted</div></div><div class="stat"><div class="n">${int(sn.dPickups)}</div><div class="l">D pickups</div></div><div class="stat"><div class="n">${int(sn.rPickups)}</div><div class="l">R pickups</div></div><div class="stat"><div class="n">${int(sn.projectedFlips)}</div><div class="l">projected flips</div></div></div>${snChambers ? `<table><thead><tr><th>Chamber</th><th>D</th><th>R</th><th>D majority</th><th>Source</th></tr></thead><tbody>${snChambers}</tbody></table>` : ''}<p class="small">Captured ${esc(X.stateNavigate.latest.capturedAt)} from <a href="${esc(X.stateNavigate.capturedFrom)}" target="_blank" rel="noopener">${esc(X.stateNavigate.capturedFrom)}</a> (${X.stateNavigate.days} day(s) on file).</p>` : snFailed + '<p class="small">No parsed State Navigate rows yet — <span class="mono">scripts/collect-statenavigate.mjs</span> runs in the daily workflow. Verified by hand on 2026-09-19 from <a href="https://projects.statenavigate.com/25-26/national/" target="_blank" rel="noopener">the free national forecast page</a>: 2,306 seats forecasted · 124 D pickups · 11 R pickups · 27 chambers · 143 close seats · 135 projected flips. The API host <span class="mono">data.statenavigate.com</span> returned HTTP 500 and data downloads require a paid tier (irregularity #55) — no endpoint is used.</p>'}</div>
    <h2>R13 — third-party renderings of Kalshi vs our capture</h2>
    <div class="card">${rend ? `<table><thead><tr><th>Date</th><th>EBO Kalshi Senate-D</th><th>DDHQ odds</th><th>270toWin Kalshi panel</th><th>Flags</th></tr></thead><tbody>${rend}</tbody></table><p class="small">${esc(X.renderings.method)}</p>` : '<p class="small">No automated rows yet — <span class="mono">scripts/crosscheck-renderings.mjs</span> runs daily. Manual check 2026-09-19: EBO showed Kalshi Senate-D 58.4–59.4% against our captured 59/60¢ (within tolerance); DDHQ House 70% / Senate 52%; 270toWin\'s Kalshi panel 57% / 41% (2028 presidency, as of Sep. 19, 2026 20:29 UTC).</p>'}</div>`;
  }

  // ---------- ROADMAP ----------
  function roadmap() {
    const items = D.roadmap.items.map((r) => `
      <div class="card"><div style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap">
        <span class="chip info">${r.id}</span><strong style="font-size:15.5px">${esc(r.title)}</strong>${r.status ? `<span class="chip ${/done/i.test(r.status) ? 'good' : 'warn'}">${esc(r.status)}</span>` : ''}</div>
        <p style="font-size:14.5px; margin:8px 0">${esc(r.detail)}</p>
        <p class="small"><strong>Why:</strong> ${esc(r.why)}</p></div>`).join('');
    const lims = D.roadmap.limitations.map((l) => `<li style="font-size:14.5px">${esc(l)}</li>`).join('');
    return `
    <h1>Roadmap &amp; limitations</h1>
    <p class="lead">Remaining work for the next session(s), ordered by value — plus the honest limitations of what exists today (updated ${esc(D.roadmap.updated || D.meta.updated)}).</p>
    <h2>Next work</h2>
    ${items}
    <h2>Current limitations</h2>
    <div class="card"><ul style="margin:6px 0; padding-left:20px">${lims}</ul></div>`;
  }

  // ---------- ROUTER ----------
  const RENDER = { overview, markets, polls, tracker, forward, crosslayer, backtests, contest, sources, irregularities, methodology, roadmap };
  const AFTER = { forward: drawForwardCharts, backtests: drawBacktestCharts, contest: drawContestCharts, polls: drawPollCharts, tracker: drawTrackerCharts, sources: wireSources };

  const nav = document.getElementById('nav');
  nav.innerHTML = SECTIONS.map(([id, label]) => `<a href="#/${id}" data-id="${id}">${label}</a>`).join('');

  function render() {
    const id = (location.hash.replace(/^#\//, '') || 'overview');
    const fn = RENDER[id] || RENDER.overview;
    document.getElementById('main').innerHTML = fn();
    nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.id === (RENDER[id] ? id : 'overview')));
    window.scrollTo(0, 0);
    if (AFTER[id]) requestAnimationFrame(AFTER[id]);
  }
  window.addEventListener('hashchange', render);
  document.getElementById('footline').textContent = `Daily capture ${U ? U.date : '—'} · hand snapshot ${day(D.snapshot.capturedAt)} · site bundle generated ${D.generatedAt} · repo ${D.meta.repo}`;
  render();
})();
