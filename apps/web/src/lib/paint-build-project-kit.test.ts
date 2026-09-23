import { describe, expect, it } from "vitest";
import { choosePaintPackPlan, packLitres, PROJECT_ACCESSORY_RULES } from "./paint-build-project-kit";

describe("paint-build project kit", () => {
  it("normalizes litres and millilitres", () => {
    expect(packLitres(750, "ml")).toBe(0.75);
    expect(packLitres(3, "L")).toBe(3);
  });

  it("prefers a practical lower-cost pack plan instead of blindly minimizing surplus", () => {
    const plan = choosePaintPackPlan([
      { id: "075", title: "0.75 L", priceMinor: 899, packValue: 0.75, packUnit: "L" },
      { id: "3", title: "3 L", priceMinor: 2399, packValue: 3, packUnit: "L" },
      { id: "10", title: "10 L", priceMinor: 4499, packValue: 10, packUnit: "L" }
    ], 7.2);
    expect(plan).toBeDefined();
    expect(plan?.lines).toEqual([
      expect.objectContaining({ variant: expect.objectContaining({ id: "10" }), quantity: 1 })
    ]);
    expect(plan?.totalLitres).toBe(10);
  });

  it("does not recommend an absurd oversized pack when a near-size combination exists", () => {
    const plan = choosePaintPackPlan([
      { id: "1", title: "1 L", priceMinor: 800, packValue: 1, packUnit: "L" },
      { id: "10", title: "10 L", priceMinor: 900, packValue: 10, packUnit: "L" }
    ], 1.5);
    expect(plan?.totalLitres).toBe(2);
  });

  it("keeps accessory quantities independent from coating litres", () => {
    const roller = PROJECT_ACCESSORY_RULES.find((rule) => rule.key === "paint-roller");
    const tape = PROJECT_ACCESSORY_RULES.find((rule) => rule.key === "masking-tape");
    expect(roller?.quantityForArea(80)).toBe(1);
    expect(tape?.quantityForArea(80)).toBe(4);
  });
});
