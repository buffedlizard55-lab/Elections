/**
 * Elections — Kalshi live-API client helpers (Node >= 18, zero dependencies).
 * =====================================================================
 * Used by the forward-collection scripts (ROADMAP R1/R2/R3) which run where
 * general internet is available (GitHub-hosted Actions runners, or a normal
 * local machine). Base URL is the official public production API host that
 * docs.kalshi.com lists (verified 2026-09-18, see data/sources/master.json
 * entry "kalshi").
 *
 * Endpoints used (all GET, no auth required for market data):
 *   /series                                  full series registry (cursor-paginated)
 *   /series/{ticker}                         fee config + settlement sources
 *   /markets?series_ticker=…[&status=open]   live tier (open + recently settled)
 *   /historical/markets?series_ticker=…      historical tier (settled before cutoff)
 *   /historical/cutoff                       live/historical tier boundary
 *   /historical/markets/{t}/candlesticks     daily bars (period_interval=1440)
 *   /series/{s}/markets/{t}/candlesticks     daily bars, live tier (fallback)
 *
 * Raw candlestick JSON shape (probed live 2026-09-19, PRES-2024-DJT):
 *   {end_period_ts, volume:"257284.00", open_interest:"151640.00",
 *    price:{open,high,low,close,mean,previous}, yes_bid:{open,high,low,close},
 *    yes_ask:{open,high,low,close}} — dollar strings, 4 decimal places.
 * normalizeBar() below converts that verbatim into the repo's documented
 * 17-field integer-cents layout (see the header of src/kalshi-data.js).
 */

export const API_BASE = process.env.KALSHI_API_BASE || 'https://api.elections.kalshi.com/trade-api/v2';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Global read-side token bucket (irregularity #82, 2026-09-22).
 * ---------------------------------------------------------------------
 * Kalshi bills a default GET at 10 tokens against a Basic-tier read budget of
 * 200 tokens/s = 20 requests/s sustained, with the bucket holding 3 seconds of
 * budget so an idle client may burst
 * (https://docs.kalshi.com/getting_started/rate_limits.md, read 2026-09-22).
 * 429s carry no Retry-After and no X-RateLimit-* headers, so a client cannot
 * discover the ceiling by observation — it has to be enforced locally.
 *
 * Per-call `await sleep(80)` pacing does NOT do that: it bounds one worker, and
 * N concurrent workers simply multiply the aggregate rate. Live run 35796490195
 * proved it — 6 workers x 3.94 req/s = 23.6 req/s, over the 20 req/s ceiling,
 * and 18 series were dropped with HTTP 429 after exhausting their retries.
 *
 * This limiter is process-wide and shared by every caller of getJson(), so the
 * aggregate rate is correct no matter how many workers or phases are in flight.
 * Default 16 req/s leaves ~20% headroom under the documented ceiling.
 */
const RATE_LIMIT_RPS = Number(process.env.KALSHI_MAX_RPS) > 0 ? Number(process.env.KALSHI_MAX_RPS) : 14;
// The docs allow a 3-second burst, but spending it all at once puts ~4x the
// sustained rate into a single second, which is exactly the shape that earned
// the 429s. Hold only a quarter second of budget: measured peak in any 1-second
// sliding window then stays at or under the documented 20 req/s ceiling.
const BUCKET_BURST = Math.max(1, RATE_LIMIT_RPS * 0.25);
const bucket = { tokens: BUCKET_BURST, last: Date.now() };

/** Block until one request's worth of budget is available. Serialised via a promise chain. */
let rateChain = Promise.resolve();
function acquireToken() {
  const wait = rateChain.then(async () => {
    for (;;) {
      const now = Date.now();
      bucket.tokens = Math.min(BUCKET_BURST, bucket.tokens + ((now - bucket.last) / 1000) * RATE_LIMIT_RPS);
      bucket.last = now;
      if (bucket.tokens >= 1) { bucket.tokens -= 1; return; }
      await sleep(Math.max(5, Math.ceil(((1 - bucket.tokens) / RATE_LIMIT_RPS) * 1000)));
    }
  });
  rateChain = wait.catch(() => {});
  return wait;
}

/** GET JSON with a timeout, limited retries on 429/5xx/network errors. 4xx (except 429) fail fast. */
export async function getJson(path, { retries = 4, timeoutMs = 30000 } = {}) {
  const url = path.startsWith('http') ? path : API_BASE + path;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await acquireToken();
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        // Exponential backoff with full jitter. 429s arrive in bursts across
        // concurrent workers; without jitter they all retry in lockstep and
        // collide again. Also spend a second of bucket budget so the whole
        // process backs off, not just this one request.
        if (res.status === 429) bucket.tokens = Math.min(bucket.tokens, 0) - RATE_LIMIT_RPS;
        await sleep(Math.round((500 * 2 ** attempt) * (0.5 + Math.random() / 2)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (/HTTP 4\d\d/.test(String(e.message))) throw e; // bad request / not found: retrying won't help
      await sleep(Math.round((750 * 2 ** attempt) * (0.5 + Math.random() / 2)));
    }
  }
  throw lastErr;
}

/**
 * Cursor-paginate a list endpoint.
 * @param pathBuilder {(cursor:string)=>string} query builder; receives '' on the first page
 * @param listKey {string} the response array field ('markets' | 'series' | 'candlesticks' | 'events')
 */
export async function paginate(pathBuilder, listKey, { maxPages = 100, delayMs = 130 } = {}) {
  const out = [];
  let cursor = '';
  for (let page = 0; page < maxPages; page++) {
    const data = await getJson(pathBuilder(cursor));
    out.push(...(data[listKey] || []));
    cursor = data.cursor || '';
    if (!cursor) break;
    await sleep(delayMs);
  }
  return out;
}

// --- verbatim field converters (dollar strings -> integer cents; no rounding games) ---
export const toCents = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 100));
export const toMean = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 10000)); // mean is dollars x10000 (4dp)
export const toInt = (v) => (v == null || v === '' ? null : Math.round(Number(v)));

/**
 * Normalise one raw candlestick object into the repo's 17-field integer-cents
 * bar layout (src/kalshi-data.js header): [end_ts, volume, price OHLC, mean,
 * previous, yes_bid OHLC, yes_ask OHLC, open_interest]. Field order inside the
 * OHLC groups is open, high, low, close — verified field-for-field against the
 * 2026-09-18 hand transcription (PRES-2024-DJT bar of 2024-10-05).
 */
export function normalizeBar(c) {
  return [
    c.end_period_ts,
    toInt(c.volume),
    toCents(c.price?.open), toCents(c.price?.high), toCents(c.price?.low), toCents(c.price?.close),
    toMean(c.price?.mean), toCents(c.price?.previous),
    toCents(c.yes_bid?.open), toCents(c.yes_bid?.high), toCents(c.yes_bid?.low), toCents(c.yes_bid?.close),
    toCents(c.yes_ask?.open), toCents(c.yes_ask?.high), toCents(c.yes_ask?.low), toCents(c.yes_ask?.close),
    toInt(c.open_interest),
  ];
}

/** Compact row for the open-universe snapshot / tracker CSV. */
export function compactMarket(m, series) {
  return {
    ticker: m.ticker,
    event_ticker: m.event_ticker || null,
    series: series || m.series_ticker || null,
    sub: m.yes_sub_title || m.subtitle || null,
    bid: m.yes_bid_dollars ?? null,
    ask: m.yes_ask_dollars ?? null,
    last: m.last_price_dollars ?? null,
    vol: m.volume_fp ?? m.volume ?? null,
    oi: m.open_interest_fp ?? null,
    close_time: m.close_time || null,
    status: m.status || null,
  };
}

/** Compact row for the series registry. */
export function compactSeries(s) {
  return {
    ticker: s.ticker,
    title: s.title,
    category: s.category || null,
    categories: s.categories || null,
    tags: s.tags || null,
    frequency: s.frequency || null,
    fee_type: s.fee_type || null,
    fee_multiplier: s.fee_multiplier ?? null,
  };
}

/** A series counts as politics/elections when its category/categories/tags say so (never guessed). */
export function isPoliticsSeries(s) {
  const cats = [s.category, ...(s.categories || [])].filter(Boolean);
  if (cats.includes('Elections') || cats.includes('Politics')) return true;
  const tags = s.tags || [];
  return tags.includes('US Elections') || tags.includes('Elections');
}
