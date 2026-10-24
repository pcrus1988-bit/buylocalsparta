import test from 'node:test';
import assert from 'node:assert/strict';
import { approximatePrivateDigitalHexLab as lab, comparePrivateDigitalHexLabIntervals as compare } from './private-digital-hex-lab-interval.mjs';

test('D65 sRGB primary reference and exact zero uncertainty', () => {
  const red = lab('#FF0000', 0);
  assert(Math.abs(red.lab_d65_reference[0] - 53.24) < 0.07);
  assert.deepEqual(red.lab_d65_reference, red.lab_d65_component_interval.min);
  assert.deepEqual(red.lab_d65_reference, red.lab_d65_component_interval.max);
});
test('reject malformed inputs', () => {
  assert.throws(() => lab('FF0000', 0), /INVALID_DIGITAL_HEX/);
  assert.throws(() => lab('#FF0000', -1), /INVALID_ASSUMED_CHANNEL_ERROR/);
});
test('interval bounds and private-only gates', () => {
  const d = compare('#FF0000', 8, '#0000FF', 4);
  assert(d.delta_e76_lower_bound <= d.delta_e76_reference);
  assert(d.delta_e76_upper_bound >= d.delta_e76_reference);
  assert.equal(d.publication_allowed, false);
  assert.equal(d.recommendation_authorized, false);
  assert.equal(d.uncertainty_empirically_calibrated, false);
});