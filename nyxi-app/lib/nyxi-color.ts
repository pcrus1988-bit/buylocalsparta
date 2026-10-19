/**
 * Device-referred sRGB -> OKLab conversion for approximate nail shade matching.
 * Reference: Björn Ottosson's 2020/2021 OKLab sRGB matrices.
 * A sampled screen pixel is NOT a calibrated manufacturer product swatch.
 * This module only compares colors supplied to it: it never infers product data
 * or manufactures a HEX code from a brand shade name.
 */
export type RGB = { r: number; g: number; b: number };
export type OKLab = readonly [l: number, a: number, b: number];

const clampByte = (v: number): number =>
  Number.isFinite(v) ? Math.max(0, Math.min(255, v)) : 0;

export function rgbFromHex(hex: string): RGB {
  if (!/^#[\da-f]{6}$/i.test(hex)) {
    throw new Error("invalid_hex_color");
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function oklabFromRgb({ r, g, b }: RGB): OKLab {
  const linear = (channel: number) => {
    const c = clampByte(channel) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = linear(r), G = linear(g), B = linear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

export function oklabDistance(left: OKLab, right: OKLab): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

/** Relative geometric distance; not a percent similarity or color guarantee. */
export function closestIllustrativeShades<T extends { hex: string }>(
  sample: RGB,
  shades: readonly T[],
  maxResults = 3,
): Array<T & { distance: number }> {
  const reference = oklabFromRgb(sample);
  return shades.map((shade) => ({
    ...shade,
    distance: oklabDistance(reference, oklabFromRgb(rgbFromHex(shade.hex))),
  })).sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(0, Math.trunc(maxResults)));
}
