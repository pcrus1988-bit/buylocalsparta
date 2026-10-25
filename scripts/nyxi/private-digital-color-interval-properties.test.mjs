/** NYXI Agent 3 — deterministic synthetic properties, NOT empirical calibration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { approximatePrivateDigitalHexLab as approx, comparePrivateDigitalHexLabIntervals as compare } from './private-digital-hex-lab-interval.mjs';

const samples = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#808080', '#0102FE', '#FE01A5', '#123456', '#ABCDEF'];
const errors = [0, 1, 8, 32, 255];
const channels = h => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
function corners(h, error) {
  const c = channels(h);
  const lo = c.map(x => Math.max(0, x - error));
  const hi = c.map(x => Math.min(255, x + error));
  return Array.from({length:8}, (_, bits) => hex(c.map((_, i) => (bits & (1 << i)) ? hi[i] : lo[i])));
}
const close = (a, b) => Math.abs(a-b) < 1e-9;

test('synthetic reference and each of eight RGB-box corners lie within conservative LAB component bounds', () => {
  let checked = 0;
  for (const h of samples) for (const e of errors) {
    const out = approx(h, e), {min, max} = out.lab_d65_component_interval;
    for (const point of [out.lab_d65_reference, ...corners(h, e).map(c => approx(c, 0).lab_d65_reference)]) {
      for (let k=0; k<3; k++) {
        assert(point[k] >= min[k]-1e-9 && point[k] <= max[k]+1e-9, `${h} ±${e}, component ${k}`);
        checked++;
      }
    }
  }
  assert.equal(checked, 1350);
});

test('larger assumed channel error never narrows component intervals', () => {
  for (const h of samples) {
    let previous;
    for (const e of errors) {
      const now = approx(h, e).lab_d65_component_interval;
      if (previous) for (let k=0; k<3; k++) {
        assert(now.min[k] <= previous.min[k]+1e-9);
        assert(now.max[k] >= previous.max[k]-1e-9);
      }
      previous = now;
    }
  }
});

test('delta-E76 interval contains every tested corner-pair distance and is symmetric', () => {
  const pairs = [['#FF0000',8,'#0000FF',4],['#123456',32,'#ABCDEF',8],['#000000',255,'#FFFFFF',0],['#808080',1,'#808080',1]];
  let checked = 0;
  for (const [a,ae,b,be] of pairs) {
    const d = compare(a,ae,b,be), swapped = compare(b,be,a,ae);
    for (const field of ['delta_e76_reference','delta_e76_lower_bound','delta_e76_upper_bound']) assert(close(d[field],swapped[field]));
    assert(d.delta_e76_lower_bound <= d.delta_e76_reference+1e-9);
    assert(d.delta_e76_upper_bound >= d.delta_e76_reference-1e-9);
    for (const ca of corners(a,ae)) for (const cb of corners(b,be)) {
      const x = approx(ca,0).lab_d65_reference, y = approx(cb,0).lab_d65_reference;
      const distance = Math.hypot(...x.map((v,i) => v-y[i]));
      assert(distance >= d.delta_e76_lower_bound-1e-9 && distance <= d.delta_e76_upper_bound+1e-9);
      checked++;
    }
  }
  assert.equal(checked, 256);
});

test('fail closed on non-finite or fractional assumed error, invalid digital HEX', () => {
  for (const e of [-1, 0.5, 256, NaN, Infinity, -Infinity, '1', null]) assert.throws(() => approx('#AABBCC', e), /INVALID_ASSUMED_CHANNEL_ERROR/);
  for (const h of ['#AABBCC00', '#ABC', 'AABBCC', '#GGGGGG', ' #AABBCC', null]) assert.throws(() => approx(h, 0), /INVALID_DIGITAL_HEX/);
});

test('synthetic arithmetic never claims provenance, review, calibration, recommendation or publication', () => {
  const a = approx('#AABBCC', 8), b = compare('#AABBCC',8,'#BBCCDD',4);
  for (const key of ['uncertainty_empirically_calibrated','physical_shade_appearance_verified','provenance_verified','independently_reviewed','publication_allowed']) assert.equal(a[key],false);
  for (const key of ['uncertainty_empirically_calibrated','physical_shade_appearance_verified','provenance_verified','independent_review_verified','recommendation_authorized','publication_allowed']) assert.equal(b[key],false);
  assert.equal(a.private_only,true); assert.equal(b.private_only,true);
});
