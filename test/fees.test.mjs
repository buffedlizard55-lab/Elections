import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takerFee, makerFee, roundUpToIncrement, seriesFeeConfig, registerSeriesFees } from '../src/fees.js';

test('taker fee: 100 contracts @ 0.50, M=1 -> 0.07*100*0.5*0.5 = 1.75', () => {
  assert.equal(takerFee({ count: 100, price: 0.5, series: 'PRES' }), 1.75);
});

test('taker fee: 10 contracts @ 0.30 -> 0.07*10*0.3*0.7 = 0.147', () => {
  assert.equal(takerFee({ count: 10, price: 0.3, series: 'CONTROLH' }), 0.147);
});

test('taker fee rounds UP to a centicent', () => {
  // 0.07 * 1 * 0.10 * 0.90 = 0.0063 -> fine; craft 0.07*C*P*(1-P) = 0.00017 -> 0.0002
  const fee = takerFee({ count: 1, price: 0.98, series: 'PRES' }); // 0.07*1*0.98*0.02 = 0.001372
  assert.ok(fee === 0.0014, `expected 0.0014 got ${fee}`);
});

test('taker fee is zero at price boundaries (0 or 1) and for zero count', () => {
  assert.equal(takerFee({ count: 10, price: 0, series: 'PRES' }), 0);
  assert.equal(takerFee({ count: 10, price: 1, series: 'PRES' }), 0);
  assert.equal(takerFee({ count: 0, price: 0.5, series: 'PRES' }), 0);
});

test('unknown series falls back to documented default M=1 and is labelled assumed', () => {
  const cfg = seriesFeeConfig('UNKNOWN');
  assert.equal(cfg.fee_multiplier, 1);
  assert.equal(cfg.assumed, true);
  assert.equal(takerFee({ count: 100, price: 0.5, series: 'UNKNOWN' }), 1.75);
});

test('roundUpToIncrement basic behavior', () => {
  assert.equal(roundUpToIncrement(1.0000), 1.0000);
  assert.equal(roundUpToIncrement(1.00001), 1.0001);
  assert.equal(roundUpToIncrement(0), 0);
  assert.equal(roundUpToIncrement(NaN), 0);
});

test('registry fee configs match the captured API values (M=1, quadratic)', () => {
  for (const s of ['PRES', 'CONTROLH', 'CONTROLS']) {
    const cfg = seriesFeeConfig(s);
    assert.equal(cfg.fee_multiplier, 1);
    assert.equal(cfg.fee_type, 'quadratic');
    assert.ok(cfg.capturedFrom.includes('api.elections.kalshi.com'));
  }
});

test('registerSeriesFees throws when multiplier/type is present without a numeric fee_multiplier', () => {
  assert.throws(() => registerSeriesFees({ BADSHAPE: { multiplier: 1, type: 'quadratic' } }), /fee_multiplier/);
});

test('registerSeriesFees accepts a numeric fee_multiplier and returns the count', () => {
  const n = registerSeriesFees({ ZZTESTFEE: { fee_type: 'quadratic', fee_multiplier: 1, capturedFrom: 'https://example.test/series' } });
  assert.equal(n, 1);
  assert.equal(seriesFeeConfig('ZZTESTFEE').fee_multiplier, 1);
  assert.equal(seriesFeeConfig('ZZTESTFEE').assumed, undefined);
});

test('a config that already has fee_multiplier is accepted even if multiplier/type are also present', () => {
  const n = registerSeriesFees({ ZZBOTH: { multiplier: 0, type: 'quadratic', fee_multiplier: 1, fee_type: 'quadratic' } });
  assert.equal(n, 1);
  assert.equal(seriesFeeConfig('ZZBOTH').fee_multiplier, 1);
});

test('maker fee defaults to M=0 and is not the captured taker multiplier', () => {
  registerSeriesFees({ ZZMAKER: { fee_type: 'quadratic', fee_multiplier: 1 } });
  const cfg = seriesFeeConfig('ZZMAKER');
  assert.equal(cfg.maker_multiplier, 0);
  assert.notEqual(cfg.maker_multiplier, cfg.fee_multiplier);
  assert.equal(cfg.makerMultiplierSource, 'schedule-default');
  assert.equal(makerFee({ count: 100, price: 0.5, series: 'ZZMAKER' }), 0);
  assert.equal(makerFee({ count: 100, price: 0.5, series: 'PRES' }), 0);
  assert.equal(makerFee({ count: 100, price: 0.5, series: 'UNKNOWN-MAKER' }), 0);
  // 0.0175 * 100 * 0.5 * 0.5 = 0.4375, only when the caller passes maker M explicitly
  assert.equal(makerFee({ count: 100, price: 0.5, series: 'ZZMAKER', makerMultiplier: 1 }), 0.4375);
});

test('quadratic_with_maker_fees without an explicit maker multiplier stays 0 and is labelled unstated', () => {
  registerSeriesFees({ ZZQWM: { fee_type: 'quadratic_with_maker_fees', fee_multiplier: 1 } });
  const cfg = seriesFeeConfig('ZZQWM');
  assert.equal(cfg.maker_multiplier, 0);
  assert.equal(cfg.makerMultiplierSource, 'unstated');
  assert.equal(makerFee({ count: 100, price: 0.5, series: 'ZZQWM' }), 0);
});
