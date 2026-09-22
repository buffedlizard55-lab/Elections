#!/usr/bin/env node
/**
 * Session-11 (2026-09-21) master-list expansion: append the 20 sources verified
 * directly via fetch_page on 2026-09-21 (master 229 -> 249).
 *
 * Rules honored:
 *  - every entry carries an observed-quote `verified` field from the actual fetch
 *  - statuses use the documented vocabulary; change-research is needs-review
 *    (Democratic-campaign-aligned firm, per the DFP/Civiqs precedent) and cygnal
 *    is needs-review (Republican-campaign-aligned firm, same precedent)
 *  - notes mandatory (verifiedOn > 2026-09-18)
 *  - idempotent: entries whose id already exists are skipped, category counts
 *    are recomputed from the final source list, `updated` refreshed only on change
 *  - data files are the source of truth; this script is a dated one-off patch tool
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'data/sources/master.json';
const TODAY = '2026-09-21';
const master = JSON.parse(readFileSync(PATH, 'utf8'));

const ENTRIES = [
  // ---------- Government — state & local (5) ----------
  {
    id: 'denver-clerk-recorder',
    name: 'Denver Elections Division (Clerk & Recorder)',
    type: 'County election authority (Denver, CO — voter registration, ballot drop sites, election results; CO U.S. Senate/Governor 2026 — Kalshi SENATECO-26 / GOVPARTYCO-26)',
    url: 'https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Clerk-and-Recorder/Elections-Division',
    verified: 'Reached 2026-09-21 via denvervotes.org, which redirects to the DenverGov Elections Division (title \'Elections Division | City and County of Denver\'). Observed: Denver Elections Division pages covering the November 3, 2026 general/midterm election plus a City Council vacancy special election (Parady resignation); results are published at denvergov.org/electionresults; earlier attempt /Denver-Votes returned the site 404 and is recorded rather than dropped.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Complements colorado-sos (state canvass authority). Denver is a large mail-ballot county; results page is the county-level first-report source for CO contests on the 2026 tracker.',
    category: 'Government — state & local',
  },
  {
    id: 'salt-lake-county-clerk',
    name: 'Salt Lake County Clerk — Elections',
    type: 'County election authority (Salt Lake County, UT — Utah\'s largest county; election home, results; UT U.S. Senate 2026 — Kalshi SENATEUT-26)',
    url: 'https://slco.org/clerk/elections/',
    verified: 'Fetched 2026-09-21: slco.org/clerk/elections/ resolves to the Salt Lake County Clerk elections section on saltlakecounty.gov. Observed: 2026 Elections home page with current-election information and results links for the county that casts the largest vote share in Utah.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Utah county-level results reporter alongside the state authority; SLCo results page is the fast county feed for SENATEUT-26 canvass watching.',
    category: 'Government — state & local',
  },
  {
    id: 'baltimore-city-boe',
    name: 'Baltimore City Board of Elections',
    type: 'City election authority (Baltimore, MD — 2026 election information, ballot questions, candidate/judge resources; MD U.S. Senate/Governor 2026 — Kalshi SENATEMD-26 / GOVPARTYMD-26)',
    url: 'https://www.baltimorecity.gov/boe',
    verified: 'Fetched 2026-09-21 via elections.baltimorecity.gov, which routes to baltimorecity.gov/boe. Observed: Board of Elections page identifying Director Clifford Tatum and acting deputy director Lisa Stanley; \'2026 Election Information\' and Ballot Question Text links; election-judge pay $250-$325; contact (410) 396-5550, 417 E. Fayette St.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Maryland\'s largest jurisdiction; the earlier elections.baltimorecity.gov hostname still resolves but the canonical gov page is baltimorecity.gov/boe.',
    category: 'Government — state & local',
  },
  {
    id: 'multnomah-county-elections',
    name: 'Multnomah County Elections Division (OR)',
    type: 'County election authority (Multnomah County, OR — Oregon\'s most populous county; vote-by-mail administration, November 3 2026 general, drop sites, RCV; OR U.S. Senate/Governor 2026 — Kalshi SENATEOR-26 / GOVPARTYOR-26)',
    url: 'https://www.multco.us/departments/multnomah-county-elections-division',
    verified: 'Fetched 2026-09-21 (multco.us/elections -> multco.us/departments/multnomah-county-elections-division). Observed: \'November 3, 2026 General Election\' content; vote-by-mail, ranked-choice voting and ballot drop-site pages; signature-challenge letters posted for the November 2026 election; 1040 SE Morrison St, Portland; 503-988-8683.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Admitted as the Portland-metro county authority. The session also tried Fresno County (fresnocountyca.gov path 404), St. Louis (comptroller path 404) and Wake County (/1145/Board-of-Elections 404) for this slot and recorded the failures rather than fabricating URLs.',
    category: 'Government — state & local',
  },
  {
    id: 'clark-county-wa-elections',
    name: 'Clark County Elections (WA Auditor)',
    type: 'County election authority (Clark County, WA — Vancouver metro; November 3 2026 General & Special Election, ballot drop sites, audits, past-results archive; WA U.S. Senate 2026 — Kalshi SENATEWA-26)',
    url: 'https://clark.wa.gov/elections/',
    verified: 'Fetched 2026-09-21 (title \'Elections | Clark County\'). Observed: \'Current Election: November 3, 2026 General & Special Election\'; 2026 Elections Calendar; VoteWA registration link; ballot drop sites \'Open beginning 18 days before an election until 8 pm on Election Day\'; Auditor Greg Kimsey; audit notices for Aug 5/13, 2026; past-elections archive back to 2018; elections@clark.wa.gov, (564) 397-2345, 1408 Franklin St, Vancouver.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Washington runs all-mail elections with county-level tabulation feeds; complements washington-sos for SENATEWA-26 canvass detail.',
    category: 'Government — state & local',
  },

  // ---------- Academic & university research (4) ----------
  {
    id: 'ap-norc',
    name: 'AP-NORC Center for Public Affairs Research',
    type: 'Academic survey center (University of Chicago NORC + AP partnership; operator of AP VoteCast election studies; 2026 national/state projects)',
    url: 'https://apnorc.org/',
    verified: 'Fetched 2026-09-21 (title \'AP-NORC\'). Observed: active 2026 research including \'State of the Facts 2026\', Trump/ICE immigration approval studies, an Iran war study, an \'America 250\' poll, the Media Insight Project, and AAPI Data collaborations; the center is the AP\'s long-standing survey research partner.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'AP-NORC runs AP VoteCast, the large-scale election study the Associated Press publishes on election nights; relevant as an academic benchmark for the 2026 layer (companion to the AP wire entry already in the master list).',
    category: 'Academic & university research',
  },
  {
    id: 'rutgers-eagleton-poll',
    name: 'Rutgers-Eagleton Poll (Eagleton Institute of Politics)',
    type: 'University statewide pollster (New Jersey; Garden State Panel probability-based multi-mode survey; NJ U.S. Senate/Governor 2026 — Kalshi SENATENJ-26 / GOVPARTYNJ-26)',
    url: 'https://eagletonpoll.rutgers.edu/',
    verified: 'Fetched 2026-09-21: eagleton.rutgers.edu (Eagleton Institute) and eagletonpoll.rutgers.edu both resolve. Observed: the Rutgers-Eagleton Poll with press releases and a public data archive; director Ashley Koning; surveys fielded on the SSRS Garden State Panel (probability-based, multi-mode); ECPIP described as the oldest university-based statewide survey research center; the institute notes Monmouth University Polling Institute closed in March 2025, leaving Eagleton as New Jersey\'s main academic poll.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Fills the New Jersey academic-poll gap left by Monmouth\'s 2025 closure. Watch for NJ 2026 gubernatorial releases on the Garden State Panel.',
    category: 'Academic & university research',
  },
  {
    id: 'schar-school-gmu',
    name: 'Schar School of Policy and Government (George Mason University)',
    type: 'University research unit (co-sponsor of the Washington Post-Schar School 2026 poll series; VA/MI battleground polling)',
    url: 'https://schar.gmu.edu/',
    verified: 'Fetched 2026-09-21 (title \'Schar School of Policy and Government\'). Observed: the school\'s live homepage. The Washington Post-Schar School 2026 series was verified through the Post\'s published PDF (washingtonpost.com/documents/08fa9b5e-43ac-456c-a706-4c33ec6506dc.pdf): Michigan, Sep 10-14 2026, n=803 likely voters, MOE +/-3.9, telephone 65% cell/10% landline/25% text-to-web, Aristotle statewide voter file with probability-of-electorate modeling, fieldwork Braun Research (Princeton, NJ) — toplines El-Sayed 48 / Rogers 45 (Senate), Benson 53 / James 41 (Governor), Senate control D 53 / R 45; a Virginia edition ran Mar 26-31 2026, n=1,101 registered voters (redistricting question).',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Admitted after Trafalgar Group was dropped: trafalgargroup.org serves a GoDaddy for-sale parking page (checked 2026-09-21), so the Schar School replaces it in the session-11 batch. Poll-to-market comparisons for MI: SENATEMI-26 D ~0.33-0.34 vs WaPo-Schar El-Sayed 48% among LV — flag as divergent-until-canvassed rather than reconciling now.',
    category: 'Academic & university research',
  },
  {
    id: 'usc-cesr',
    name: 'USC Center for Economic and Social Research (CESR)',
    type: 'Academic survey center (University of Southern California; operator of the Understanding America Study probability panel)',
    url: 'https://dornsife.usc.edu/cesr/',
    verified: 'Fetched 2026-09-21 (title \'Home - Center for Economic and Social Research\'). Observed: live center under USC Dornsife with research areas, centers-and-programs, Data Toolbox, and an active Sep-Nov 2026 seminar calendar (Wharton, Wisconsin, World Bank, NY Fed speakers).',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'CESR\'s Understanding America Study is a probability-based internet panel used for election-adjacent social science; admitted as methodology reference for online-probability-panel method families in the poll layer.',
    category: 'Academic & university research',
  },

  // ---------- Pollsters & survey research (4) ----------
  {
    id: 'quantus-insights',
    name: 'Quantus Insights',
    type: 'Public-opinion polling firm (national approval trackers + 2026 state polls; ME/TX/NC primary/general series)',
    url: 'https://polls.quantusinsights.org/',
    verified: 'Fetched 2026-09-21 (archive at polls.quantusinsights.org). Observed: public poll archive with 2026 releases — national Trump approval Jan 22 n=1,000, Feb 12 n=1,515, Mar 18 n=1,064, Jun 16 n=1,075; Maine Senate general Mar 5 n=800 and Jun 10 n=870; Texas general Jun 3 n=800; NC Senate Apr 1 n=987; SC GOP gov primary Mar 11 n=806; LA GOP senate primary Feb 24 n=1,428; GA GOP primaries Feb 18 n=1,337; KY GOP senate primary Feb 4 n=870 — each with toplines/crosstabs pages and an About/Methodology footer.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Small firm; per-release sample sizes and mode pages are the verification surface. ME row compares against SENATEME-26 (R ~0.32-0.33 on the exchange).',
    category: 'Pollsters & survey research',
  },
  {
    id: 'insideradvantage',
    name: 'InsiderAdvantage',
    type: 'Commercial pollster (mixed-mode text/panel state surveys; national Senate series; GA-based, Matt Towery)',
    url: 'https://insideradvantage.com/',
    verified: 'Fetched 2026-09-21 (title \'InsiderAdvantage\'). Observed: September 2026 releases — \'N.C. Cooper 48, Whatley 43; MI ElSayed 47, Rogers 45; NH Pappas 48, Sununu 40%\' with method line \'Each survey: 1200 LV; MOE 2.83%; Mixed Mode Text/Panel; Weighted for Age, Race, Gender and Political Affiliation. All surveys conducted 9/16-18\'; companion series \'Texas: Talarico 47, Paxton 46; South Carolina: Graham 45, Andrews 43; Ohio: Brown 47, Husted 42\'; site cites a VoteHub pollster scorecard A grade; founder Matt Towery announced he retires from polling in November 2026.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Mixed text/panel mode maps to the sms-online-panel family in the poll layer (label per release, do not pool unlabeled). Founder retirement is a continuity caveat for 2028-cycle reliability. SC row references the Graham seat per release framing — see irregularity #69 for the publisher-framing flag.',
    category: 'Pollsters & survey research',
  },
  {
    id: 'cygnal',
    name: 'Cygnal',
    type: 'Commercial polling and analytics firm (GOP-campaign-aligned; public releases with methodology; self-described most-accurate private pollster)',
    url: 'https://www.cygn.al/',
    verified: 'Fetched 2026-09-21 (title \'Top Political Polling & Voter Insights Firm - Cygnal\'). Observed: homepage stats card with public findings — generic congressional ballot \'Democrats ... now at 51% to 42%, a 9-point advantage\'; Trump favorability 39%; \'Voters now expect Dems to win Congress by 49 percent to 37 percent\'; client roster includes NRCC, RSLC, Republican Attorneys General, Gov. Abbott, NRSC-aligned committees; releases link to published methodology pages.',
    verifiedOn: TODAY,
    status: 'needs-review',
    notes: 'Partisan-aligned commercial pollster (Republican) — same treatment as Data for Progress/Civiqs on the Democratic side: admitted with needs-review status, per-release methodology required before any number enters the poll layer, and never pooled with unlabeled online opt-in.',
    category: 'Pollsters & survey research',
  },
  {
    id: 'change-research',
    name: 'Change Research',
    type: 'Commercial pollster (Democratic-campaign-aligned; Dynamic Online Sampling: digital ads + SMS + selective panels)',
    url: 'https://changeresearch.com/accuracy-methodology/',
    verified: 'Fetched 2026-09-21 (title \'Accuracy & Methodology - Change Research\'). Observed: published accuracy page — \'Across 141 partisan races in the final 30 days of the 2022 and 2024 elections ... 3.3pt Final margin, on avg, 86% Within 6 points\'; \'4,000+ Polls conducted\'; \'50 States polled (+ DC and PR)\'; methodology described as recruiting \'through a combination of targeted digital ads, text messaging, and selective panels\' with real-time sample adjustment; accuracy reports by year (2024, 2023 Chicago, 2022, 2020); client testimonial from the Ohio House Democratic Caucus.',
    verifiedOn: TODAY,
    status: 'needs-review',
    notes: 'Democratic-campaign-aligned online pollster — needs-review status like Cygnal/DFP/Civiqs; methodology is published and per-poll methodology sections exist, so releases are usable with explicit method labels, never pooled.',
    category: 'Pollsters & survey research',
  },

  // ---------- News outlets & wires (4) ----------
  {
    id: 'wmur',
    name: 'WMUR News 9 (ABC, New Hampshire)',
    type: 'State TV news outlet (New Hampshire political coverage; candidate forums; CloseUp; PolitiFact NH partner; NH U.S. Senate 2026 — Kalshi SENATENH-26)',
    url: 'https://www.wmur.com/politics',
    verified: 'Fetched 2026-09-21 (title \'New Hampshire Political News & Live National Politics - WMUR News 9\'). Observed: \'Conversation with the Candidate\' town halls for NH-01/02 candidates (Stefany Shaheen, Maura Sullivan, Anthony DiLorenzo); CloseUp segments including \'Control of NH Senate up for grabs in November\'; \'Get the Facts: Commitment coverage\' PolitiFact partnership; political reporting by Adam Sexton.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'New Hampshire\'s broadcast political source of record; complements the WMUR/UNH polling tradition for SENATENH-26 coverage.',
    category: 'News outlets & wires',
  },
  {
    id: 'nevada-independent',
    name: 'The Nevada Independent',
    type: 'Nonprofit state newsroom (Nevada elections hub, fact checks, promise tracker; NV U.S. Senate/Governor 2026 — Kalshi SENATENV-26 / GOVPARTYNV-26)',
    url: 'https://thenevadaindependent.com/',
    verified: 'Fetched 2026-09-21 (title \'The Nevada Independent - Your state. Your news. Your voice.\'). Observed: dedicated \'Elections\' navigation to thenevadaindependent.com/elections/2026/general; Fact Checks section; Lombardo Promise Tracker; Ralston Reports; nonprofit About/Our Donors transparency pages.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Free, donor-funded, nonpartisan; the state\'s main independent political newsroom. Blocked-official-path follow-up: nevada SOS canvass pages remain fetch-blocked from this environment (recorded earlier), so the Indy is the Nevada news fallback, not a substitute authority.',
    category: 'News outlets & wires',
  },
  {
    id: 'minnesota-star-tribune',
    name: 'The Minnesota Star Tribune',
    type: 'State newspaper of record (Minnesota politics and elections desk; MN U.S. Senate/Governor 2026 — Kalshi SENATEMN-26 / GOVPARTYMN-26)',
    url: 'https://www.startribune.com/news-politics/politics',
    verified: 'Fetched 2026-09-21 (title \'Minnesota politics and government news\'). Observed: ELECTIONS section; \'Peggy Flanagan on fraud, war and health care, and why she\'s running for Senate\' identifying Flanagan as \'the Democratic nominee for Senate\'; \'Minnesota\'s midterm election, by the numbers\' by Briana Bierschbach; MN candidate coverage consistent with the tracker\'s SENATEMN-26 nominee names.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Corroborates the Democratic Senate nominee name published on the exchange (SENATEMN-26 \'Peggy Flanagan\') — an independent secondary check on Kalshi nominee identities in MN.',
    category: 'News outlets & wires',
  },
  {
    id: 'alaska-beacon',
    name: 'Alaska Beacon',
    type: 'Nonprofit state newsroom (States Newsroom; Alaska elections and governance coverage; AK U.S. Senate/Governor 2026 — Kalshi SENATEAK-26 / GOVPARTYAK-26 party-level RCV markets)',
    url: 'https://alaskabeacon.com/',
    verified: 'Fetched 2026-09-21 (title \'Alaska Beacon - Home\'). Observed: same-day coverage Sep 21 2026 including \'Pitched battle for Alaska\'s Senate seat is enveloped in a fight over fish\' (Yereth Rosen) and gubernatorial candidate forum reporting (Kreiss-Tomkins, Taylor, Wilson, Bronson); States Newsroom network branding; briefs and commentary sections.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Alaska runs ranked-choice general elections; the tracker\'s AK rows are party-level (GOVPARTYAK-26 D/R). The Beacon is the AK newsroom counterpart to fairvote.org\'s RCV explainers already admitted below.',
    category: 'News outlets & wires',
  },

  // ---------- Ratings, forecasts & analysis (3) ----------
  {
    id: 'vpap',
    name: 'Virginia Public Access Project (VPAP)',
    type: 'Nonpartisan nonprofit election-data tracker (Virginia: federal/state election data, campaign finance, early-voting dashboards, results archive; VA U.S. Senate/Governor 2026 markets context)',
    url: 'https://www.vpap.org/',
    verified: 'Fetched 2026-09-21 (title \'Nonpartisan Political Data | Virginia Public Access Project\'). Observed: \'VPAP\'s free, nonprofit resources provide insight into Virginia elections, campaign finance, news, and more\'; Federal Elections, State Elections and Election Results sections; trending items \'NOVEMBER 2026 EARLY VOTING\', \'UPDATED: SEPTEMBER FINANCE REPORTS\', \'UPDATED: VPAP INDEX\'; Early Voting Dashboard visual for the Nov 2026 general.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'The go-to free data intermediary for Virginia elections; useful for VA 2026 downballot and early-voting turnout context as the November general approaches.',
    category: 'Ratings, forecasts & analysis',
  },
  {
    id: 'fairvote',
    name: 'FairVote',
    type: 'Nonpartisan electoral-research and reform organization (ranked-choice voting research, RCV data, election news aggregation)',
    url: 'https://fairvote.org/',
    verified: 'Fetched 2026-09-21 (title \'Homepage - FairVote\'). Observed: \'FairVote news update: Sep. 21, 2026\'; Aug 2026 analysis \'Dan Sullivan faces Dan Sullivan for Alaska Senate seat\' (two candidates with identical names on the AK ballot under RCV); Aug 2026 piece \'South Carolina runoff to replace Lindsey Graham is state\'s 4th election in 11 weeks\' documenting the SC vacancy and Aug 25 runoff; resources include \'Data on RCV\' and exit-survey reports.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: 'Independently corroborates two tracker-relevant facts: (1) the AK two-Sullivans ballot behind the party-level AK rows, and (2) the SC seat vacancy/runoff context. This corroborates the seat context in irregularity #69 while leaving Rasmussen\'s biographical release framing itself flagged.',
    category: 'Ratings, forecasts & analysis',
  },
  {
    id: 'vote411-lwv',
    name: 'VOTE411 (League of Women Voters Education Fund)',
    type: 'Nonpartisan civic voter-information platform (personalized ballot lookup, registration check, polling-place finder, state voting-rules comparison)',
    url: 'https://www.vote411.org/',
    verified: 'Fetched 2026-09-21 (title \'VOTE411\'). Observed: \'Brought to you by the League of Women Voters Education Fund\'; tools \'See What\'s On Your Ballot\', \'Register to Vote\', \'Check Your Registration\'; nationwide \'Voting Rules\' comparison; Election Day protection hotlines 1-866-OUR-VOTE / 1-888-VE-Y-VOTA / 1-888-API-VOTE / 1-844-YALLA-US.',
    verifiedOn: TODAY,
    status: 'verified',
    notes: '501(c)(3) civic resource; admitted for the civic layer (voter-facing rules and ballot info), not as an election-results authority.',
    category: 'Ratings, forecasts & analysis',
  },
];

let added = 0, skipped = [];
const existingIds = new Set(master.sources.map((s) => s.id));
const existingUrls = new Set(master.sources.map((s) => s.url));
for (const e of ENTRIES) {
  if (existingIds.has(e.id)) { skipped.push(`id:${e.id}`); continue; }
  if (existingUrls.has(e.url)) { skipped.push(`url:${e.id}`); continue; }
  master.sources.push(e);
  added++;
}

if (added > 0) {
  // Recompute the category tally from the final source list (lint-verified cross-checks this).
  const counts = {};
  for (const s of master.sources) counts[s.category] = (counts[s.category] || 0) + 1;
  master.categories = master.categories.map((c) => ({ ...c, count: counts[c.name] ?? 0 }));
  for (const [name, n] of Object.entries(counts)) {
    if (!master.categories.some((c) => c.name === name)) master.categories.push({ name, count: n });
  }
  master.updated = TODAY;
  writeFileSync(PATH, JSON.stringify(master, null, 1) + '\n');
}

console.log(`append-master-2026-09-21-s11: ${added} added, ${skipped.length} skipped${skipped.length ? ' (' + skipped.join(', ') + ')' : ''}; master now ${master.sources.length} sources.`);
