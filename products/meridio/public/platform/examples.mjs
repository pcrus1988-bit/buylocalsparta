import { DEMO_STATUS, assertPreviewAsset } from "./model.mjs";

/**
 * Entirely synthetic demonstration fixtures. They describe no actual property,
 * owner, business, entitlement, investment product or real location.
 */
const templates = [
  ["demo-harbour-house", "Harbour House", "Real estate", "⌂", "A shared coastal residence concept with structured use windows.", "Coastal area · fictional", "Residential stays", "Calendar-based", "Private residence and shared access arrangements require legal review."],
  ["demo-olive-retreat", "Olive Retreat", "Hospitality", "✳", "An intimate guesthouse concept with transparent operating governance.", "Rural area · fictional", "Guest stays", "Reservation-based", "Hospitality permissions, operator responsibilities and consumer protections remain unverified."],
  ["demo-electric-fleet", "Electric Fleet", "Mobility", "↗", "A pooled mobility concept with member-access scheduling and maintenance oversight.", "Urban area · fictional", "Vehicle access", "Time-slot-based", "Insurance, licensing and asset custody would need contractual approval."],
  ["demo-solar-cooperative", "Solar Field", "Energy", "☼", "A hypothetical renewable-energy installation and member decision model.", "Regional area · fictional", "Energy infrastructure", "Infrastructure access", "Energy distribution and commercial rights require sector-specific review."],
  ["demo-olive-grove", "Olive Grove", "Agriculture", "❋", "An illustrative agricultural asset for shared stewardship and equipment use.", "Countryside · fictional", "Agricultural utilization", "Seasonal schedule", "Land title, agricultural permits and operating liabilities are unverified."],
  ["demo-makers-lab", "Makers Lab", "Equipment", "⚙", "A shared workshop-equipment concept with supervised access and training.", "Workshop area · fictional", "Equipment time", "Session-based", "Operator training, equipment safety and liability coverage are prerequisites."],
  ["demo-community-arena", "Community Arena", "Sport & leisure", "◎", "A facility concept connecting community access and structured decisions.", "Community area · fictional", "Facility access", "Activity sessions", "Facility licensing, safeguarding and safety procedures require validation."],
  ["demo-local-heritage", "Heritage Studio", "Culture", "◇", "A conceptual cultural space for preservation, programming and access.", "Historic area · fictional", "Event participation", "Event calendar", "Conservation rules, cultural rights and public access need jurisdictional approval."]
];

function buildExample(row, index) {
  const [id, name, category, icon, summary, location, theme, accessMode, risk] = row;
  const proposal = {
    id: id + "-proposal",
    title: index % 2 === 0 ? "Review the annual access calendar" : "Adopt the proposed maintenance protocol",
    description: index % 2 === 0
      ? "Illustrative resolution on how shared use windows could be approved."
      : "Illustrative resolution on how safety and maintenance reviews could be governed.",
    quorumBps: 6000,
    approvalBps: 6667,
    eligibleWeight: 100,
    tally: index % 2 === 0
      ? { yes: 56, no: 22, abstain: 12 }
      : { yes: 32, no: 25, abstain: 12 }
  };
  return {
    id, name, category, icon, summary, location, theme, accessMode, risk,
    status: DEMO_STATUS,
    valueDisclosure: "No price, valuation, returns or ownership interests are offered.",
    documentationNotice: "Synthetic evidence checklist, not verified documents.",
    documents: [
      { id: id + "-title", name: "Title / legal control", state: "missing" },
      { id: id + "-ops", name: "Operating and utilization policy", state: "awaiting_review" },
      { id: id + "-risk", name: "Risk and disclosure document", state: "missing" },
      { id: id + "-policy", name: "Governance terms", state: "reviewed_demo" }
    ],
    slots: [
      { id: id + "-am", label: "09:00–12:00", availability: "Illustration" },
      { id: id + "-mid", label: "12:00–15:00", availability: "Illustration" },
      { id: id + "-pm", label: "15:00–18:00", availability: "Illustration" }
    ],
    proposals: [proposal]
  };
}
export const demoAssets = Object.freeze(templates.map(buildExample));
demoAssets.forEach(assertPreviewAsset);

export function getExample(id) {
  return demoAssets.find((asset) => asset.id === id) || null;
}
