/**
 * NYXI Agent 3 — PRIVATE sRGB D65 -> OKLab digital approximation.
 * Uncertainty bounds apply ONLY to a caller-assumed symmetric 8-bit sRGB
 * channel perturbation. They are NOT empirical shade, lighting, camera,
 * screen, material, colorimeter, or perceptual uncertainty calibration.
 * No product identity, source rights, evidence, review, or publication claim.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;
const RGB_TO_LMS = Object.freeze([
  Object.freeze([0.4122214708, 0.5363325363, 0.0514459929]),
  Object.freeze([0.2119034982, 0.6806995451, 0.1073969566]),
  Object.freeze([0.0883024619, 0.2817188376, 0.6299787005]),
]);
const LMS_TO_OKLAB = Object.freeze([
  Object.freeze([0.2104542553, 0.7936177850, -0.0040720468]),
  Object.freeze([1.9779984951, -2.4285922050, 0.4505937099]),
  Object.freeze([0.0259040371, 0.7827717662, -0.8086757660]),
]);
const fail = (ok, code) => { if (!ok) throw new TypeError(code); };
const linear = c => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const dot = (coefficients, values) => coefficients.reduce((acc, v, i) => acc + v * values[i], 0);
const lmsRoots = channels => {
  const rgb = channels.map(linear);
  return RGB_TO_LMS.map(row => Math.cbrt(Math.max(0, dot(row, rgb))));
};
const oklab = channels => {
  const roots = lmsRoots(channels);
  return LMS_TO_OKLAB.map(row => dot(row, roots));
};
const parse = (hex, error) => {
  fail(typeof hex === 'string' && HEX.test(hex), 'INVALID_DIGITAL_HEX');
  fail(typeof error === 'number' && Number.isInteger(error) && error >= 0 && error <= 255, 'INVALID_ASSUMED_CHANNEL_ERROR');
  return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
};
const intervals = (channels, error) => {
  const lo = lmsRoots(channels.map(v => Math.max(0, v - error)));
  const hi = lmsRoots(channels.map(v => Math.min(255, v + error)));
  const min = LMS_TO_OKLAB.map(row => row.reduce((s, c, i) => s + c * (c >= 0 ? lo[i] : hi[i]), 0));
  const max = LMS_TO_OKLAB.map(row => row.reduce((s, c, i) => s + c * (c >= 0 ? hi[i] : lo[i]), 0));
  return Object.freeze({min:Object.freeze(min), max:Object.freeze(max)});
};
export function approximatePrivateDigitalHexOklab(hex, assumedChannelError8bit) {
  const channels = parse(hex, assumedChannelError8bit);
  return Object.freeze({
    schema_version: 'nyxi-private-digital-hex-oklab-interval-v1',
    oklab_reference: Object.freeze(oklab(channels)),
    oklab_component_interval: intervals(channels, assumedChannelError8bit),
    assumed_channel_error_8bit: assumedChannelError8bit,
    source_color_space: 'sRGB D65',
    uncertainty_model: 'assumed_8bit_channel_perturbation_only',
    bounds_are_conservative_for_assumed_channel_error: true,
    uncertainty_empirically_calibrated: false,
    physical_shade_appearance_verified: false,
    provenance_verified: false,
    independently_reviewed: false,
    recommendation_authorized: false,
    publication_allowed: false,
    private_only: true,
  });
}
export function comparePrivateDigitalHexOklabIntervals(leftHex, leftError, rightHex, rightError) {
  const a = approximatePrivateDigitalHexOklab(leftHex, leftError);
  const b = approximatePrivateDigitalHexOklab(rightHex, rightError);
  const reference = Math.hypot(...a.oklab_reference.map((v, i) => v - b.oklab_reference[i]));
  let lower2 = 0, upper2 = 0;
  for (let i = 0; i < 3; i++) {
    const al = a.oklab_component_interval.min[i], ah = a.oklab_component_interval.max[i];
    const bl = b.oklab_component_interval.min[i], bh = b.oklab_component_interval.max[i];
    const gap = Math.max(0, al - bh, bl - ah);
    const span = Math.max(Math.abs(al - bh), Math.abs(ah - bl));
    lower2 += gap ** 2;
    upper2 += span ** 2;
  }
  return Object.freeze({
    schema_version: 'nyxi-private-digital-delta-oklab-interval-v1',
    delta_oklab_reference: reference,
    delta_oklab_lower_bound: Math.sqrt(lower2),
    delta_oklab_upper_bound: Math.sqrt(upper2),
    intervals_are_conservative_under_assumed_channel_error: true,
    uncertainty_empirically_calibrated: false,
    physical_shade_appearance_verified: false,
    provenance_verified: false,
    independently_reviewed: false,
    recommendation_authorized: false,
    publication_allowed: false,
    private_only: true,
  });
}
