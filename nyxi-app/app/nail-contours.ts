/**
 * Precision mode: user-confirmed nail contours mapped into each fingertip's
 * moving local coordinate frame. Landmarks alone DO NOT locate cuticles.
 *
 * Contours are never uploaded and are scoped to the current session.
 */
import type { NailPose, Point } from "./nail-ar-geometry.ts";

export type NailContour = ReadonlyArray<Point>;
export type NailContours = Partial<Record<number, NailContour>>;
export const MIN_POINTS = 6;
export const MAX_POINTS = 24;

export function imagePointToLocal(point: Point, pose: NailPose): Point {
  const dx = point.x - pose.x, dy = point.y - pose.y;
  const cos = Math.cos(pose.angle), sin = Math.sin(pose.angle);
  return {
    x: (dx * cos + dy * sin) / pose.width,
    y: (-dx * sin + dy * cos) / pose.height,
  };
}

export function localPointToImage(point: Point, pose: NailPose): Point {
  const dx = point.x * pose.width, dy = point.y * pose.height;
  const cos = Math.cos(pose.angle), sin = Math.sin(pose.angle);
  return { x: pose.x + dx * cos - dy * sin, y: pose.y + dx * sin + dy * cos };
}

export function polygonSignedArea(points: NailContour): number {
  if (points.length < 3) return 0;
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

export function validContour(points: NailContour): boolean {
  if (points.length < MIN_POINTS || points.length > MAX_POINTS) return false;
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.98)) return false;
  const area = Math.abs(polygonSignedArea(points));
  if (area < 0.075 || area > 1.3) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.04) return false;
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return true;
}

export function contourInPose(contour: NailContour, pose: NailPose): Point[] {
  if (!validContour(contour)) return [];
  return contour.map(p => localPointToImage(p, pose));
}

export function boundsForNail(pose: NailPose, imageWidth: number, imageHeight: number) {
  const size = Math.max(pose.width * 3.4, pose.height * 2.4, 55);
  const width = Math.min(imageWidth, size), height = Math.min(imageHeight, size);
  const left = Math.max(0, Math.min(imageWidth - width, pose.x - width / 2));
  const top = Math.max(0, Math.min(imageHeight - height, pose.y - height / 2));
  return { left, top, width, height };
}

export function cropCanvasToImage(
  cropX: number, cropY: number, cropWidth: number, cropHeight: number,
  canvasWidth: number, canvasHeight: number,
  imageWidth: number, imageHeight: number,
): Point {
  return {
    x: cropX + Math.max(0, Math.min(1, canvasWidth)) * cropWidth,
    y: cropY + Math.max(0, Math.min(1, canvasHeight)) * cropHeight,
  };
}
