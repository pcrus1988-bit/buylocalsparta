import type { NailMaterial } from "./nail-material-renderer.ts";
import { creativeMaterial } from "./nail-material-renderer";
/**
 * NYXI approximate AR nail geometry. Hand landmarks locate fingertips/joints,
 * not the exact nail cuticles: masks are estimates, not nail segmentation.
 */
export type NailShape = "oval" | "almond" | "squoval" | "square";
export type NailFinish = "gloss" | "soft" | "pearl" | "chrome" | "cat-eye";
export type NailLength = "short" | "medium" | "long";
export type Point = { x: number; y: number; z?: number };
export type NailPose = { x: number; y: number; angle: number; width: number; height: number; finger: number };
export type ArLook = { hex: string; shape: NailShape; finish: NailFinish; length: NailLength; opacity: number; fit: number; placement: number; material?: NailMaterial };
export type Projected = { width: number; height: number; imageWidth: number; imageHeight: number; mirror: boolean };

export const NAIL_JOINTS = [
  { tip: 4, dip: 3, pip: 2, finger: 0 },
  { tip: 8, dip: 7, pip: 6, finger: 1 },
  { tip: 12, dip: 11, pip: 10, finger: 2 },
  { tip: 16, dip: 15, pip: 14, finger: 3 },
  { tip: 20, dip: 19, pip: 18, finger: 4 },
] as const;

export function coverProjection(params: Projected) {
  const { width, height, imageWidth, imageHeight } = params;
  if (![width, height, imageWidth, imageHeight].every(Number.isFinite) || Math.min(width, height, imageWidth, imageHeight) <= 0) return null;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const cropX = (width - imageWidth * scale) / 2;
  const cropY = (height - imageHeight * scale) / 2;
  return { scale, cropX, cropY };
}

export function projectPoint(p: Point, params: Projected) {
  const crop = coverProjection(params);
  if (!crop) return { x: 0, y: 0 };
  const x = crop.cropX + p.x * params.imageWidth * crop.scale;
  return { x: params.mirror ? params.width - x : x, y: crop.cropY + p.y * params.imageHeight * crop.scale };
}

export function deriveNails(landmarks: Point[], params: Projected, length: NailLength, fit = 1, placement = 0): NailPose[] {
  if (!Array.isArray(landmarks) || landmarks.length < 21 || !coverProjection(params)) return [];
  const multipliers: Record<NailLength, number> = { short: 0.72, medium: 0.94, long: 1.15 };
  return NAIL_JOINTS.flatMap(({ tip, dip, pip, finger }) => {
    const a = landmarks[tip], b = landmarks[dip], c = landmarks[pip];
    if (![a, b, c].every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return [];
    const T = projectPoint(a, params), D = projectPoint(b, params), P = projectPoint(c, params);
    const dx = T.x - D.x, dy = T.y - D.y;
    const distal = Math.hypot(dx, dy);
    const proximal = Math.hypot(D.x - P.x, D.y - P.y);
    // Reject implausible projection (hand too small, too large or inaccurate tracking).
    if (distal < 7 || distal > 165 || proximal < 8 || proximal > 210) return [];
    const axisX = dx / distal, axisY = dy / distal;
    const width = distal * (finger === 0 ? 0.95 : 0.82) * Math.max(0.72, Math.min(1.25, fit));
    const height = distal * multipliers[length];
    const centerAlongTip = (length === "long" ? 0.3 : 0.40) + Math.max(-0.2, Math.min(0.2, placement));
    const centerX = T.x - axisX * distal * centerAlongTip;
    const centerY = T.y - axisY * distal * centerAlongTip;
    const angle = Math.atan2(axisX, -axisY);
    if (!Number.isFinite(angle) || width < 5 || height < 5) return [];
    return [{ x: centerX, y: centerY, angle, width, height, finger }];
  });
}

export function validShade(hex: string) { return /^#[0-9a-f]{6}$/i.test(hex); }

function traceNail(ctx: CanvasRenderingContext2D, width: number, height: number, shape: NailShape) {
  const x = width / 2, y = height / 2;
  const round = shape === "square" ? 0.09 : shape === "squoval" ? 0.24 : shape === "almond" ? 0.5 : 0.43;
  ctx.beginPath();
  ctx.moveTo(-x * 0.68, y);
  ctx.bezierCurveTo(-x, y * 0.73, -x, y * 0.2, -x, -y * (1 - round));
  if (shape === "almond") {
    ctx.bezierCurveTo(-x * 0.72, -y * 1.03, -x * 0.25, -y * 1.17, 0, -y * 1.18);
    ctx.bezierCurveTo(x * 0.25, -y * 1.17, x * 0.72, -y * 1.03, x, -y * (1 - round));
  } else {
    ctx.bezierCurveTo(-x, -y, -x * (1 - round), -y, 0, -y);
    ctx.bezierCurveTo(x * (1 - round), -y, x, -y, x, -y * (1 - round));
  }
  ctx.bezierCurveTo(x, y * 0.2, x, y * 0.73, x * 0.68, y);
  ctx.quadraticCurveTo(0, y * 1.16, -x * 0.68, y);
  ctx.closePath();
}

function rgba(hex: string, alpha: number) {
  const h = validShade(hex) ? hex : "#B52C4E";
  return "rgba(" + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(",") + "," + alpha + ")";
}

function drawPolish(ctx: CanvasRenderingContext2D, pose: NailPose, look: ArLook, t: number) {
  const { width: w, height: h, x, y, angle } = pose;
  const color = validShade(look.hex) ? look.hex : "#B52C4E";
  const material = look.material ?? creativeMaterial(look.finish, look.opacity);
  const strength = Math.max(0.10, Math.min(0.98, material.coverage));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = "rgba(46,12,35,0.11)";
  ctx.shadowBlur = Math.max(1, w * 0.05);
  ctx.shadowOffsetY = Math.max(0.5, h * 0.015);
  traceNail(ctx, w, h, look.shape);
  const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  body.addColorStop(0, rgba(color, strength * 0.80));
  body.addColorStop(0.22, rgba(color, strength * 0.95));
  body.addColorStop(0.54, rgba(color, strength * 0.96));
  body.addColorStop(1, rgba(color, strength * 0.82));
  ctx.fillStyle = body;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.save();
  ctx.clip();
  // Subtle curved edge and ridge shading make the lacquer read as a curved surface.
  const rim = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  rim.addColorStop(0, "rgba(38,12,32,0.11)");
  rim.addColorStop(0.18, "rgba(255,255,255,0.03)");
  rim.addColorStop(0.75, "rgba(255,255,255,0.06)");
  rim.addColorStop(1, "rgba(35,13,32,0.12)");
  ctx.fillStyle = rim;
  ctx.fillRect(-w, -h, w * 2, h * 2);

  if (material.reflectivity > 0.10 && material.kind !== "matte") {
    const gloss = ctx.createLinearGradient(-w * 0.35, -h * 0.4, w * 0.1, h * 0.3);
    gloss.addColorStop(0, "rgba(255,255,255,0)");
    gloss.addColorStop(0.44, "rgba(255,255,255," + (material.reflectivity * 0.50).toFixed(3) + ")");
    gloss.addColorStop(0.65, "rgba(255,255,255,0.035)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.ellipse(-w * 0.17, -h * 0.12, w * 0.10, h * 0.25, -0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  if (material.pearl > 0) {
    const pearl = ctx.createLinearGradient(-w * 0.5, 0, w * 0.5, 0);
    pearl.addColorStop(0, "rgba(240,225,250,0.01)");
    pearl.addColorStop(0.48, "rgba(250,236,250," + (material.pearl * 0.36).toFixed(3) + ")");
    pearl.addColorStop(1, "rgba(238,222,253,0.02)");
    ctx.fillStyle = pearl; ctx.fillRect(-w, -h, w * 2, h * 2);
  }
  if (material.chrome > 0 || material.magnetic > 0) {
    const power = Math.max(material.chrome, material.magnetic);
    const shift = Math.sin(t / 1000 + pose.finger * 0.12) * w * 0.06;
    const band = ctx.createLinearGradient(-w * 0.5 + shift, 0, w * 0.5 + shift, 0);
    band.addColorStop(0, "rgba(31,25,29," + (power * 0.16).toFixed(3) + ")");
    band.addColorStop(material.magnetic > 0 ? 0.48 : 0.26, "rgba(255,251,241," + (power * 0.34).toFixed(3) + ")");
    band.addColorStop(0.63, "rgba(255,255,255,0.02)");
    band.addColorStop(1, "rgba(38,26,38," + (power * 0.16).toFixed(3) + ")");
    ctx.fillStyle = band; ctx.fillRect(-w, -h, w * 2, h * 2);
  }
  if (material.glitter > 0) {
    // No unverified particle effects on sourced non-glitter polishes.
    ctx.fillStyle = "rgba(255,255,255," + (material.glitter * 0.25).toFixed(3) + ")";
    for (let i = 0; i < 14; i++) {
      const x = (Math.sin(i * 12.9898 + pose.finger * 3.1) * 0.5) * w * 0.7;
      const y = (Math.cos(i * 7.133 + pose.finger * 1.9) * 0.5) * h * 0.76;
      ctx.fillRect(x, y, Math.max(0.6, w * 0.012), Math.max(0.6, w * 0.012));
    }
  }
  // Matte is intentionally flat: only the body, low-reflection rim.
  ctx.restore();
  ctx.lineWidth = Math.max(0.8, w * .027);
  ctx.strokeStyle = material.kind === "matte" ? "rgba(99,49,62,0.10)" : "rgba(255,247,255,0.19)";
  traceNail(ctx, w, h, look.shape);
  ctx.stroke();
  ctx.restore();
}

export function drawArNails(ctx: CanvasRenderingContext2D, hands: Point[][], params: Projected, look: ArLook, timestamp: number) {
  if (!hands?.length) return 0;
  let painted = 0;
  for (const hand of hands.slice(0, 1)) {
    const nails = deriveNails(hand, params, look.length, look.fit, look.placement);
    nails.forEach(pose => { drawPolish(ctx, pose, look, timestamp); painted++; });
  }
  return painted;
}
