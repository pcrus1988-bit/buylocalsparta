/**
 * NYXI Agent 3 — PRIVATE deterministic digital-color arithmetic only.
 * IEC 61966-2-1 sRGB -> linear RGB -> XYZ (D65) -> CIELAB (D65).
 * A caller-supplied 8-bit channel perturbation is an ASSUMPTION, not a
 * measured camera/lighting/printing/gel-nail uncertainty or calibration.
 * Evidence authorization, fragment hashes, source ancestry, and independent
 * review MUST be checked upstream; none are established by this module.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;
const WHITE = [0.95047, 1, 1.08883];
const MATRIX = Object.freeze([
  Object.freeze([0.4124564, 0.3575761, 0.1804375]),
  Object.freeze([0.2126729, 0.7151522, 0.0721750]),
  Object.freeze([0.0193339, 0.1191920, 0.9503041]),
]);
const delta = 6 / 29;
const f = t => t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
const linear = channel => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const xyz = channels => MATRIX.map(row => row.reduce((sum, coefficient, i) => sum + coefficient * linear(channels[i]), 0));
const lab = channels => {
  const [x, y, z] = xyz(channels);
  const fx = f(x / WHITE[0]), fy = f(y / WHITE[1]), fz = f(z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const freezeTriple = values => Object.freeze(values);
const fail = (valid, code) => { if (!valid) throw new TypeError(code); };
const parse = (hex, error) => {
  fail(typeof hex === 'string' && HEX.test(hex), 'INVALID_DIGITAL_HEX');
  fail(typeof error === 'number' && Number.isInteger(error) && error >= 0 && error <= 255, 'INVALID_ASSUMED_CHANNEL_ERROR');
  const channels = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
  return { channels, error };
};
const bounds = (channels, error) => {
  const lo = channels.map(x => Math.max(0, x - error));
  const hi = channels.map(x => Math.min(255, x + error));
  const [xl, yl, zl] = xyz(lo);
  const [xh, yh, zh] = xyz(hi);
  const fxl = f(xl / WHITE[0]), fxh = f(xh / WHITE[0]);
  const fyl = f(yl / WHITE[1]), fyh = f(yh / WHITE[1]);
  const fzl = f(zl / WHITE[2]), fzh = f(zh / WHITE[2]);
  // Interval arithmetic: monotone XYZ components; differences conservatively
  // bound even though X/Y/Z are correlated. No empirical error model implied.
  return Object.freeze({
    min: freezeTriple([116 * fyl - 16, 500 * (fxl - fyh), 200 * (fyl - fzh)]),
    max: freezeTriple([116 * fyh - 16, 500 * (fxh - fyl), 200 * (fyh - fzl)]),
  });
};
export function approximatePrivateDigitalHexLab(hex, assumedChannelError8bit) {
  const { channels, error } = parse(hex, assumedChannelError8bit);
  const interval = bounds(channels, error);
  return Object.freeze({
    schema_version: 'nyxi-private-digital-hex-lab-interval-v1',
    lab_d65_reference: freezeTriple(lab(channels)),
    lab_d65_component_interval: interval,
    assumed_channel_error_8bit: error,
    source_color_space: 'sRGB D65',
    bounds_are_conservative_for_assumed_channel_error: true,
    uncertainty_empirically_calibrated: false,
    physical_shade_appearance_verified: false,
    provenance_verified: false,
    independently_reviewed: false,
    publication_allowed: false,
    private_only: true,
  });
}
export function comparePrivateDigitalHexLabIntervals(leftHex, leftError8bit, rightHex, rightError8bit) {
  const a = approximatePrivateDigitalHexLab(leftHex, leftError8bit);
  const b = approximatePrivateDigitalHexLab(rightHex, rightError8bit);
  const reference = Math.hypot(...a.lab_d65_reference.map((v, i) => v - b.lab_d65_reference[i]));
  let lowerSquare = 0, upperSquare = 0;
  for (let i = 0; i < 3; i++) {
    const al = a.lab_d65_component_interval.min[i], ah = a.lab_d65_component_interval.max[i];
    const bl = b.lab_d65_component_interval.min[i], bh = b.lab_d65_component_interval.max[i];
    const gap = Math.max(0, al - bh, bl - ah);
    const span = Math.max(Math.abs(al - bh), Math.abs(ah - bl));
    lowerSquare += gap ** 2;
    upperSquare += span ** 2;
  }
  return Object.freeze({
    schema_version: 'nyxi-private-digital-delta-e76-interval-v1',
    delta_e76_reference: reference,
    delta_e76_lower_bound: Math.sqrt(lowerSquare),
    delta_e76_upper_bound: Math.sqrt(upperSquare),
    intervals_are_conservative_under_assumed_channel_error: true,
    uncertainty_empirically_calibrated: false,
    physical_shade_appearance_verified: false,
    provenance_verified: false,
    independent_review_verified: false,
    recommendation_authorized: false,
    publication_allowed: false,
    private_only: true,
  });
}
