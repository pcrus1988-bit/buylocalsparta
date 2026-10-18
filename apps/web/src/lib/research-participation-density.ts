import { greekRegionForPrefecture } from "./research-geographic-core.ts";

type PostcodePoint = Readonly<{ postcode: string; region?: string; latitude: number; longitude: number }>;
type LocationRow = Readonly<{ postcode: string; prefecture: string; started: number }>;

/** Build an anonymous continuous field on the server, using each postcode's
 * actual reference coordinates and count. No town grouping, medoid, coordinate
 * rounding or low-count exclusion. Only the smoothed raster leaves the server.
 * Postcode area centres do not identify exact business premises.
 */
export function participationHeatField(rows: readonly LocationRow[], points: readonly PostcodePoint[]) {
  const width = 324, height = 260, pixelSize = 2.5, sigma = 7;
  const values = new Float64Array(width * height);
  const lookup = new Map(points.map(point => [point.postcode, point]));
  let mapped = 0, unmatched = 0;
  for (const row of rows) {
    const code = row.postcode.replace(/\s/g, "");
    const point = /^[0-9]{5}$/.test(code) ? lookup.get(code) : undefined;
    const region = greekRegionForPrefecture(row.prefecture);
    if (!point || !region || (point.region && point.region !== region) || !Number.isFinite(point.latitude)
      || !Number.isFinite(point.longitude) || point.latitude < 34 || point.latitude > 43
      || point.longitude < 19 || point.longitude > 30) { unmatched += row.started; continue; }
    const x = (55 + (point.longitude - 19) * 65) / pixelSize;
    const y = (18 + (42 - point.latitude) * 78) / pixelSize;
    mapped += row.started;
    const radius = sigma * 3;
    for (let py = Math.max(0, Math.floor(y - radius)); py < Math.min(height, Math.ceil(y + radius)); py++) {
      for (let px = Math.max(0, Math.floor(x - radius)); px < Math.min(width, Math.ceil(x + radius)); px++) {
        const distanceSquared = (px + .5 - x) ** 2 + (py + .5 - y) ** 2;
        values[py * width + px] += row.started * Math.exp(-distanceSquared / (2 * sigma * sigma));
      }
    }
  }
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  const pixels = new Uint8Array(width * height * 4);
  const colors = [[105, 167, 114], [223, 194, 77], [226, 131, 43], [180, 50, 30]];
  for (let i = 0; i < values.length; i++) {
    const normalized = maximum > 0 ? Math.log1p(values[i]) / Math.log1p(maximum) : 0;
    const position = normalized * (colors.length - 1);
    const segment = Math.min(colors.length - 2, Math.floor(position));
    const blend = position - segment;
    for (let c = 0; c < 3; c++) pixels[i * 4 + c] = Math.round(colors[segment][c] * (1 - blend) + colors[segment + 1][c] * blend);
    pixels[i * 4 + 3] = Math.round(230 * Math.min(1, normalized * 3));
  }
  return { width, height, pixels, mapped, unmatched };
}
