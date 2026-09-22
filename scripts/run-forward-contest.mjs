#!/usr/bin/env node
/**
 * Elections — Live 2026 contest runner (ROADMAP R16)
 * =====================================================================
 * Scores every entrant over every captured trading day of Kalshi's OPEN
 * political/election markets and writes data/contest/forward-2026/.
 *
 * OFFLINE AND DETERMINISTIC. This script reads only committed captures — the
 * daily panels, the open-market universe, the series registry, the poll layer
 * and the cross-layer snapshots — and writes the whole season from scratch on
 * every run. Re-running a day cannot double-count a fill, and the same captures
 * always produce the same leaderboard.
 *
 * Usage: node scripts/run-forward-contest.mjs [--quiet]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContestInputs, SEASON } from '../src/contest/forward-universe.js';
import { runForwardStrategy, STARTING_CAPITAL, MIN_TRADING_DAYS_TO_RANK, FILL_CAP_OF_DAY_VOLUME, FILL_CAP_OF_OPEN_INTEREST, DAILY_DEPLOYMENT_OF_EQUITY, feeProvenance } from '../src/contest/forward-engine.js';
import { FORWARD_FIELD, buildSignals, isoDate, EXCLUDED_FROM_FORWARD_FIELD, TRANSFERRED_FROM_2024 } from '../src/contest/strategies-forward.js';
import { registerSeriesFees, seriesFeeConfig } from '../src/fees.js';
import { candidateMismatch } from '../src/poll-layer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/contest/forward-2026');
const QUIET = process.argv.includes('--quiet');
const log = (...a) => { if (!QUIET) console.log('[contest-2026]', ...a); };

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const readJsonIfExists = (rel) => (existsSync(join(ROOT, rel)) ? readJson(rel) : null);

// ---------------------------------------------------------------------------
// 2. Series registry + fee configuration
// ---------------------------------------------------------------------------
function registerFees() {
  const reg = readJsonIfExists('data/kalshi/universe/series.json');
  const series = (reg && reg.series) || [];
  let captured = 0;
  for (const s of series) {
    if (s && s.ticker && typeof s.fee_multiplier === 'number') {
      registerSeriesFees({ [s.ticker]: { multiplier: s.fee_multiplier, type: s.fee_type || 'quadratic' } });
      captured += 1;
    }
  }
  return { total: series.length, captured, assumed: series.length - captured };
}

// ---------------------------------------------------------------------------
// 3. Signals, gated for look-ahead and identity
// ---------------------------------------------------------------------------
function buildSignalLedger({ pollLayer, crossLayer, universeDoc }) {
  // The repository's canonical candidate-identity check, applied to every poll
  // row that names a Kalshi market. Its refusals are passed into buildSignals so
  // the site and the contest can never disagree about which polls are comparable.
  const marketIdentity = new Map();
  const subTitles = new Map();
  for (const ev of (universeDoc && universeDoc.events) || []) {
    for (const m of ev.markets || []) subTitles.set(m.ticker, m.yes_sub_title || null);
  }
  // FAIL LOUDLY. With no sub-titles every poll row would pass the in-module
  // identity gate, admitting markets that resolve on a different person or on a
  // party — a silent correctness failure, not a degraded run. (This guard exists
  // because exactly that happened once: a refactor dropped the universe document
  // from the loader and the gate went quiet instead of failing.)
  if (subTitles.size === 0) {
    throw new Error('universe document carries no market sub-titles: the poll identity gate would be silently disabled');
  }
  for (const row of (pollLayer && pollLayer.stateRaces) || []) {
    if (!row.kalshiDemTicker) continue;
    const reason = candidateMismatch(row, universeDoc);
    if (reason) marketIdentity.set(row.id, reason);
  }
  // Give each poll row the market's captured sub-title so the in-module gate can
  // also refuse a row the canonical check cannot decide.
  const racesWithSub = {
    ...pollLayer,
    stateRaces: (pollLayer && pollLayer.stateRaces || []).map((r) => ({ ...r, marketSubTitle: subTitles.has(r.kalshiDemTicker) ? subTitles.get(r.kalshiDemTicker) : undefined })),
  };
  const snapshots = (crossLayer && crossLayer.snapshots) || [];
  return { signals: buildSignals({ pollLayer: racesWithSub, crossLayerRows: snapshots, marketIdentity }), subTitles };
}

/**
 * A signal captured on UTC date D is first usable on a LATER captured day.
 * Nothing in this season can be traded on same-day information, because the
 * candidate would have had to see a report published after the price it pays.
 */
function signalsByDate({ signals, dates }) {
  const out = {};
  for (const date of dates) {
    out[date] = {
      pollRaces: signals.pollRaces.filter((r) => r.asOf && r.asOf < date),
      polls: { ratings: signals.polls.ratings.filter((r) => r.asOf && r.asOf < date) },
      crossLayer: signals.crossLayer.filter((r) => r.asOf && r.asOf < date),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Score the season
// ---------------------------------------------------------------------------
const fees = registerFees();
log(`registered ${fees.captured} captured series fee configs from the series registry`);

const inputs = loadContestInputs(ROOT);
const { latest, universe, settlements, settlementCount, seriesFlags } = inputs;
log(`capture joins: ${inputs.metadata.originNote}; ${seriesFlags.usElection.size} US-election series tagged`);
log(`captured trading days: ${universe.dates.length} (${universe.dates[0]} .. ${universe.dates[universe.dates.length - 1]})`);

const pollLayer = readJsonIfExists('data/polls/poll-layer-2026.json');
const crossLayer = readJsonIfExists('data/crosslayer/snapshots.json');
const { signals } = buildSignalLedger({ pollLayer, crossLayer, universeDoc: latest });
log(`signal ledger: ${signals.pollRaces.length} poll rows admitted of ${signals.pollGate.considered}; ${signals.pollRaces.filter((r) => r.asOf < universe.dates[universe.dates.length - 1]).length} usable before the last captured day`);

log(`settlement results on file: ${settlementCount}`);

const perDateSignals = signalsByDate({ signals, dates: universe.dates });
// The exclusion tally must be the SUM OF THE PER-DAY COUNTS, not the number of
// rows in the bounded sample — otherwise the published tally silently means
// "rows we looked at" while the artifact's own per-date table says something
// else, and the two disagree by an order of magnitude.
const exclusionReasonTally = {};
for (const [, counts] of Object.entries(universe.perDate)) {
  for (const [k, v] of Object.entries(counts)) {
    if (k === 'panelRows' || k === 'eligible' || k === 'tradedOnDay') continue;
    exclusionReasonTally[k] = (exclusionReasonTally[k] || 0) + v;
  }
}

const results = [];
const attributions = [];
for (const strategy of FORWARD_FIELD) {
  const { result, attribution } = runForwardStrategy({
    strategy, universe, settlements, origin: strategy.origin || 'new-2026',
    signalsByDate: perDateSignals, pollGate: signals.pollGate, ratingsGate: signals.ratingsGate,
  });
  results.push(result);
  attributions.push({ username: result.username, ...attribution });
}

const ranked = results.filter((r) => r.ranked).sort((a, b) => b.netEquity - a.netEquity);
ranked.forEach((r, i) => { r.rank = i + 1; });
const unranked = results.filter((r) => !r.ranked).map((r) => ({ username: r.username, strategy: r.name, origin: r.origin, netEquity: r.netEquity, netReturnPct: r.netReturnPct, trades: r.trades, reason: r.unrankedReason }));

const identityCheck = {
  checked: results.map((r) => ({ username: r.username, holds: r.accountingIdentityHolds, legs: r.identityLegs })),
  allHold: results.every((r) => r.accountingIdentityHolds),
};
log(`accounting identity holds for all entrants: ${identityCheck.allHold}`);

// ---------------------------------------------------------------------------
// 5. Artifacts
// ---------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const asOf = new Date().toISOString();
const lastDay = universe.dates[universe.dates.length - 1];
const seasonDays = universe.dates.length;

const model = {
  seasonId: SEASON.id,
  startingCapitalPerEntrant: STARTING_CAPITAL,
  minTradingDaysToRank: MIN_TRADING_DAYS_TO_RANK,
  electionDay: SEASON.electionDay,
  closesBy: SEASON.closesBy,
  ranking: `Ranked by NET EQUITY at the last captured book = ${STARTING_CAPITAL} + realized P&L + unrealized P&L. The Leap ranks on realized P&L with all open positions auto-closed at the end; a live season on unsettled markets must mark the open book, so this is an ADAPTATION and every published figure is labelled mark-to-market until the exchange settles the market. When every position has settled the two definitions agree.`,
  execution: `Taker-only against the captured book: a BUY YES pays that day's yes_ask; a BUY NO pays 1 - that day's yes_bid; exits cross the other way. A market can only fill on a day it actually traded (volume_24h > 0) and only if the day's book was two-sided. No maker fill is ever claimed, because the captured data cannot show queue position.`,
  marks: 'A position is marked at the captured midpoint of yes_bid/yes_ask. When the captured book is one-sided or crossed there is NO midpoint: the position keeps its last known mark and the carry is recorded as carriedMark=true. No price is ever interpolated or invented.',
  accountingIdentity: 'netEquity = startingCapital + realizedPnl + unrealizedPnl',
  fillCapOfDayVolume: FILL_CAP_OF_DAY_VOLUME,
  fillCapOfOpenInterest: FILL_CAP_OF_OPEN_INTEREST,
  dailyDeploymentOfEquity: DAILY_DEPLOYMENT_OF_EQUITY,
  dailyDeploymentNote: `ADAPTATION (not a Leap rule): an entrant may put at most ${DAILY_DEPLOYMENT_OF_EQUITY * 100}% of start-of-day equity into NEW positions on one captured day. Without it, a strategy that wants 25% of equity in every one of ~1,000 markets would spend the whole bankroll on whichever markets the loop happened to reach first, and the leaderboard would measure ticker ordering. When the day's orders exceed the budget every order is scaled pro-rata, so the allocation is order-independent.`,
  feeProvenance: feeProvenance(fees),
  leapSource: 'https://www.tradingview.com/the-leap/february-2026-eurex/rules/',
  leapLeaderboardSource: 'https://www.tradingview.com/the-leap/crypto-series-may-2026/',
  bankrollDerivation: 'The Leap\'s leaderboard prints realized profit in dollars and in percent; 271,783.86 / 2.7178 = 100,001.42 and four further top rows agree to within $3. The rules page does not print a balance, so the $100,000 is DERIVED from the leaderboard, not quoted from the rules.',
  lookAhead: 'A signal captured on UTC date D is first usable on a LATER captured day, because the price it would pay was captured before the signal existed. The poll layer as captured (2026-09-21T22:53Z) postdates every price panel in this seed, so poll-anchor-26 and ratings-ratchet place no orders until the next capture.',
  seasonWindow: `A market is only eligible if its close_time is on or before ${SEASON.closesBy} — the season trades the 2026 cycle. A 2028 Senate market is collected and published in the market list, but pricing it against a days-to-election clock would be meaningless.`,
};

const universeArtifact = {
  capturedFrom: 'data/kalshi/tracker/daily/*.csv (captured price panels) + data/kalshi/universe/latest.json + data/kalshi/forward/universe-open.json',
  capturedAt: asOf,
  dates: universe.dates,
  perDate: universe.perDate,
  rejectionReasons: universe.rejectionReasons,
  exclusionReasonTally,
  exclusionTallyNote: 'Sums of the per-date counts above, one row per excluded market-day. A market present on three captured days and ineligible on all three is counted three times, because each day it occupied a slot the contest could otherwise have filled.',
  seriesCoverage: universe.seriesCoverage,
  distinctTickers: universe.tickerCount,
  definition: universe.definition,
};

const leaderboard = {
  capturedFrom: 'data/contest/forward-2026/season.json',
  capturedAt: asOf,
  seasonId: SEASON.id,
  asOf: lastDay,
  rankedAsOfNote: `MARK-TO-MARKET SNAPSHOT at the ${lastDay} capture — NOT a final result. No 2026 market in this season has settled; a position the exchange settles is closed at the captured official value and nothing else is closed at all.`,
  leaderboard: ranked.map((r) => ({
    rank: r.rank, username: r.username, strategy: r.name, origin: r.origin,
    netEquity: r.netEquity, netReturnPct: r.netReturnPct, realizedPnl: r.realizedPnl, unrealizedPnl: r.unrealizedPnl,
    feesPaid: r.feesPaid, trades: r.trades, tradingDays: r.tradingDays, marketsTraded: r.marketsTraded, openPositions: r.openPositions,
  })),
  unranked,
  model,
  field: { entrants: FORWARD_FIELD.length, transferredFrom2024: TRANSFERRED_FROM_2024.length, newFor2026: FORWARD_FIELD.length - TRANSFERRED_FROM_2024.length, entryPolicy: FORWARD_FIELD.map((s) => ({ username: s.username, name: s.name, origin: s.origin || 'new-2026', adapts: s.adapts || null })) },
  signals: { pollLedger: signals.pollGate, ratingsLedger: signals.ratingsGate },
  identityCheck,
};

// The published season strips the full per-fill log for the 12 entrants only
// when it would be large; the log IS the audit trail, so it is kept whole here
// and the leaderboard/attribution carry the summaries.
const season = {
  capturedFrom: 'data/kalshi/tracker/daily/*.csv + data/kalshi/universe/latest.json + data/kalshi/forward/universe-open.json + data/polls/poll-layer-2026.json + data/crosslayer/snapshots.json + data/kalshi/tracker/settlements.json (all read offline; the runner makes no network calls)',
  capturedAt: asOf,
  capturedBy: 'scripts/run-forward-contest.mjs',
  model,
  openedOn: SEASON.openedOn,
  lastCapturedDay: lastDay,
  capturedTradingDays: seasonDays,
  electionDay: SEASON.electionDay,
  status: seasonDays < MIN_TRADING_DAYS_TO_RANK
    ? `The season has captured ${seasonDays} day(s); The Leap requires ${MIN_TRADING_DAYS_TO_RANK} active trading days to be ranked. No entrant is ranked yet.`
    : `The season has captured ${seasonDays} day(s) and ${ranked.length} of ${FORWARD_FIELD.length} entrants have met the ${MIN_TRADING_DAYS_TO_RANK}-day minimum.`,
  field: leaderboard.field,
  excludedFromField: EXCLUDED_FROM_FORWARD_FIELD,
  signals: { pollLayer: { ...signals.pollGate, ratingsGate: signals.ratingsGate, ratingsBandsLabel: signals.ratingsBandsLabel }, crossLayerRows: signals.crossLayer.length, k: signals.k },
  universe: { dates: universe.dates, perDate: universe.perDate, distinctTickers: universe.tickerCount, rejectionReasons: universe.rejectionReasons, seriesCoverage: universe.seriesCoverage },
  identityCheck,
  results,
  unranked,
};

writeFileSync(join(OUT, 'season.json'), JSON.stringify(season, null, 2) + '\n');
writeFileSync(join(OUT, 'universe.json'), JSON.stringify(universeArtifact, null, 2) + '\n');
writeFileSync(join(OUT, 'leaderboard.json'), JSON.stringify(leaderboard, null, 2) + '\n');
writeFileSync(join(OUT, 'attribution.json'), JSON.stringify({
  capturedFrom: 'data/contest/forward-2026/season.json',
  capturedAt: asOf,
  method: 'Per-series and per-market decomposition of each entrant\'s P&L. realizedPnl charges an entry fee on the day it is paid and adds the closed lot\'s P&L on exit/settlement; unrealizedPnl values the open book at the last mark minus what was paid for it (the entry fee is NOT subtracted twice). bySeries sums exactly to the entrant\'s netEquity - startingCapital, and the run fails that assertion loudly rather than publishing a table that does not add up.',
  attribution: attributions,
}, null, 2) + '\n');

const leaderboardCsv = [
  'username,strategy,origin,rank,net_equity,net_return_pct,realized_pnl,unrealized_pnl,fees_paid,trades,trading_days,markets_traded,open_positions',
  ...results.map((r) => [r.username, r.name, r.origin, r.rank || '', r.netEquity, r.netReturnPct, r.realizedPnl, r.unrealizedPnl, r.feesPaid, r.trades, r.tradingDays, r.marketsTraded, r.openPositions].join(',')),
].join('\n') + '\n';
writeFileSync(join(OUT, 'leaderboard.csv'), leaderboardCsv);

const equityCsv = ['date,username,net_equity,cash,open_value,open_positions,entries_that_day',
  ...results.flatMap((r) => r.equityCurve.map((p) => [p.date, r.username, p.netEquity, p.cash, p.openValue, p.openPositions, p.entriesToday].join(',')))].join('\n') + '\n';
writeFileSync(join(OUT, 'equity.csv'), equityCsv);

// Fills: the audit trail. One row per fill so a reader can replay any entrant.
const fillCsv = ['date,username,ticker,series,action,side,shares,price,fee,pnl,executed_at,fill_cap_applied',
  ...results.flatMap((r) => (r.fillLog || []).map((f) => [f.date, r.username, f.ticker, f.series || '', f.action, f.side, f.shares, f.price, f.fee, f.pnl === undefined ? '' : f.pnl, f.executedAt || '', f.fillCapApplied === true ? 'yes' : f.fillCapApplied === false ? 'no' : ''].map((v) => String(v).includes(',') ? `"${v}"` : v).join(',')))].join('\n') + '\n';
writeFileSync(join(OUT, 'fills.csv'), fillCsv);

// Signal ledger: every admitted signal against every captured day, with the
// verdict, so a reader can see what the entrant knew and when it knew it.
const ledger = ['date,kind,key,detail,value,usable_that_day,note'];
for (const date of universe.dates) {
  for (const r of signals.pollRaces) ledger.push([date, 'poll', r.id, `${r.race} ${r.pollster}`, r.pollProb, r.asOf < date ? 'yes' : 'no', `margin ${r.margin}pp -> logistic k=${signals.k}; ticket ${r.kalshiTicker}`].join(','));
  for (const r of signals.polls.ratings) ledger.push([date, 'rating', r.state, `${r.cook} / ${r.inside}`, `${r.bandLow}-${r.bandHigh}`, r.asOf < date ? 'yes' : 'no', `ticket ${r.kalshiTicker}`].join(','));
  for (const r of signals.crossLayer) ledger.push([date, 'crosslayer', r.question, `${r.crowdLayer} ${r.crowdProb}`, r.crowdProb, r.asOf < date ? 'yes' : 'no', `ticket ${r.kalshiTicker} snapshotMid ${r.kalshiSnapshotMid}`].join(','));
}
writeFileSync(join(OUT, 'signals-ledger.csv'), ledger.join('\n') + '\n');

log(`season written: ${FORWARD_FIELD.length} entrants, ${TRANSFERRED_FROM_2024.length} transferred + ${FORWARD_FIELD.length - TRANSFERRED_FROM_2024.length} new`);
for (const r of ranked) log(`  #${r.rank} ${r.username} (${r.origin}) $${r.netEquity} (${r.netReturnPct.toFixed(6)}%) trades=${r.trades} open=${r.openPositions}`);
for (const r of unranked) log(`  unranked ${r.username}: ${r.reason}`);
log(`artifacts: ${['season.json', 'universe.json', 'leaderboard.json', 'leaderboard.csv', 'equity.csv', 'fills.csv', 'signals-ledger.csv', 'attribution.json'].join(', ')}`);
