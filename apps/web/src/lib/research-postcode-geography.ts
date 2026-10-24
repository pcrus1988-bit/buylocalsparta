import "server-only";

// Guards against ever bundling the confidential postcode crosswalk in a client.
export { resolveResearchAdministrativeGeography, summarizeResearchPostcodeCells } from "./research-postcode-geography-core";
export type { ResearchAdministrativeGeography } from "./research-postcode-geography-core";
