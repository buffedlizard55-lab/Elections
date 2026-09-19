/**
 * Elections — shared Kalshi public-API client (read-only, no API key)
 * =====================================================================
 * Used by the collectors (scripts/collect-kalshi.mjs, scripts/collect-senate-2024.mjs).
 * Everything here is documented on docs.kalshi.com (fetched 2026-09-19):
 *   - base URLs: https://docs.kalshi.com/getting_started/api_environments
 *     ("https://api.elections.kalshi.com/trade-api/v2" = production shared
 *      API server, also supported; "https://external-api.kalshi.com/trade-api/v2"
 *      = production trade API server)
 *   - GET /markets     https://docs.kalshi.com/api-reference/market/get-markets
 *       limit <= 1000; status in {unopened, open, paused, closed, settled};
 *       tickers = comma-separated list; mve_filter=exclude drops combos.
 *   - GET /events      https://docs.kalshi.com/api-reference/events/get-events
 *       limit <= 200; status in {unopened, open, closed, settled};
 *       with_nested_markets=true embeds Market objects; excludes multivariate events.
 *   - GET /series      https://docs.kalshi.com/api-reference/market/get-series-list
 *       category = exact, case-sensitive match against the series' `categories` list.
 *   - candlesticks     https://docs.kalshi.com/api-reference/market/get-market-candlesticks
 *       period_interval in {1, 60, 1440}; end_ts inclusive ("ending on or before").
 *   - rate limits      https://docs.kalshi.com/getting_started/rate_limits
 *       429 has no Retry-After header -> exponential backoff.
 *
 * Fixed-point fields: the API now returns dollar strings ("0.7800") and
 * fixed-point counts ("132910.00"). The repo's 2024 bar layout is integer
 * cents (see src/kalshi-data.js); normalizeBar() converts to that layout and
 * records whether a sub-cent price had to be kept fractional.
 */

export const API_BASE = process.env.KALSHI_API_BASE || 'https://api.elections.kalshi.com/trade-api/v2';

const MIN_INTERVAL_MS = Number(process.env.KALSHI_MIN_INTERVAL_MS || 120); // ~8 req/s (Basic read budget is 20/s)
let lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const stats = { requests: 0, retries: 0, bytes: 0 };

/** GET a JSON document from the API with pacing + exponential backoff (429/5xx/network). */
export async function getJson(path, { retries = 5, timeoutMs = 45000, base = API_BASE } = {}) {
  const url = path.startsWith('http') ? path : base + path;
  let attempt = 0;
  for (;;) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    stats.requests += 1;
    let res;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Elections-research-collector/2.0 (+https://github.com/buffedlizard55-lab/Elections)' }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (attempt >= retries) throw new Error(`${url} -> ${e.name}: ${e.message}`);
      attempt += 1; stats.retries += 1;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= retries) throw new Error(`${url} -> HTTP ${res.status} after ${attempt} retries`);
      attempt += 1; stats.retries += 1;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    const text = await res.text();
    stats.bytes += text.length;
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`${url} -> invalid JSON (${e.message})`);
    }
  }
}

/**
 * Paginate a cursor-based list endpoint.
 * @param {string} path      e.g. '/events?status=open&limit=200'
 * @param {string} key       response array key ('events' | 'markets' | 'candlesticks')
 * @param {object} [opts]    { maxPages }
 * @returns {Promise<{items: Array, pages: number}>}
 */
export async function paginate(path, key, { maxPages = 500, onPage = null } = {}) {
  const items = [];
  let cursor = '';
  let pages = 0;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const page = await getJson(cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path);
    pages += 1;
    const batch = page[key] || [];
    items.push(...batch);
    if (onPage) onPage(pages, batch.length);
    cursor = page.cursor || '';
    if (pages >= maxPages) throw new Error(`pagination of ${path} exceeded ${maxPages} pages — refusing to continue (safety cap)`);
  } while (cursor);
  return { items, pages };
}

/** "0.7800" -> 0.78 ; "" / null / undefined -> null. */
export function num(s) {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Dollar string -> integer cents when the value is a whole cent, else the
 * exact fractional cent value (sub-cent price levels exist on some series).
 */
export function dollarsToCents(s) {
  const d = num(s);
  if (d === null) return null;
  const c = d * 100;
  const r = Math.round(c);
  return Math.abs(c - r) < 1e-6 ? r : Number(c.toFixed(4));
}

/** Dollar string -> integer (dollars x 10000) used for the `price.mean` slot. */
export function dollarsToTenThousandths(s) {
  const d = num(s);
  if (d === null) return null;
  return Math.round(d * 10000);
}

function pick(obj, ...keys) {
  for (const k of keys) if (obj && obj[k] !== undefined) return obj[k];
  return undefined;
}

/**
 * Normalize an API candlestick (either the `*_dollars`/`*_fp` shape from the
 * live endpoint docs or the plain shape returned by /historical/markets/{t}/candlesticks)
 * into the repo's 17-field integer-cents bar layout (see src/kalshi-data.js header):
 *   [end_period_ts, volume, p.open, p.high, p.low, p.close, p.mean(x10000), p.previous,
 *    bid.open, bid.high, bid.low, bid.close, ask.open, ask.high, ask.low, ask.close, open_interest]
 */
export function normalizeBar(c) {
  const p = c.price || {};
  const b = c.yes_bid || {};
  const a = c.yes_ask || {};
  const cents = (o, k) => dollarsToCents(pick(o, `${k}_dollars`, k));
  const count = (v) => { const n = num(v); return n === null ? 0 : Math.round(n); };
  return [
    Number(c.end_period_ts),
    count(pick(c, 'volume_fp', 'volume')),
    cents(p, 'open'), cents(p, 'high'), cents(p, 'low'), cents(p, 'close'),
    dollarsToTenThousandths(pick(p, 'mean_dollars', 'mean')),
    cents(p, 'previous'),
    cents(b, 'open'), cents(b, 'high'), cents(b, 'low'), cents(b, 'close'),
    cents(a, 'open'), cents(a, 'high'), cents(a, 'low'), cents(a, 'close'),
    count(pick(c, 'open_interest_fp', 'open_interest')),
  ];
}

/** Compact projection of a Market object for the daily tracker (prices in dollars). */
export function compactMarket(m, extra = {}) {
  return {
    ticker: m.ticker,
    event_ticker: m.event_ticker,
    title: m.title,
    yes_sub_title: m.yes_sub_title || '',
    status: m.status,
    open_time: m.open_time,
    close_time: m.close_time,
    yes_bid: num(m.yes_bid_dollars),
    yes_ask: num(m.yes_ask_dollars),
    last_price: num(m.last_price_dollars),
    volume: num(m.volume_fp),
    volume_24h: num(m.volume_24h_fp),
    open_interest: num(m.open_interest_fp),
    liquidity: num(m.liquidity_dollars),
    result: m.result || '',
    ...extra,
  };
}

/**
 * Implied YES probability from a compact market row: order-book midpoint when a
 * two-sided book exists (spread <= 10c), else the last trade price when > 0,
 * else null. Irregularity #2 (stale last_price) is why the book comes first.
 */
export function impliedProb(row) {
  const { yes_bid: bid, yes_ask: ask, last_price: last } = row;
  if (bid !== null && ask !== null && bid > 0 && ask < 1 && ask >= bid && ask - bid <= 0.10) return { p: (bid + ask) / 2, basis: 'mid' };
  if (last !== null && last > 0 && last < 1) return { p: last, basis: 'last' };
  return { p: null, basis: 'none' };
}

/** Minimal RFC-4180 CSV helpers (titles contain commas and quotes). */
export function toCsv(rows, columns) {
  const q = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => q(r[c])).join(','))].join('\n') + '\n';
}

export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
}
