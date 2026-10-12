import type { Point } from "./nail-ar-geometry";

/** Adaptive low-pass filter: steady hands get more smoothing; fast movement stays responsive.
 * Drops stale poses immediately when tracking is lost. Never extrapolates positions.
 */
export function smoothLandmarks(previous: Point[] | null, latest: Point[]): Point[] {
  if (latest.length < 21) return [];
  if (!previous || previous.length !== latest.length) return latest.map(p => ({ ...p }));
  return latest.map((p, i) => {
    const last = previous[i];
    const distance = Math.hypot(p.x - last.x, p.y - last.y);
    const alpha = distance > 0.06 ? 0.86 : distance > 0.025 ? 0.67 : 0.36;
    return {
      x: last.x + (p.x - last.x) * alpha,
      y: last.y + (p.y - last.y) * alpha,
      z: p.z === undefined ? undefined : (last.z ?? p.z) + (p.z - (last.z ?? p.z)) * alpha,
    };
  });
}
export function handTrackingUsable(hand: Point[]): boolean {
  if (!hand || hand.length < 21) return false;
  if (!hand.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  // Offscreen or physically collapsed hands are unreliable; prefer NO polish over a floating one.
  const values = hand.map(p => [p.x, p.y]).flat();
  if (Math.min(...values) < -0.05 || Math.max(...values) > 1.05) return false;
  const wrist = hand[0], index = hand[5], pinky = hand[17];
  const spread = Math.hypot(index.x - pinky.x, index.y - pinky.y);
  const handSize = Math.hypot(wrist.x - hand[9].x, wrist.y - hand[9].y);
  return spread > 0.035 && handSize > 0.065;
}
