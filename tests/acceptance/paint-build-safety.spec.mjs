import { test, expect } from "@playwright/test";

const BLOCKED_CASES = [
  {
    name: "unresolved interior moisture",
    scenario: "paint_interior_mould_damp",
    facts: { significant_moisture: true, source_known: false }
  },
  {
    name: "unsafe ETICS access",
    scenario: "insulation_external_etics",
    facts: { work_at_height: true, safe_access_confirmed: false }
  },
  {
    name: "unknown existing waterproofing compatibility",
    scenario: "waterproof_existing_system_maintenance",
    facts: { existing_waterproofing_compatible: false }
  },
  {
    name: "progressive or displaced crack",
    scenario: "repair_recurrent_or_large_wall_crack",
    facts: { crack_progressive_or_displaced: true }
  },
  {
    name: "roof ponding before drainage assessment",
    scenario: "waterproof_roof_standing_water",
    facts: { standing_water: true, drainage_or_falls_assessed: false }
  }
];

for (const blockedCase of BLOCKED_CASES) {
  test(`Paint & Build candidate API fails closed: ${blockedCase.name}`, async ({ request }) => {
    const params = new URLSearchParams({
      scenario: blockedCase.scenario,
      facts: JSON.stringify(blockedCase.facts),
      term: "Vitex"
    });
    const response = await request.get(`/api/build-studio/candidates?${params.toString()}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.products).toEqual([]);
    expect(body.technicalVerificationRequired).toBe(true);
    expect(body.guidanceBlocked).toBe(true);
  });
}

test("Paint & Build candidate API fails closed for an unreviewed scenario", async ({ request }) => {
  const params = new URLSearchParams({
    scenario: "unreviewed_route_must_not_select_products",
    facts: "{}",
    term: "Vitex"
  });
  const response = await request.get(`/api/build-studio/candidates?${params.toString()}`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.products).toEqual([]);
  expect(body.technicalVerificationRequired).toBe(true);
  expect(body.guidanceStatus).not.toBe("ready");
});
