/**
 * Elections — Live 2026 contest universe (ROADMAP R16)
 * =====================================================================
 * Builds the *tradable* universe for the forward paper-trading season from
 * files that are already committed. Nothing here fetches, and nothing here
 * invents a market: a ticker can only enter a day's universe if it appears in
 * that day's captured panel.
 *
 * Sources, in order of precedence for the ticker -> series join:
 *   1. data/kalshi/forward/universe-open.json  (per-market: series, sub, close_time)
 *   2. data/kalshi/universe/latest.json        (events carry series_ticker + us_election)
 *   3. the ticker prefix itself                (recorded as a weak origin)
 * A market whose series can only be guessed from the prefix is still tradable,
 * but the run reports how many rows came from each origin so a reader can tell
 * how much of the universe rests on the weakest join.
 *
 * SEASON WINDOW. The season trades the 2026 cycle: a market is only eligible if
 * its close_time falls inside the season window. A 2028 Senate market is open
 * today and is in the collected list, but its settlement is years away and
 * pricing it against a days-to-election clock would be meaningless. Those rows
 * are excluded with the reason `closes-after-season-window`, not silently.
 */

export const SEASON = Object.freeze({
  id: 'S1-2026',
  openedOn: '2026-09-19',
  electionDay: '2026-11-03',
  // Inclusive upper bound on close_time for a market to be part of this season.
  //
  // WHAT close_time ACTUALLY IS (verified against the capture, irregularity
  // #78): it is the exchange's listing-expiry field, NOT the date the market
  // resolves. The 2026 Alaska Senate market SENATEAK-26-D carries
  // close_time 2027-11-03 — a year after the election it is about — while the
  // control markets carry 2027-02-01, which is their real determination date
  // (party of the President pro tempore / Speaker, rule text in #72). So the
  // bound is a CYCLE SCOPE, not a settlement clock: it admits exactly the
  // 2026-cycle rows (close years 2026-2027) and excludes the 2028-cycle ones
  // that are open today (CONTROLH-2028-*, KXPRESNOMD-28, ECMOV-28NOV07...).
  // Settlement is decided ONLY by a captured official result, never by this
  // field, so a wrong close_time can mis-scope the universe but can never
  // settle a position.
  closesBy: '2027-12-31T23:59:59Z',
});

const round6 = (x) => Math.round(x * 1e6) / 1e6;

/** Parse a captured daily panel row into numbers; null where the field is blank or unusable. */
function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * A price is usable only when it is a real probability: strictly inside (0,1).
 * A captured 0.0000 ask or a 1.0000 bid is not a tradeable quote.
 */
function usablePrice(v) {
  const n = num(v);
  return n !== null && n > 0 && n < 1 ? n : null;
}

export function parsePanelRow(row) {
  const bid = usablePrice(row.yes_bid);
  const ask = usablePrice(row.yes_ask);
  const last = usablePrice(row.last_price);
  const twoSided = bid !== null && ask !== null && ask > bid;
  // The mid is the mark. When the book is one-sided or crossed we refuse to
  // invent a midpoint — the row is marked with the last trade instead and
  // flagged, so no artifact can present a fabricated quote as an observation.
  const mid = twoSided ? round6((bid + ask) / 2) : null;
  const volume24h = num(row.volume_24h);
  const openInterest = num(row.open_interest);
  return {
    ticker: row.ticker,
    date: row.date,
    yesBid: bid,
    yesAsk: ask,
    last,
    mid,
    twoSided,
    volume: num(row.volume),
    volume24h,
    openInterest,
    closeTime: row.close_time || null,
    status: row.status || null,
    // A market "traded today" when contracts actually changed hands in the
    // last 24h. A posted bid/ask alone is not trading.
    tradedToday: (volume24h || 0) > 0,
  };
}

/**
 * The index the contest uses to answer "is this ticker a US-election market,
 * and which series does it belong to?".
 */
export function buildTickerIndex({ latest, openUniverse }) {
  const byTicker = new Map();
  const usElectionSeries = new Set();
  const origin = { openUniverse: 0, latest: 0 };
  const provenance = [];

  for (const ev of (latest && latest.events) || []) {
    if (ev.us_election) usElectionSeries.add(ev.series_ticker);
    for (const m of ev.markets || []) {
      if (!byTicker.has(m.ticker)) {
        byTicker.set(m.ticker, { series: ev.series_ticker, sub: m.yes_sub_title || null, closeTime: m.close_time || null, origin: 'latest.json' });
        origin.latest += 1;
      }
    }
  }
  for (const m of (openUniverse && openUniverse.markets) || []) {
    const prev = byTicker.get(m.ticker);
    // universe-open.json is the purpose-built per-market snapshot, so it wins
    // the series join even when latest.json saw the ticker first.
    byTicker.set(m.ticker, {
      series: m.series || (prev && prev.series) || null,
      sub: m.sub || (prev && prev.sub) || null,
      closeTime: m.close_time || (prev && prev.closeTime) || null,
      origin: 'universe-open.json',
    });
    if (prev && prev.origin === 'latest.json') origin.latest -= 1;
    origin.openUniverse += 1;
  }
  // The prefix fallback is recorded as its own origin so the run can report how
  // much of the universe rests on it. It is only consulted at lookup time so it
  // can never overwrite a captured join.
  provenance.push(`series join: ${origin.openUniverse} market(s) from forward/universe-open.json, ${origin.latest} from universe/latest.json`);

  return { byTicker, usElectionSeries, origin, originNote: provenance.join('; ') };
}

/** Series for a ticker: the captured join if present, else the documented prefix guess. */
export function seriesOf(index, ticker) {
  const hit = index.byTicker.get(ticker);
  if (hit && hit.series) return { series: hit.series, fromPrefix: false };
  const prefix = String(ticker).split('-')[0];
  return { series: prefix, fromPrefix: true };
}

/**
 * Is this ticker inside the season window?
 * close_time is an ISO string; a missing close_time is NOT treated as in-window.
 */
export function withinSeasonWindow(closeTime, closesBy = SEASON.closesBy) {
  if (!closeTime) return false;
  return closeTime <= closesBy;
}

/**
 * Build the contest universe for every captured day.
 *
 * @returns {{
 *   dates: string[],
 *   panel: Record<string, Record<string, object>>,   // date -> ticker -> parsed row
 *   eligible: Record<string, Map<string, object>>,   // date -> ticker -> { series, row }
 *   perDate: Record<string, object>,
 *   rejectionReasons: Record<string, number>,
 *   seriesCoverage: { total: number, usElection: number, fromPrefix: number },
 * }}
 */
export function buildContestUniverse({ panelRows, index }) {
  const panel = {};
  for (const r of panelRows) {
    if (!r || !r.ticker || !r.date) continue;
    (panel[r.date] || (panel[r.date] = {}))[r.ticker] = parsePanelRow(r);
  }
  const dates = Object.keys(panel).sort();

  const eligible = {};
  const perDate = {};
  const rejectionReasons = {};
  const distinctTickers = new Set();
  const distinctSeries = new Set();
  let usElectionRows = 0;
  let prefixRows = 0;

  const bump = (k) => { rejectionReasons[k] = (rejectionReasons[k] || 0) + 1; };

  for (const date of dates) {
    const map = new Map();
    let notElection = 0;
    let noBook = 0;
    let closesAfter = 0;
    let eligibleRows = 0;
    let traded = 0;

    for (const [ticker, row] of Object.entries(panel[date])) {
      const { series, fromPrefix } = seriesOf(index, ticker);
      const meta = index.byTicker.get(ticker);
      // One predicate, one place: the series must be US-election tagged in the
      // captured universe. The prefix fallback only affects WHICH series a
      // ticker maps to, never whether the tag applies.
      if (!index.usElectionSeries.has(series)) { notElection += 1; bump('not-us-election-series'); continue; }
      usElectionRows += 1;
      if (fromPrefix) prefixRows += 1;

      if (!withinSeasonWindow(row.closeTime || (meta && meta.closeTime))) {
        closesAfter += 1; bump('closes-after-season-window'); continue;
      }
      if (!row.twoSided) { noBook += 1; bump('book-not-two-sided-at-capture'); continue; }

      map.set(ticker, { series, fromPrefix, row, sub: (meta && meta.sub) || null });
      eligibleRows += 1;
      distinctTickers.add(ticker);
      distinctSeries.add(series);
      if (row.tradedToday) traded += 1;
    }
    eligible[date] = map;
    perDate[date] = { panelRows: Object.keys(panel[date]).length, notElectionSeries: notElection, notInSeasonWindow: closesAfter, noUsableBook: noBook, eligible: eligibleRows, tradedOnDay: traded };
  }

  return {
    dates,
    panel,
    eligible,
    perDate,
    rejectionReasons,
    seriesCoverage: { distinctSeries: distinctSeries.size, distinctTickers: distinctTickers.size, seriesResolvedFromTickerPrefix: prefixRows, rowsPassingSeriesTag: usElectionRows },
    tickerCount: distinctTickers.size,
    definition:
      'A market/day is contest-eligible when its series is US-election tagged in the captured universe, it appears in that day\'s captured panel, ' +
      `its yes_bid/yes_ask form a real two-sided book, and its close_time is on or before ${SEASON.closesBy}. ` +
      'NOTE: close_time is the exchange\'s listing-expiry field, not the resolution date (SENATEAK-26-D, a 2026 race, carries 2027-11-03), so the bound scopes the 2026 cycle rather than dating a settlement. ' +
      'A market can only be FILLED on a day it actually traded (volume_24h > 0); the eligible count is the quoting set, the traded count is the fillable set.',
  };
}

// ---------------------------------------------------------------------------
// Capture loaders — the ONE place a script reads the contest's input files.
// ---------------------------------------------------------------------------
// `scripts/run-forward-contest.mjs` (which scores the season) and
// `scripts/build-market-list.mjs` (which publishes the full open-market list and
// reconciles it against the collectors' audit counters) must see byte-identical
// inputs, or the two artifacts will disagree about the same universe. Keeping
// the readers here means a change to a captured file format has exactly one
// place to be fixed, and both artifacts move together — an earlier duplication
// of the CSV reader let the two drift apart and silently broke one of them.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const readJsonAt = (root, rel) => (existsSync(join(root, rel)) ? JSON.parse(readFileSync(join(root, rel), 'utf8')) : null);

/** US-election-tagged series from the collected series registry. */
export function loadSeriesFlags(root) {
  const reg = readJsonAt(root, 'data/kalshi/universe/series.json');
  const series = (reg && reg.series) || [];
  const usElection = new Set();
  for (const s of series) if (s && s.ticker && s.us_election) usElection.add(s.ticker);
  return { count: (reg && reg.count) || series.length, usElection, series, note: (reg && reg.capturedFrom) || null };
}

/**
 * Per-ticker metadata joined from the two captured universe files, in the same
 * precedence order as `buildTickerIndex`.
 */
export function loadMarketMetadata(root) {
  const latest = readJsonAt(root, 'data/kalshi/universe/latest.json');
  const openUniverse = readJsonAt(root, 'data/kalshi/forward/universe-open.json');
  const index = buildTickerIndex({ latest, openUniverse });
  const byTicker = new Map();
  for (const [ticker, m] of index.byTicker) {
    byTicker.set(ticker, {
      series: m.series,
      sub: m.sub,
      yesSubTitle: m.sub,
      closeTime: m.closeTime,
      origin: m.origin,
      eventUsElection: index.usElectionSeries.has(m.series),
      // The prefix fallback is only ever consulted at lookup time, never stored
      // as a captured join, so this flag stays false for every indexed ticker.
      seriesFromPrefix: false,
    });
  }
  return { byTicker, usElectionSeries: index.usElectionSeries, origin: index.origin, originNote: index.originNote, latest, openUniverse };
}

/**
 * Every captured daily panel, as both raw rows (for `buildContestUniverse`) and
 * parsed records keyed date -> ticker (for the market-list report).
 */
export function loadForwardPanel(root) {
  const dir = join(root, 'data/kalshi/tracker/daily');
  const panel = {};
  const panelRows = [];
  const dates = [];
  if (!existsSync(dir)) return { dates, panelRows, panel };
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
  for (const f of files) {
    const date = f.slice(0, 10);
    dates.push(date);
    const text = readFileSync(join(dir, f), 'utf8').trim();
    const lines = text.split('\n');
    const header = lines[0].split(',');
    const ix = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      // The captured panels contain no quoted fields: the collector writes
      // yes_sub_title only into the forward file. A row whose field count does
      // not match the header is therefore malformed and is skipped rather than
      // guessed at.
      const c = line.split(',');
      if (c.length !== header.length) continue;
      const row = {
        date,
        ticker: c[ix.ticker],
        yes_bid: c[ix.yes_bid],
        yes_ask: c[ix.yes_ask],
        last_price: c[ix.last_price],
        volume: c[ix.volume],
        volume_24h: c[ix.volume_24h],
        open_interest: c[ix.open_interest],
        liquidity: c[ix.liquidity],
        close_time: c[ix.close_time],
        status: c[ix.status],
      };
      panelRows.push(row);
      (panel[date] || (panel[date] = {}))[row.ticker] = parsePanelRow(row);
    }
  }
  return { dates, panelRows, panel };
}

/**
 * Everything the season and the market list both read, loaded once.
 * Nothing here touches the network: a day that was never captured simply does
 * not exist for either artifact.
 */
export function loadContestInputs(root) {
  const metadata = loadMarketMetadata(root);
  const seriesFlags = loadSeriesFlags(root);
  const { dates, panelRows, panel } = loadForwardPanel(root);
  const universe = buildContestUniverse({ panelRows, index: metadata });
  const settlementsRaw = readJsonAt(root, 'data/kalshi/tracker/settlements.json');
  const settlements = {};
  // tracker/settlements.json stores a ticker -> market map. Both shapes are read
  // so a future collector change cannot silently zero the settlement feed — a
  // position only leaves the book on a captured OFFICIAL result, so a parse
  // failure here freezes the season rather than corrupting it.
  const settleRows = Array.isArray(settlementsRaw && settlementsRaw.markets)
    ? settlementsRaw.markets
    : Object.values((settlementsRaw && settlementsRaw.markets) || {});
  for (const s of settleRows) {
    const ticker = s.ticker || s.market_ticker;
    if (ticker && (s.result === 'yes' || s.result === 'no')) {
      // settlement_ts is an ISO string in the committed capture; an epoch number
      // is accepted too so a format change cannot throw the season out.
      const ts = s.settlement_ts;
      const settledAt = typeof ts === 'number' ? new Date(ts * 1000).toISOString() : (ts || s.settled_at || s.settledAt || null);
      settlements[ticker] = { result: s.result, settledAt, title: s.title || s.yes_sub_title || null };
    }
  }
  return {
    dates, panelRows, panel, metadata, seriesFlags, universe, settlements,
    settlementCount: Object.keys(settlements).length,
    // The captured universe document itself: the poll identity gate matches a
    // poll's candidate against the market's captured yes_sub_title, so a caller
    // that loses this loses the gate. Kept here rather than re-read by each
    // script so the two artifacts cannot disagree about the same capture.
    latest: metadata.latest,
    openUniverse: metadata.openUniverse,
  };
}

export { num, usablePrice, round6 };
