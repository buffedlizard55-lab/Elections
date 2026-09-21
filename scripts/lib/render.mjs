/**
 * Zero-dependency page fetch helpers shared by the third-layer collectors and the host probe.
 * ==========================================================================================
 * Two problems surfaced on the first networked run of the collectors (2026-09-20, irregularity #58):
 *   1. State Navigate's forecast pages are CLIENT-rendered — a plain HTTP fetch returns only the page
 *      shell, so every number parses 'failed'.
 *   2. Metaculus answered the GitHub-hosted runner with a Cloudflare interstitial ("Just a moment...",
 *      HTTP 403) although the same page is served to ordinary browsers.
 *
 * Both are addressed here without adding a dependency: GitHub's ubuntu runner images ship Google Chrome
 * and Chromium, and Chrome's `--headless=new --dump-dom` prints the DOM *after* the page's JavaScript has
 * run. When no Chrome binary exists (this sandbox, most laptops) the helper says so and the caller falls
 * back to a plain fetch — the row then records which method produced it (`fetchMethod`) so a reader can
 * tell a rendered capture from a raw one. Nothing is ever synthesised on failure.
 *
 * Header profiles: the project identifies itself first (`elections-collector (...)`); only when the host
 * answers with a bot interstitial does the caller retry with a browser-like profile. Both attempts and their
 * statuses are recorded verbatim in the collector output, so the audit trail shows exactly what was sent.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PROJECT_UA = 'elections-collector (github.com/buffedlizard55-lab/Elections)';
export const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export const HEADER_PROFILES = {
  project: { 'user-agent': PROJECT_UA, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
  browser: {
    'user-agent': BROWSER_UA,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'upgrade-insecure-requests': '1',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
  },
};

/** Recognise the common bot interstitials so a 403 challenge page is never parsed as content. */
export function looksLikeChallenge(status, body) {
  const b = String(body || '').slice(0, 4000);
  if (/<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(b)) return 'cloudflare-challenge';
  if (/cf-browser-verification|cf_chl_opt|challenge-platform/i.test(b)) return 'cloudflare-challenge';
  if (/Attention Required!\s*\|\s*Cloudflare/i.test(b)) return 'cloudflare-block';
  if (/Access Denied.{0,200}(Reference|akamai)/is.test(b) || /AkamaiGHost/i.test(b)) return 'akamai-block';
  if (/Request unsuccessful\. Incapsula incident/i.test(b) || /_Incapsula_Resource/i.test(b)) return 'imperva-block';
  if (/Pardon Our Interruption/i.test(b)) return 'distil-block';
  if (/<(?:title|h[12])[^>]*>\s*(?:403\s*[-–:]?\s*(?:Forbidden[^<]*)?|Access denied|Page Not Found[^<]*)\s*</i.test(b) || /<Code>AccessDenied<\/Code>/i.test(b)) return 'access-denied-or-missing';
  if (status === 429) return 'rate-limited';
  return null;
}

/**
 * Plain fetch with the project profile, retried once with the browser profile when the first answer is a
 * bot interstitial or a 403/503. Returns every attempt so the audit row can show what happened.
 */
export async function fetchWithProfiles(url, { profiles = ['project', 'browser'], timeoutMs = 30000, extraHeaders = {} } = {}) {
  const attempts = [];
  for (const name of profiles) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { ...HEADER_PROFILES[name], ...extraHeaders }, redirect: 'follow', signal: ctrl.signal });
      const body = await res.text();
      const challenge = looksLikeChallenge(res.status, body);
      const attempt = { profile: name, status: res.status, finalUrl: res.url, contentType: res.headers.get('content-type') || null, bytes: body.length, challenge };
      attempts.push(attempt);
      if (res.ok && !challenge) return { ok: true, status: res.status, body, finalUrl: res.url, profile: name, attempts, method: 'fetch' };
      if (!challenge && res.status !== 403 && res.status !== 503) return { ok: false, status: res.status, body, finalUrl: res.url, profile: name, attempts, method: 'fetch' };
      // interstitial / 403 / 503 -> try the next profile
      var last = { ok: false, status: res.status, body, finalUrl: res.url, profile: name, attempts, method: 'fetch' };
    } catch (e) {
      attempts.push({ profile: name, error: String(e && e.message || e).slice(0, 200) });
      var last = { ok: false, status: 0, body: '', error: String(e && e.message || e).slice(0, 200), profile: name, attempts, method: 'fetch' };
    } finally { clearTimeout(timer); }
  }
  return last || { ok: false, status: 0, body: '', attempts, method: 'fetch' };
}

let chromeBin;
/** First Chrome/Chromium binary on PATH (GitHub ubuntu runners ship google-chrome and chromium); null when none. */
export function findChrome() {
  if (chromeBin !== undefined) return chromeBin;
  chromeBin = null;
  const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'].filter(Boolean);
  for (const c of candidates) {
    try {
      const p = execFileSync('sh', ['-c', `command -v ${JSON.stringify(c)}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (p) { chromeBin = p; break; }
    } catch { /* not on PATH */ }
  }
  return chromeBin;
}

let profileDir;
/** One Chrome profile per process: a bot challenge solved on the first page (cf_clearance cookie) then carries to the next. */
function chromeProfileDir() {
  if (!profileDir) { profileDir = mkdtempSync(join(tmpdir(), 'elections-chrome-')); }
  return profileDir;
}

/**
 * Render a page in headless Chrome and return the post-JavaScript DOM (`--dump-dom`).
 * `virtualTimeBudgetMs` lets the page's timers/XHRs run before the dump; `--timeout` is the hard cap.
 * When the dumped DOM is still a bot interstitial the render is retried with a longer budget (the first
 * live run, 2026-09-20, passed Metaculus' Cloudflare check on 3 of 7 pages — the check needs wall-clock
 * time, not just virtual time). Every attempt is reported. Returns { ok:false, reason } when no Chrome
 * binary exists or the render fails — never a guessed body.
 */
export function renderDom(url, { virtualTimeBudgetMs = 20000, timeoutMs = 45000, userAgent = BROWSER_UA, retries = 2 } = {}) {
  const bin = findChrome();
  if (!bin) return { ok: false, reason: 'no-chrome-binary', method: 'headless-chrome' };
  const attempts = [];
  let budget = virtualTimeBudgetMs; let cap = timeoutMs; let last = null;
  for (let i = 0; i <= retries; i += 1) {
    const args = [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio',
      '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--window-size=1366,2400',
      `--user-data-dir=${chromeProfileDir()}`, `--user-agent=${userAgent}`, `--virtual-time-budget=${budget}`, `--timeout=${cap - 5000}`,
      '--dump-dom', url,
    ];
    try {
      const html = execFileSync(bin, args, { encoding: 'utf8', timeout: cap, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      const challenge = looksLikeChallenge(200, html);
      attempts.push({ budgetMs: budget, bytes: html ? html.length : 0, challenge });
      if (!html || html.length < 50) { last = { ok: false, reason: `empty dom (${html ? html.length : 0} bytes)`, method: 'headless-chrome', bin, attempts }; }
      else {
        last = { ok: true, html, method: 'headless-chrome', bin, challenge, attempts };
        if (!challenge) return last;
      }
    } catch (e) {
      attempts.push({ budgetMs: budget, error: String(e && e.message || e).slice(0, 200) });
      last = { ok: false, reason: String(e && e.message || e).slice(0, 200), method: 'headless-chrome', bin, attempts };
    }
    budget += 15000; cap += 15000; // give the interstitial more wall-clock and virtual time on the retry
  }
  return last;
}

/** Minimal HTML -> text (script/style removed, entities decoded, whitespace collapsed). Shared by the parsers. */
export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;?/g, ' ').replace(/&#x[0-9a-f]+;?/gi, ' ').replace(/&#\d+;?/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/(\d)\s+%/g, '$1%').replace(/\s+/g, ' ').trim();
}

/** <title> of a page, or null. */
export function pageTitle(html) {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? htmlToText(m[1]).slice(0, 200) : null;
}
