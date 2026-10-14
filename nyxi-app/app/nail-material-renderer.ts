import type { BrandPolishProfile, PolishMaterial } from "./brand-polishes";

export type NailMaterial = {
  kind: PolishMaterial;
  coverage: number;
  reflectivity: number;
  pearl: number;
  chrome: number;
  magnetic: number;
  glitter: number;
  source: "brand" | "creative";
};
export type CreativeFinish = "gloss" | "soft" | "pearl" | "chrome" | "cat-eye";
const clamp = (value: number, min = 0, max = 1) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

export function brandMaterial(profile: BrandPolishProfile): NailMaterial {
  // In branded mode: only the recorded product family is allowed.
  const kind = profile.material;
  return {
    source: "brand",
    kind,
    coverage: clamp(profile.coverage, 0.15, 0.98),
    reflectivity: clamp(profile.reflectivity, 0, 0.7),
    pearl: kind === "pearl" || kind === "shimmer" ? 0.28 : 0,
    chrome: kind === "chrome" ? 0.50 : 0,
    magnetic: kind === "cat-eye" ? 0.43 : 0,
    glitter: kind === "glitter" ? 0.3 : 0,
  };
}

export function creativeMaterial(finish: CreativeFinish, opacity: number): NailMaterial {
  // Creative effects are intentionally subdued so they do not look like plastic or cartoons.
  const kind: PolishMaterial = finish === "soft" ? "matte" : finish === "gloss" ? "cream" : finish;
  return {
    source: "creative",
    kind,
    coverage: clamp(opacity, 0.2, 0.96),
    reflectivity: finish === "soft" ? 0.06 : finish === "gloss" ? 0.4 : finish === "pearl" ? 0.29 : 0.32,
    pearl: finish === "pearl" ? 0.34 : 0,
    chrome: finish === "chrome" ? 0.56 : 0,
    magnetic: finish === "cat-eye" ? 0.54 : 0,
    glitter: 0,
  };
}
