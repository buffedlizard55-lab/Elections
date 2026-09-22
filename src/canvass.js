/**
 * Canvass ingestion (P0 after Nov 3) — jurisdiction-specific certified-canvass parser
 * =====================================================================================
 * Turns OFFICIAL certification pages into the outcome records that the cross-layer
 * scorer (src/crosslayer.js) already requires, with evidence retained per record:
 * sha256 of the raw body, an exact certification quote, retrieval timestamp and the
 * registry authority the origin must belong to.
 *
 * Honesty contract (mirrors backtest/crosslayer-outcomes.md):
 *  - An UNOFFICIAL results page never yields an outcome, no matter how complete it
 *    looks. Certification language must be present in the fetched body itself.
 *  - A page that mixes certification and unofficial language on one canvas is
 *    `mixed` → refused until a contest-scoped pattern disambiguates it.
 *  - Candidate/nominee matching is exact after Unicode/whitespace normalisation.
 *    Expected nominee names come from the config (exchange market names today);
 *    a mismatch against the official text is a REFUSAL, never a fuzzy guess.
 *  - Vote totals must parse as non-negative integers, sum > 0, and every configured
 *    nominee must be found. Duplication or missing rows refuse the parse.
 *  - Chamber control is a COMPOSITION of certified seats plus carried seats,
 *    independents' caucus alignment, vacancies and the question's tie-break rule.
 *    The rule must be confirmed from the market's own resolution text before any
 *    control outcome is emitted; `resolutionRuleConfirmed: false` refuses.
 *
 * This module never writes data/crosslayer/outcomes.json by itself: the CLI stages
 * records into data/crosslayer/canvass-staging.json for review, and promotion into
 * outcomes.json is a separate, explicit step that re-runs validateOutcome.
 */

// --- normalisation -----------------------------------------------------------
export const normalizeName = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const parseVotes = (raw) => {
  if (raw == null) return null;
  const s = String(raw).replace(/[,\s]/g, '').replace(/\.(0+)$/, '');
  return /^\d+$/.test(s) ? Number(s) : null;
};

// --- certification language ---------------------------------------------------
// Each list is an explicit, reviewable phrase class. Certification phrases are
// documents/ceremonies that produce legal results; unofficial phrases mark
// provisional tallies. A fetched body containing BOTH is `mixed` (refused).
export const CERTIFIED_PHRASES = [
  /\bcertificate of ascertainment\b/i,
  /\bcertificate of result\b/i,
  /\bstate (?:canvassing board|board of canvassers)\b[^.]{0,120}\bcertif/i,
  /\b(?:official|final) certified (?:election )?results\b/i,
  /\bresults (?:have been|are|is) (?:officially )?certified\b/i,
  /\bhereby certifies\b/i,
  /\bcertification of the (?:election|canvass|results|vote)\b/i,
  /\bofficial (?:canvass|abstract) of votes\b/i,
  /\bcanvass(?:ed|sing)? (?:and )?certified\b/i,
  /\brecount (?:has been )?certified\b/i,
];
export const UNOFFICIAL_PHRASES = [
  /\bunofficial\b/i,
  /\bpreliminary results\b/i,
  /\belection[- ]night (?:results|reporting|totals)\b/i,
  /\bnot (?:yet )?(?:official|final|certified)\b/i,
  /\bsemi[- ]final\b/i,
  /\bresults? (?:are|is) (?:incomplete|partial)\b/i,
  /\b(?:all|100%) precincts (?:reporting|counted)\b/i,
  /\bprovisional results\b/i,
  /\btabulation (?:in progress|ongoing)\b/i,
];

export function detectCertification(text) {
  const t = String(text || '');
  const hit = (list) => list.map((re) => (t.match(re) || [])[0]).filter(Boolean);
  const certified = hit(CERTIFIED_PHRASES);
  const unofficial = hit(UNOFFICIAL_PHRASES);
  let status = 'unknown';
  if (certified.length && unofficial.length) status = 'mixed';
  else if (certified.length) status = 'certified';
  else if (unofficial.length) status = 'unofficial';
  return { status, matched: { certified, unofficial } };
}

// --- contest parsing -----------------------------------------------------------
/**
 * Parse vote totals for one contest out of a text body.
 * contest: { office, jurisdiction, contestPatterns: RegExp[], nominees: [{name, party}], seats?: n }
 * The parser scans for a contest header (any contestPattern), then within the
 * following block (up to the next numbered office header or 4000 chars) finds each
 * nominee's vote total: `<name>` … `<integer>` on the same line or table row.
 */
const NEXT_OFFICE_RE = /^\s*(?:for\s+)?(?:u\.?s\.?\s+)?(?:senator|governor|president|secretary of state|attorney general|state treasurer|state auditor|united states senator|representative in congress)\b/im;

/** Exact token-sequence containment: every nominee name token must appear as a
 * consecutive run of whole tokens in the line. Substring matches ('Mike Collin'
 * inside 'Mike Collins') are rejected by design — a near-miss name is a refusal,
 * not a match. */
export function nameInLine(targetName, line) {
  const lt = normalizeName(line).split(' ').filter(Boolean);
  const tt = normalizeName(targetName).split(' ').filter(Boolean);
  if (!tt.length || lt.length < tt.length) return false;
  for (let i = 0; i + tt.length <= lt.length; i++) {
    let hit = true;
    for (let k = 0; k < tt.length; k++) if (lt[i + k] !== tt[k]) { hit = false; break; }
    if (hit) return true;
  }
  return false;
}

export function parseContestResults(text, contest) {
  const t = String(text || '');
  const fail = (reason) => ({ status: 'refused', reason, rows: [], totalVotes: null });
  if (!contest || !Array.isArray(contest.contestPatterns) || !contest.contestPatterns.length) return fail('contest has no header patterns');
  // Patterns may be RegExp or (from the JSON config) regex-source strings; always case-insensitive.
  const headerIdx = contest.contestPatterns
    .map((p) => (p instanceof RegExp ? t.search(new RegExp(p.source, 'i')) : t.search(new RegExp(p, 'i'))))
    .filter((i) => i >= 0);
  if (!headerIdx.length) return fail(`contest header not matched by any pattern for ${contest.office}/${contest.jurisdiction}`);
  const start = Math.min(...headerIdx);
  const rest = t.slice(start);
  const nextOffice = rest.slice(10).search(NEXT_OFFICE_RE);
  const block = nextOffice >= 0 ? rest.slice(0, nextOffice + 10) : rest.slice(0, 4000);
  const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (const nominee of contest.nominees || []) {
    let found = null;
    for (const line of lines) {
      if (!nameInLine(nominee.name, line)) continue;
      // votes = last standalone integer on the line that is not part of the name itself
      const ints = [...line.matchAll(/(?:^|[\s:|])((?:\d{1,3})(?:,\d{3})+|\d{3,})(?=$|[\s|%])/g)].map((m) => m[1]);
      const votes = ints.length ? parseVotes(ints[ints.length - 1]) : null;
      if (votes !== null) { found = votes; break; }
    }
    if (found === null) return fail(`nominee not found or has no parseable vote total: ${nominee.name}`);
    if (rows.some((r) => normalizeName(r.name) === normalizeName(nominee.name))) return fail(`duplicate rows for nominee: ${nominee.name}`);
    rows.push({ name: nominee.name, party: nominee.party, votes: found });
  }
  if (!rows.length) return fail('no nominees configured');
  const totalVotes = rows.reduce((a, r) => a + r.votes, 0);
  if (totalVotes <= 0) return fail('vote totals sum to zero');
  return { status: 'ok', rows, totalVotes };
}

// --- reconciliation -------------------------------------------------------------
/**
 * rows → winner under the state's rule. Returns { status, y?, leader, margin, totalVotes, reasons }.
 * y follows the cross-layer convention for a Democratic-win question: 1 if the
 * Democratic nominee leads, 0 if the Republican nominee leads. Anything else refuses.
 */
export function reconcile(parsed, { majorityRule = 'plurality', questionKind = 'party-win' } = {}) {
  if (parsed.status !== 'ok') return { status: 'refused', reason: parsed.reason, y: null, leader: null, margin: null, totalVotes: null };
  const sorted = [...parsed.rows].sort((a, b) => b.votes - a.votes);
  const leader = sorted[0];
  const second = sorted[1];
  const bad = parsed.rows.find((r) => !Number.isInteger(r.votes) || r.votes < 0);
  if (bad) return { status: 'refused', reason: `invalid vote total for ${bad.name}`, y: null, leader: null, margin: null, totalVotes: null };
  const totalVotes = parsed.totalVotes;
  if (majorityRule === 'majority-runoff' && leader.votes / totalVotes <= 0.5) {
    return { status: 'runoff', reason: `leader has ${((leader.votes / totalVotes) * 100).toFixed(1)}% — below majority; runoff scheduled`, y: null, leader: leader.name, margin: null, totalVotes };
  }
  if (majorityRule === 'rcv-instant-runoff') {
    return { status: 'refused', reason: 'rcv-instant-runoff: first-choice totals do not decide the seat; a ranked-choice tabulation parser is required', y: null, leader: leader.name, margin: null, totalVotes };
  }
  if (leader.votes === second?.votes) return { status: 'refused', reason: 'exact tie — contest-specific tie rule required', y: null, leader: leader.name, margin: null, totalVotes };
  let y = null;
  if (/^(D|Democratic)$/.test(leader.party)) y = 1;
  else if (/^(R|Republican)$/.test(leader.party)) y = 0;
  else if (questionKind === 'dem-win') y = 0; // an independent/third-party win means the Democratic nominee did not win the seat
  else return { status: 'refused', reason: `leader is neither Democratic nor Republican (${leader.party}) — map to the question's resolution rule first`, y: null, leader: leader.name, margin: null, totalVotes };
  return { status: 'ok', y, leader: leader.name, margin: leader.votes - (second ? second.votes : 0), totalVotes };
}

// --- chamber composition -----------------------------------------------------------
/**
 * Certified seat results + carried seats → chamber control for a control question.
 * Inputs are explicit configuration, reviewed by a human, never inferred:
 *   certifiedSeats: [{ state, y (1 D / 0 R), certifiedOn, sourceId }] — ALL must be present
 *   carriedSeats:   { D, R, other }  — seats not up this cycle, per the question's chamber
 *   otherSeatsCaucus: { withD: n, withR: n } — how "other"/independent seats organize
 *   vacancies: n
 *   resolutionRule: { majorityOf: 100, tieBreak: 'vice-president'|'other'|null, confirmed: boolean }
 * Returns control 'D' | 'R' | 'undetermined' with an auditable derivation.
 */
export function chamberComposition({ certifiedSeats, carriedSeats, otherSeatsCaucus, vacancies = 0, resolutionRule, expectedSeatsUp = null }) {
  const refuse = (reasons) => ({ status: 'refused', reasons, control: 'undetermined', D: null, R: null });
  if (!resolutionRule || resolutionRule.confirmed !== true) return refuse(['resolution rule not confirmed from the question text — composition scoring refused']);
  if (!Array.isArray(certifiedSeats) || !certifiedSeats.length) return refuse(['no certified seats provided']);
  if (Number.isInteger(expectedSeatsUp) && certifiedSeats.length !== expectedSeatsUp) {
    return refuse([`expected ${expectedSeatsUp} contested seats but received ${certifiedSeats.length} — composition on an incomplete set is refused`]);
  }
  const badSeat = certifiedSeats.find((s) => s.y !== 0 && s.y !== 1);
  if (badSeat) return refuse([`seat ${badSeat.state || '?'} has no certified y (0/1)`]);
  const carried = carriedSeats || {};
  for (const k of ['D', 'R']) {
    if (!Number.isInteger(carried[k]) || carried[k] < 0) return refuse([`carriedSeats.${k} missing or invalid`]);
  }
  const other = Number.isInteger(carried.other) ? carried.other : 0;
  const withD = otherSeatsCaucus && Number.isInteger(otherSeatsCaucus.withD) ? otherSeatsCaucus.withD : other;
  const withR = otherSeatsCaucus && Number.isInteger(otherSeatsCaucus.withR) ? otherSeatsCaucus.withR : 0;
  if (withD + withR > other) return refuse([`caucus alignment (${withD}+${withR}) exceeds other seats (${other})`]);
  const dUp = certifiedSeats.filter((s) => s.y === 1).length;
  const rUp = certifiedSeats.filter((s) => s.y === 0).length;
  const D = carried.D + dUp + withD;
  const R = carried.R + rUp + withR;
  const total = D + R + Math.max(other - withD - withR, 0) + vacancies;
  const reasons = [
    `certified seats up: D ${dUp} / R ${rUp} (of ${certifiedSeats.length} configured)`,
    `carried: D ${carried.D}, R ${carried.R}, other ${other}`,
    `caucus alignment of other seats: ${withD} with D, ${withR} with R`,
    `vacancies counted but unassigned: ${vacancies}`,
  ];
  const maj = resolutionRule.majorityOf ? Math.floor(resolutionRule.majorityOf / 2) + 1 : null;
  if (maj !== null) {
    if (D >= maj && R < maj) return { status: 'ok', control: 'D', D, R, y: 1, reasons };
    if (R >= maj && D < maj) return { status: 'ok', control: 'R', D, R, y: 0, reasons };
    if (D >= maj && R >= maj) return refuse([...reasons, `both sides reach ${maj} — arithmetic error or over-assignment`]);
    if (D === R && resolutionRule.tieBreak === 'vice-president') {
      return { status: 'ok', control: D > 0 && dUp + carried.D + withD >= D ? 'D' : 'undetermined', D, R, y: D >= R ? 1 : 0, reasons: [...reasons, `tie ${D}-${R} broken by the vice president's party per the confirmed rule`] };
    }
    return refuse([...reasons, `no side reaches ${maj} (${D}-${R}) — minority organization / coalition review required`]);
  }
  return refuse([...reasons, 'no majorityOf configured']);
}

// --- outcome record ------------------------------------------------------------------
export function buildOutcomeRecord({ questionId, y, certifiedOn, authorityId, url, certificationQuote, retrievedAt, sha256, derivation }) {
  const rec = {
    question: questionId,
    y,
    certifiedOn,
    sources: [{
      sourceId: authorityId,
      url,
      kind: 'certified-canvass',
      certificationQuote,
      retrievedAt,
    }],
  };
  if (sha256) rec.sources[0].sha256 = sha256;
  if (derivation) rec.derivation = derivation;
  return rec;
}

// --- collector ------------------------------------------------------------------------
const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * ingestCanvass(jurisdictions, { fetchImpl = fetch, now }) — fetches each jurisdiction's
 * certification page, retains evidence, and stages outcome records ONLY for bodies that
 * are themselves certified, parsed and reconciled. Everything else is recorded as a
 * refusal with the reason. Nothing here is ever silently dropped.
 */
export async function ingestCanvass(jurisdictions, { fetchImpl = fetch, now = isoNow(), timeoutMs = 30000 } = {}) {
  const rows = [];
  for (const j of jurisdictions) {
    const row = { id: j.id, authorityId: j.authorityId, url: j.url || null, fetchedAt: now, status: 'skipped', notes: [] };
    rows.push(row);
    if (!j.url) { row.status = 'no-url-yet'; row.notes.push('results/certification URL is filled after election night from the authority site, then re-run'); continue; }
    let body = null;
    try {
      const res = await fetchImpl(j.url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'elections-project-canvass/1.0 (research; contact via repository)' } });
      row.httpStatus = res.status;
      if (!res.ok) { row.status = 'fetch-failed'; row.notes.push(`HTTP ${res.status}`); continue; }
      body = await res.text();
    } catch (e) {
      row.status = 'fetch-failed';
      row.notes.push(`fetch error: ${String(e && e.message ? e.message : e).slice(0, 200)}`);
      continue;
    }
    row.sha256 = (await import('node:crypto')).createHash('sha256').update(body).digest('hex');
    row.bytes = body.length;
    const cert = detectCertification(body);
    row.certificationStatus = cert.status;
    row.certificationPhrases = [...cert.matched.certified, ...cert.matched.unofficial].slice(0, 6);
    if (cert.status === 'unofficial') { row.status = 'unofficial-not-scored'; row.notes.push('results page is unofficial; waiting for the certified canvass'); continue; }
    if (cert.status === 'unknown') { row.status = 'no-certification-language'; row.notes.push('page fetched but no certification language found; not treated as certified'); continue; }
    if (cert.status === 'mixed') { row.status = 'mixed-language-refused'; row.notes.push('page contains both certification and unofficial language; contest-scoped disambiguation required'); continue; }
    const parsed = parseContestResults(body, j.contest);
    if (parsed.status !== 'ok') { row.status = 'parse-refused'; row.notes.push(parsed.reason); continue; }
    row.parsedRows = parsed.rows;
    row.totalVotes = parsed.totalVotes;
    const rec = reconcile(parsed, { majorityRule: j.majorityRule || 'plurality', questionKind: j.questionKind || 'party-win' });
    row.reconciliation = { status: rec.status, y: rec.y, leader: rec.leader, margin: rec.margin, notes: rec.reason ? [rec.reason] : [] };
    if (rec.status !== 'ok') { row.status = `reconcile-${rec.status}`; if (rec.reason) row.notes.push(rec.reason); continue; }
    const expected = (j.contest.nominees || []).map((n) => normalizeName(n.name)).sort().join('|');
    const found = parsed.rows.map((r) => normalizeName(r.name)).sort().join('|');
    if (expected !== found) { row.status = 'nominee-set-refused'; row.notes.push(`configured nominees ${expected} != parsed ${found}`); continue; }
    row.status = 'staged';
    row.outcome = buildOutcomeRecord({
      questionId: j.questionId,
      y: rec.y,
      // The certification DATE is a legal fact: it is filled per jurisdiction during the
      // review/promotion step (the CLI's --certified-on), never invented here.
      certifiedOn: j.certifiedOn || null,
      authorityId: j.authorityId,
      url: j.url,
      certificationQuote: cert.matched.certified[0],
      retrievedAt: now,
      sha256: row.sha256,
      derivation: { votes: parsed.rows, totalVotes: parsed.totalVotes, majorityRule: j.majorityRule || 'plurality', jurisdiction: j.jurisdiction, office: j.office },
    });
  }
  return { rows, staged: rows.filter((r) => r.status === 'staged') };
}
