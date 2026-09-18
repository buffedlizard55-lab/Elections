#!/usr/bin/env node
/**
 * Run the market + poll backtests against verified outcomes and write
 * data/backtest-results.json. Deterministic; no network.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAllBacktests } from '../src/backtest.js';
import { runPollBacktest } from '../src/poll-backtest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const market = runAllBacktests();
const polls = runPollBacktest();

const out = {
  generatedAt: new Date().toISOString(),
  inputs: [
    { path: 'src/kalshi-data.js', source: 'https://api.elections.kalshi.com/trade-api/v2/historical/... (per-market capturedFrom fields inside)' },
    { path: 'data/polls/538-national-averages.csv', source: 'https://github.com/fivethirtyeight/data/blob/master/polls/2024-averages/presidential_general_averages_2024-09-12_uncorrected.csv' },
    { path: 'data/outcomes/verified-outcomes.json', source: 'FEC/Wikipedia-API/congress.gov (see per-outcome sources)' },
  ],
  note: 'Deterministic backtest of captured Kalshi 2024 markets vs official settlements, and 538 archived poll averages vs outcome. All inputs carry provenance (src/kalshi-data.js, data/polls/).',
  marketBacktest: market,
  pollBacktest: polls,
};

const dir = join(ROOT, 'data');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'backtest-results.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote data/backtest-results.json');
console.log('aggregate:', JSON.stringify(market.aggregate, null, 1));
console.log('poll anchor 2024-09-12 margin:', polls.anchorMargin, 'pp (final outcome +', polls.finalOutcomeMargin, 'pp)');
