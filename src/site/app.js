/**
 * Elections — static site renderer (no build step at browse time).
 * All data arrives from src/data/site-data.js (generated bundle of the
 * verified files under data/).
 */
(function () {
  const D = window.SITE_DATA;
  const C = window.Chart2;
  if (!D) { document.getElementById('main').innerHTML = '<p>site-data.js missing — run <span class="kbd">npm run build-site</span>.</p>'; return; }

  const SECTIONS = [
    ['overview', 'Overview'],
    ['markets', '2026 Live Markets'],
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
  const pct = (x, d = 1) => (x == null ? '—' : (x * 100).toFixed(d) + '%');
  const pp = (x, d = 1) => (x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(d) + 'pp');
  const cls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');

  function srcs(urls) {
    if (!urls || !urls.length) return '';
    const seen = new Set();
    const items = urls.filter((u) => u && /^https?:/.test(u) && !seen.has(u) && seen.add(u))
      .map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, '').slice(0, 60))}</a>`).join('');
    return items ? `<div class="srcs">${items}</div>` : '';
  }

  // ---------- OVERVIEW ----------
  function overview() {
    const sources = D.sources.sources.length;
    const irregular = D.irregularities.items.length;
    const ranked = D.contest.leaderboard.length;
    const leader = D.contest.leaderboard[0];
    return `
    <h1>Elections — collect, analyze, project &amp; estimate</h1>
    <p class="lead">A verification-first election intelligence project: <strong>official, free, public data only</strong>.
    It collects open political/election prediction markets, backtests <em>polls and markets</em> against
    <em>verified official outcomes</em>, flags every irregularity it finds, and runs a paper-trading
    forecasting contest (reverse-engineered from TradingView's <a href="https://www.tradingview.com/the-leap/crypto-series-may-2026/" target="_blank" rel="noopener">The Leap</a>)
    on Kalshi's open election markets.</p>
    <div class="grid cols4">
      <div class="stat"><div class="n">${sources}</div><div class="l">verified sources in the master list (line-by-line, 2026-09-18 + 2026-09-19)</div></div>
      <div class="stat"><div class="n">3 / 3</div><div class="l">2024 Kalshi markets backtested vs official settlements (all cross-checks PASS)</div></div>
      <div class="stat"><div class="n">${ranked}</div><div class="l">ranked contest entrants · ${esc(leader ? leader.username : '—')} leads at ${leader ? leader.realizedPnlPct.toFixed(1) : '—'}%</div></div>
      <div class="stat"><div class="n">${irregular}</div><div class="l">irregularities &amp; discrepancies flagged for review</div></div>
    </div>
    <div class="callout good"><strong>Honesty contract.</strong> Every number on this site traces to a captured URL recorded in <span class="mono">data/</span>
    (machine-checked by <span class="mono">npm run lint</span>). Captured-vs-inferred values are labeled.
    Strategies contain no hard-coded outcomes — only executable <span class="mono">decide()</span> rules. Fills are refused on days with no trade and capped at 10% of the day's volume.</div>
    <div class="grid cols2">
      <div class="card"><h3>What's inside</h3>
        <ul style="margin:8px 0 0; padding-left:20px; font-size:14.5px">
          <li><a href="#/markets">2026 Live Markets</a> — the full captured Kalshi Midterms Hub board (35 Senate races, controls, seat counts, combos, mayors, ballot measures) with cross-platform checks.</li>
          <li><a href="#/backtests">Backtests</a> — 2024 Kalshi market prices vs official settlements (Brier / log-loss / calibration) and the 538 poll archive vs market vs outcome.</li>
          <li><a href="#/contest">Contest</a> — 8 paper-trading entrants with unique usernames &amp; testable theses, $100k each, Kalshi's real fee schedule.</li>
          <li><a href="#/sources">Sources</a> — the master list with per-entry verification notes; <a href="#/irregularities">Irregularities</a> — everything that didn't reconcile.</li>
        </ul>
      </div>
      <div class="card"><h3>2024 headline finding (verified)</h3>
        <p style="font-size:14.5px; margin:6px 0">The final archived 538 national average (2024-09-12) was <strong>Harris +2.82pp</strong>;
        the official outcome was <strong>Trump +1.45pp</strong> (2-party popular vote, FEC numbers) — a <strong>4.3pp miss in the wrong direction</strong>.
        The Kalshi presidential market (50–63¢ Trump over the same window) was closer. Details in <a href="#/backtests">Backtests → Polls</a>.</p>
      </div>
    </div>`;
  }

  // ---------- MARKETS ----------
  function markets() {
    const s = D.snapshot;
    const rows = s.senate2026Races.map((r) => {
      const c = r.rating.startsWith('Safe') ? 'bad' : r.rating.startsWith('Likely') ? 'warn' : r.rating.startsWith('Lean') ? 'info' : 'good';
      return `<tr><td>${esc(r.state)}</td>
        <td><div class="bar-track"><div class="bar-fill dem" style="width:${r.demPct}%"></div></div></td>
        <td class="num">${r.demPct}%</td>
        <td><span class="chip ${c}">${esc(r.rating)}</span></td></tr>`;
    }).join('');
    const combos = (s.comboAndNoveltyMarkets || []).map((m) => `
      <div class="card"><div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <strong>${esc(m.question)}</strong>
        <span class="small">${money(m.volumeDollars)} vol · ${m.marketsInEvent || '—'} markets</span></div>
        <div class="legend" style="margin-top:8px">
          ${(m.topOutcomes || []).map((o) => `<span><i style="background:var(--accent)"></i>${esc(o.outcome)} — <strong>${o.pct}%</strong></span>`).join('')}
        </div>
      </div>`).join('');
    const other = (s.other2026ElectionMarkets || []).map((m) => `<tr>
      <td>${esc(m.question)}</td>
      <td>${(m.topOutcomes || []).map((o) => `${esc(o.outcome)} <strong>${o.pct}%</strong>${o.odds ? ' (' + esc(o.odds) + ')' : ''}`).join(' · ')}</td>
      <td class="num">${money(m.volumeDollars)}</td></tr>`).join('');
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
    <h1>2026 Live Markets (captured ${esc((s.capturedAt || '').slice(0, 10))})</h1>
    <p class="lead">The open political/election market universe on Kalshi, captured from the official exchange UI + public API.
    Percentages are YES-side; API book figures where captured are authoritative (see <a href="#/irregularities">irregularity #2</a> on stale API last-prices).</p>

    <h2>Chamber control</h2>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Senate (2026)</h3>
        <div class="grid cols2">
          <div class="stat"><div class="n">59–60¢</div><div class="l">Democratic bid–ask (CONTROLS-2026-D)</div></div>
          <div class="stat"><div class="n">40–41¢</div><div class="l">Republican bid–ask (CONTROLS-2026-R)</div></div>
        </div>
        <p class="small">Settlement: party of the President pro tempore on Feb 1, 2027 (or media consensus). Source:
        <a href="https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=CONTROLS&limit=4" target="_blank" rel="noopener">API</a> ·
        <a href="https://kalshi.com/markets/controls/senate-winner/controls-2026" target="_blank" rel="noopener">page</a></p>
      </div>
      <div class="card"><h3 style="margin-top:0">House (2026)</h3>
        <div class="grid cols2">
          <div class="stat"><div class="n">~90¢</div><div class="l">Democratic (implied reciprocal; API R-book captured)</div></div>
          <div class="stat"><div class="n">10–11¢</div><div class="l">Republican bid–ask (CONTROLH-2026-R)</div></div>
        </div>
        <p class="small">Volume ${money(20929542)} (R market) · OI ${money(13387529)}. <strong>Flag:</strong> API last-price timestamps were stale (Jul 14) on the shared host — order book used instead (irregularity #2).</p>
      </div>
    </div>

    <h2>35 Senate races (Nov 3, 2026)</h2>
    <div class="card"><table>
      <thead><tr><th>State</th><th>Democratic share</th><th class="num">D %</th><th>Hub rating</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="small">Source: <a href="https://kalshi.com/category/elections/midterms" target="_blank" rel="noopener">Kalshi Midterms Hub</a>, captured 2026-09-18.
    Top-race candidate detail: <a href="#/markets#topraces">below</a>.</p></div>

    <h2 id="topraces">Most-traded Senate matchups (candidates)</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>State</th><th>Democrat</th><th>Republican</th><th class="num">D %</th><th class="num">R %</th></tr></thead>
      <tbody>${(s.senate2026TopRaces || []).map((r) => `<tr><td>${esc(r.state)}</td><td>${esc(r.dem)}</td><td>${esc(r.rep)}</td><td class="num">${r.demPct}%</td><td class="num">${r.repPct}%</td></tr>`).join('')}</tbody>
    </table></div>

    <h2>Seat counts &amp; novelty markets</h2>
    <div class="grid cols2">${combos}</div>

    <h2>Other Nov-3 markets (AGs, mayors, ballot measures, …)</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>Market</th><th>Top outcomes (YES%)</th><th class="num">Volume</th></tr></thead>
      <tbody>${other}</tbody>
    </table></div>

    <h2>Cross-platform &amp; time-series checks</h2>
    ${checks}
    <div class="callout warn"><strong>Universe note.</strong> 34 of 35 Senate seats have tradeable markets (Louisiana thin) and only 66 of 435 House districts are individually priced
    (irregularity #9). The full universe is enumerated by <span class="mono">scripts/collect-kalshi.mjs</span> on each collect run.</div>`;
  }

  // ---------- BACKTESTS ----------
  function backtests() {
    const bt = D.backtests.marketBacktest;
    const pb = D.backtests.pollBacktest;
    const agg = bt.aggregate.map((a) => `<tr>
      <td class="num">T-${a.nDays}</td>
      <td class="num">${a.nMarkets}</td>
      <td class="num">${pct(a.meanProbYes)}</td>
      <td class="num">${a.meanBrier == null ? '—' : a.meanBrier.toFixed(3)}</td>
      <td class="num">${a.meanLogloss == null ? '—' : a.meanLogloss.toFixed(3)}</td>
      <td class="num ${cls(a.meanHoldPnlPerContract)}">${a.meanHoldPnlPerContract == null ? '—' : (a.meanHoldPnlPerContract > 0 ? '+' : '') + a.meanHoldPnlPerContract.toFixed(3) + ' $/contract'}</td>
    </tr>`).join('');
    const mkCharts = bt.markets.map((m, i) => `
      <div class="card"><h3 style="margin-top:0">${esc(m.ticker)} — ${esc(m.title)}</h3>
        <canvas id="mk-${i}" class="chart"></canvas>
        <p class="small">Outcome: <span class="chip ${m.outcomeIsYes ? 'good' : 'bad'}">${m.outcomeIsYes ? 'YES' : 'NO'}</span>
        (official settlement, ${esc(m.ticker)}). Last captured bar 2024-11-04 (election-day bar not captured — irregularity #11).</p>
      </div>`).join('');
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
    const mkLead = bt.markets.map((m) => {
      const l = m.leadTimes.find((x) => x.nDays === 7);
      return `<tr><td>${esc(m.ticker)}</td><td class="num">${l && l.p != null ? (l.p * 100).toFixed(0) + '¢' : '—'}</td>
      <td class="num">${l && l.brier != null ? l.brier.toFixed(3) : '—'}</td>
      <td class="num ${cls(l && l.holdPnlPerContract)}">${l && l.holdPnlPerContract != null ? (l.holdPnlPerContract > 0 ? '+' : '') + l.holdPnlPerContract.toFixed(3) : '—'} $/contract</td></tr>`;
    }).join('');
    return `
    <h1>Backtests — polls &amp; markets vs verified outcomes</h1>
    <p class="lead">Inputs: captured Kalshi 2024 market history (official API, settled outcomes) + the archived 538 national poll averages + official results (FEC-cited).
    Deterministic — re-run with <span class="mono">npm run backtest</span>.</p>

    <h2>1 · Official outcomes (cross-check targets)</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>Race</th><th>Official result</th><th>Detail</th><th>Kalshi vs official</th></tr></thead>
      <tbody>${outcomes}</tbody>
    </table>
    <p class="small">Sources per outcome: <a href="data/outcomes/verified-outcomes.json" target="_blank" rel="noopener">data/outcomes/verified-outcomes.json</a> (each row cites its URLs).</p></div>

    <h2>2 · Kalshi market calibration (2024)</h2>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Aggregate (mean over captured markets)</h3>
        <table><thead><tr><th class="num">Lead</th><th class="num">Markets</th><th class="num">Mean P(YES)</th><th class="num">Brier</th><th class="num">Log-loss</th><th class="num">Hold PnL</th></tr></thead>
        <tbody>${agg}</tbody></table>
        <p class="small">T-60 shows <em>no markets</em> because the presidential market opened 2024-10-04 and the chamber markets 2024-09-12 — reported honestly, not imputed.</p>
      </div>
      <div class="card"><h3 style="margin-top:0">Per market @ T-7</h3>
        <table><thead><tr><th>Market</th><th class="num">P(YES)</th><th class="num">Brier</th><th class="num">Hold PnL</th></tr></thead>
        <tbody>${mkLead}</tbody></table>
        <p class="small">A holding buyer of the YES side seven days out would have earned the "Hold PnL" per $1 contract. All three YES sides settled YES (the R sweep).</p>
      </div>
    </div>
    ${mkCharts}

    <h2>3 · Polls vs market vs outcome (2024 presidential)</h2>
    <div class="card"><canvas id="poll-chart" class="chart"></canvas>
      <div class="legend"><span><i style="background:#1f5fbf"></i>538 national 2-party margin (pp, archived series ends 2024-09-12)</span></div>
      <p class="small">Annotations: 2024-07-21 Biden withdrawal · 2024-08-05 Harris nomination. Final archived value Harris +2.82 vs official outcome Trump +1.45 (FEC).</p>
    </div>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Checkpoints (poll archive)</h3>
        <table><thead><tr><th>Date</th><th class="num">Poll margin</th><th class="num">Poll⇒P(Trump)<sup>a</sup></th><th class="num">Kalshi DJT</th></tr></thead>
        <tbody>${checkpoints}</tbody></table></div>
      <div class="card"><h3 style="margin-top:0">Late window (anchor reused, age disclosed)</h3>
        <table><thead><tr><th>Date</th><th class="num">Poll margin</th><th class="num">Poll⇒P(Trump)<sup>a</sup></th><th class="num">Kalshi DJT</th><th class="num">Poll − market</th></tr></thead>
        <tbody>${late}</tbody></table>
        <p class="small"><sup>a</sup> logistic mapping k=4.5 — <em>modeled assumption, labeled</em> (irregularity #12). The 538 archive ends 2024-09-12, so late dates reuse the anchor with age in days.</p></div>
    </div>
    <div class="callout"><strong>Finding.</strong> The final poll average was off by <strong>${Math.abs(pb.pollAnchorAbsErrorPp).toFixed(1)}pp in the wrong direction</strong>;
    the market's T-7 price (58¢ Trump) implied a 16pp margin — still wrong in magnitude, but the market never crossed 50¢ the wrong way after October,
    while the poll average said the opposite. Calibration detail above.</div>`;
  }

  function drawBacktestCharts() {
    const bt = D.backtests.marketBacktest;
    bt.markets.forEach((m, i) => {
      const cv = document.getElementById('mk-' + i);
      if (!cv) return;
      C.lines(cv, [{
        label: m.ticker, color: '#1f5fbf',
        points: m.series.map((p) => ({ x: p.date, y: p.p })),
      }], { yMin: 0, yMax: 1, yFmt: (v) => Math.round(v * 100) + '¢', hLines: [{ y: 0.5, label: '50¢' }] });
    });
    const pv = document.getElementById('poll-chart');
    if (pv) {
      C.lines(pv, [{
        label: '538 margin', color: '#1f5fbf',
        points: D.pollSeries2024.map((p) => ({ x: p.date, y: p.margin })),
      }], { yFmt: (v) => (v > 0 ? '+' : '') + v.toFixed(1), hLines: [{ y: 0, label: 'tie', color: '#9aa7b5' }] });
    }
  }

  // ---------- CONTEST ----------
  function contest() {
    const c = D.contest;
    const lb = c.leaderboard.map((r, i) => `
      <tr ${i === 0 ? 'style="background:var(--accent-soft)"' : ''}>
        <td class="num"><strong>#${r.rank}</strong></td>
        <td><span class="mono">@${esc(r.username)}</span></td>
        <td class="num">${usd(r.finalEquity)}</td>
        <td class="num ${cls(r.realizedPnl)}">${r.realizedPnl > 0 ? '+' : ''}${usd(r.realizedPnl)} (${r.realizedPnlPct > 0 ? '+' : ''}${r.realizedPnlPct.toFixed(2)}%)</td>
        <td class="num">${usd(r.feesPaid)}</td>
        <td class="num">${r.trades}</td></tr>`).join('');
    const cards = c.results.filter((r) => r.ranked).map((r, i) => {
      const fills = r.fillLog.filter((f) => f.date !== 'settlement').slice(0, 8).map((f) =>
        `<div class="small mono">${f.date} ${f.ticker} ${f.action} ${f.side} ×${f.shares} @ ${f.price} (fee ${usd(f.fee)})</div>`).join('');
      return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px">
          <strong class="mono">@${esc(r.username)}</strong>
          <span class="chip ${r.realizedPnl >= 0 ? 'good' : 'bad'}">${r.realizedPnl > 0 ? '+' : ''}${r.realizedPnlPct.toFixed(2)}% · ${usd(r.finalEquity)}</span>
        </div>
        <p class="small" style="margin:8px 0">${esc(r.thesis)}</p>
        <canvas id="eq-${i}" class="chart" style="height:170px"></canvas>
        <details><summary>Fills (${r.fillLog.length} incl. settlement)</summary><div class="body">${fills}${r.fillLog.length > 8 ? '<div class="small">…</div>' : ''}</div></details>
      </div>`;
    }).join('');
    return `
    <h1>Contest — paper-trading forecasting entrants</h1>
    <p class="lead">A reverse-engineering of TradingView's <a href="https://www.tradingview.com/the-leap/crypto-series-may-2026/" target="_blank" rel="noopener">The Leap</a> contest, adapted to Kalshi election markets:
    $100,000 paper bankroll per entrant, ranked by <strong>realized P&amp;L at settlement</strong>, open positions force-closed at the official settlement value,
    Kalshi's official quadratic taker fees, and honest fill rules (no fills on no-trade days; fills capped at 10% of the day's volume; NO-side prices labeled as derived reciprocals).</p>

    <div class="callout"><strong>The universe.</strong> ${c.model.universe.map(esc).join(', ')} — the captured 2024 settled markets (presidency + chamber controls),
    daily bars, official settlements (all cross-checked PASS vs official results).</div>

    <h2>Leaderboard (2024 cycle)</h2>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th class="num">Rank</th><th>Entrant</th><th class="num">Final equity</th><th class="num">Realized P&amp;L</th><th class="num">Fees paid</th><th class="num">Trades</th></tr></thead>
      <tbody>${lb}</tbody></table>
      <p class="small">Unranked (0 trades — the rules, not the engine, suppressed them): ${c.unranked.map((u) => `<span class="mono">@${esc(u)}</span>`).join(', ')} —
      no qualifying price (0.05–0.20 longshot; ≥0.90 in final two weeks) ever appeared in the captured 2024 universe. Reported, not hidden.</p></div>

    <h2>Entrants &amp; theses</h2>
    <div class="grid cols2">${cards}</div>

    <h2>What the cycle says about the theses</h2>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Supported this cycle</h3>
        <ul style="font-size:14.5px; margin:6px 0; padding-left:20px">
          <li><strong>@breakout-bandit (+${(c.leaderboard[0] || {}).realizedPnlPct.toFixed(1)}%)</strong> — late-week consensus was the strongest edge: the 2024 markets were directionally stable in the final week.</li>
          <li><strong>@fader-flipper (+13.9%)</strong> — the post-shock fades (Oct 30/31 Trump dip) reverted as the thesis predicted.</li>
        </ul></div>
      <div class="card"><h3 style="margin-top:0">Rejected / unresolved this cycle</h3>
        <ul style="font-size:14.5px; margin:6px 0; padding-left:20px">
          <li><strong>@poll-anchor (−13.3%)</strong> — the verified 538 anchor was wrong and the market was right; the poll-information thesis <em>fails</em> on 2024 (see Backtests §3).</li>
          <li><strong>@momentum-mule (−3.1%)</strong> — 5-day momentum was noise/whipsaw in the final month; 2024 is a single cycle — needs 2026 replication.</li>
          <li><strong>@favorite-cash (+0.1%)</strong> — the only ≥0.65 price (Senate-R at 75¢ on day one) paid, but the 2024 presidency never traded ≥65¢: carry was structurally unavailable.</li>
        </ul></div>
    </div>
    <p class="small">Determinism + attribution identity (finalEquity = capital + fee-aware realized P&amp;L) are enforced by the test suite (<span class="mono">npm test</span>, 25 tests).</p>`;
  }

  function drawContestCharts() {
    D.contest.results.filter((r) => r.ranked).forEach((r, i) => {
      const cv = document.getElementById('eq-' + i);
      if (!cv) return;
      C.lines(cv, [{
        label: r.username, color: r.realizedPnl >= 0 ? '#177245' : '#b3261e',
        points: r.equityCurve.map((p) => ({ x: p.date, y: p.equity })),
      }], { yFmt: (v) => '$' + Math.round(v / 1000) + 'k', hLines: [{ y: 100000, label: 'start $100k', color: '#9aa7b5' }] });
    });
  }

  // ---------- SOURCES ----------
  function sources() {
    const all = D.sources.sources;
    const counts = {};
    all.forEach((s) => { counts[s.verifiedOn] = (counts[s.verifiedOn] || 0) + 1; });
    const byDate = Object.keys(counts).sort();
    const rows = all.map((s) => `
      <tr>
        <td><a href="${esc(s.url)}" target="_blank" rel="noopener"><strong>${esc(s.name)}</strong></a><br><span class="small">${esc(s.type)}</span></td>
        <td class="small">${esc(s.verified)}</td>
        <td class="small" style="white-space:nowrap">${esc(s.verifiedOn)}<br><span class="chip good">${esc(s.status)}</span></td>
        <td class="small">${s.notes ? esc(s.notes) : ''}</td>
      </tr>`).join('');
    const perSession = byDate.map((d) => `${d}: ${counts[d]}`).join(' · ');
    return `
    <h1>Master source list</h1>
    <p class="lead">${all.length} entries — ${perSession} — each verified line-by-line in its session: the URL was fetched
    (or, where a direct fetch failed, located via live search — noted in the <em>verified</em> column), and that column
    records <strong>exactly what was observed</strong>. Nothing is listed on assumption; every row carries a link for manual
    review. Machine-checked by <span class="mono">scripts/lint-verified.mjs</span>; full audit trail in
    <span class="mono">VERIFICATION.md</span> (session sections).</p>
    <div class="card" style="overflow-x:auto"><table>
      <thead><tr><th>Source (link for manual review)</th><th>What was verified</th><th>When / status</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  // ---------- IRREGULARITIES ----------
  function irregularities() {
    const sev = (s) => ({ high: 'bad', medium: 'warn', low: '' })[s] || '';
    const items = D.irregularities.items.map((i) => `
      <div class="card">
        <div style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap">
          <span class="chip ${sev(i.severity)} sev-${i.severity}">#${i.id} · ${i.severity}</span>
          <div style="flex:1; min-width:240px">
            <strong>${esc(i.title)}</strong>
            <div class="small" style="margin-top:4px">${esc(i.area)} — ${esc(i.detail)}</div>
            <div class="small" style="margin-top:6px"><strong>Action:</strong> ${esc(i.action)}</div>
          </div>
        </div>
        ${srcs([i.source])}
      </div>`).join('');
    return `
    <h1>Irregularities &amp; discrepancies flagged for review</h1>
    <p class="lead">${D.irregularities.items.length} items. Severity: <span class="chip bad">high</span> affects trust in a result ·
    <span class="chip warn">medium</span> affects interpretation · <span class="chip">low</span> cosmetic/monitor.
    Nothing flagged here is silently normalized — each item states its action.</p>
    ${items}`;
  }

  // ---------- METHODOLOGY ----------
  function methodology() {
    return `
    <h1>Methodology</h1>
    <div class="grid cols2">
      <div class="card"><h3 style="margin-top:0">Data capture (sessions 2026-09-18 + 2026-09-19)</h3>
        <ul style="font-size:14.5px; margin:6px 0; padding-left:20px">
          <li><strong>Kalshi</strong>: official public API on the production host <span class="mono">api.elections.kalshi.com</span> (listed in docs.kalshi.com). Live markets via <span class="mono">GET /markets?series_ticker=…</span>; settled 2024 markets via the <span class="mono">/historical</span> tier (cutoff 2026-07-20); daily candlesticks via <span class="mono">GET /markets/{t}/candlesticks?period_interval=1440</span>; series fee configs via <span class="mono">GET /series/{t}</span>. Every file records its exact URL + capture time.</li>
          <li><strong>Official outcomes</strong>: FEC-cited figures via the MediaWiki API (infobox wikitext/REST summaries fetched directly), congress.gov roll calls, IFES (FEC-sourced).</li>
          <li><strong>Polls</strong>: 538's official GitHub archive cloned verbatim (byte sizes in <span class="mono">data/polls/PROVENANCE.md</span>); individual 2024/2026 polls verified via primary pages or full syndications.</li>
          <li><strong>Source expansion (2026-09-19)</strong>: 21 additional master-list entries (32 → 53) fetched line-by-line from official government portals, news outlets, polling institutions, academic repositories, and a second prediction market (PredictIt); 3 ecosystem irregularities flagged in the same pass (OpenElections offline, U.S. Elections Project migration, Edison/SSRS acquisition).</li>
          <li><strong>Cross-platform</strong>: Polymarket (2026-09-18) and PredictIt (2026-09-19) used only for discrepancy checks, never as a trading layer.</li>
        </ul></div>
      <div class="card"><h3 style="margin-top:0">Backtest &amp; contest mechanics</h3>
        <ul style="font-size:14.5px; margin:6px 0; padding-left:20px">
          <li><strong>No look-ahead</strong>: at T-N only bars with end ≤ that date are used; the last known trade close is the forecast price.</li>
          <li><strong>Metrics</strong>: Brier (p−o)², log-loss (clipped 1e-4), hold-to-settlement PnL per contract; calibration buckets.</li>
          <li><strong>Fees</strong>: Kalshi official schedule — taker = roundUp(M·0.07·C·P·(1−P)) to a centicent; M=1 for PRES/CONTROLH/CONTROLS (captured from <span class="mono">GET /series</span>); no settlement/membership fees.</li>
          <li><strong>Fills</strong>: taker at the day's trade close; refused on no-trade days; capped at 10% of the day's volume; NO-side = derived reciprocal, labeled per fill.</li>
          <li><strong>Poll→probability</strong>: logistic k=4.5, a labeled modeled mapping (the archive publishes margins, not probabilities).</li>
          <li><strong>Dates</strong>: Kalshi daily bars end at midnight Eastern (DST transition visible 2024-11-03); labels use the America/New_York trading day.</li>
          <li><strong>Determinism</strong>: zero randomness anywhere; the test suite re-runs the whole pipeline and asserts byte-equal outputs + the fee-aware attribution identity.</li>
        </ul></div>
    </div>
    <h2>Verification tooling</h2>
    <div class="card">
      <p style="font-size:14.5px"><span class="mono">npm test</span> — 25 tests: fee math vs the official schedule, engine determinism, attribution identity,
      no-fill-on-no-trade, 10% fill cap, outcome cross-checks (Kalshi settlement vs official), candlestick transcription integrity, source-count and provenance lint.</p>
      <p style="font-size:14.5px"><span class="mono">npm run lint</span> — fails if any data file lacks provenance, if the master list has &lt;20 entries, or if any outcome lacks cited sources.</p>
      <p style="font-size:14.5px"><span class="mono">npm run backtest && npm run contest && npm run build-site</span> — regenerates all published numbers and this site's data bundle.</p>
    </div>`;
  }

  // ---------- ROADMAP ----------
  function roadmap() {
    const items = D.roadmap.items.map((r) => `
      <div class="card"><div style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap">
        <span class="chip info">${r.id}</span><strong style="font-size:15.5px">${esc(r.title)}</strong></div>
        <p style="font-size:14.5px; margin:8px 0">${esc(r.detail)}</p>
        <p class="small"><strong>Why:</strong> ${esc(r.why)}</p></div>`).join('');
    const lims = D.roadmap.limitations.map((l) => `<li style="font-size:14.5px">${esc(l)}</li>`).join('');
    return `
    <h1>Roadmap &amp; limitations</h1>
    <p class="lead">Remaining work for the next session(s), ordered by value — plus the honest limitations of what exists today.</p>
    <h2>Next work</h2>
    ${items}
    <h2>Current limitations</h2>
    <div class="card"><ul style="margin:6px 0; padding-left:20px">${lims}</ul></div>`;
  }

  // ---------- ROUTER ----------
  const RENDER = { overview, markets, backtests, contest, sources, irregularities, methodology, roadmap };
  const AFTER = { backtests: drawBacktestCharts, contest: drawContestCharts };

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
  document.getElementById('footline').textContent = `Data snapshot ${esc(D.snapshot.capturedAt.slice(0, 10))} · site bundle generated ${D.generatedAt} · repo ${D.meta.repo}`;
  render();
})();
