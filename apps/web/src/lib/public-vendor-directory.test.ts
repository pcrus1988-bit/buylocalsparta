import { describe, expect, it } from "vitest";
import type { PublicVendorDirectoryEntry } from "./public-vendor-directory";

describe("public vendor directory status contract", () => {
  it("keeps research entries distinct from partners", () => {
    const research: PublicVendorDirectoryEntry = {
      id: "vendor_research_census_0001",
      name: "Research merchant",
      categoryCodes: [],
      researchCategory: "Agricultural supplies & machinery",
      canonicalCount: 0,
      directoryStatus: "research",
      demo: false
    };
    expect(research.directoryStatus).toBe("research");
    expect(research.canonicalCount).toBe(0);
    expect(research.adviser).toBeUndefined();
  });
});
