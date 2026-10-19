/**
 * MERIDIO domain utilities, preview edition.
 * No rights, payments, identity assertions, allocations or votes are persisted.
 * Keep pure model rules separate from the presentation.
 */

export const ASSET_CATEGORIES = Object.freeze([
  "Real estate", "Hospitality", "Mobility", "Energy", "Agriculture",
  "Equipment", "Culture", "Sport & leisure", "Land", "Infrastructure"
]);

export const DEMO_STATUS = "illustrative_only";
export const VALID_EVIDENCE_STATES = Object.freeze(["missing", "awaiting_review", "reviewed_demo"]);

export function assertPreviewAsset(asset) {
  if (!asset || typeof asset !== "object") throw new TypeError("Asset object required");
  if (!/^demo-[a-z0-9-]+$/.test(asset.id || "")) throw new Error("Invalid demo asset ID");
  if (asset.status !== DEMO_STATUS) throw new Error("Cannot expose an active asset as preview data");
  if (!ASSET_CATEGORIES.includes(asset.category)) throw new Error("Unknown asset category");
  if (typeof asset.name !== "string" || !asset.name.trim()) throw new Error("Asset name required");
  if (!Array.isArray(asset.documents) || !Array.isArray(asset.proposals) || !Array.isArray(asset.slots))
    throw new Error("Invalid asset shape");
  if (asset.documents.some((doc) => !VALID_EVIDENCE_STATES.includes(doc.state))) throw new Error("Unknown evidence state");
  if (asset.proposals.some((proposal) => !validateProposal(proposal))) throw new Error("Invalid proposal");
  const ids = [asset.id, ...asset.documents.map((doc) => doc.id), ...asset.proposals.map((p) => p.id), ...asset.slots.map((slot) => slot.id)];
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate asset child ID");
  return true;
}

export function validateProposal(p) {
  if (!p || !p.id || !p.title || !p.tally) return false;
  const { yes, no, abstain } = p.tally;
  const counts = [yes, no, abstain, p.eligibleWeight, p.quorumBps, p.approvalBps];
  if (!counts.every(Number.isInteger)) return false;
  if (Math.min(...counts) < 0) return false;
  if (p.eligibleWeight === 0 || yes + no + abstain > p.eligibleWeight) return false;
  if (p.quorumBps > 10000 || p.approvalBps > 10000) return false;
  return true;
}

export function findAssets(assets, { query = "", category = "All worlds" } = {}) {
  const normalized = String(query).trim().toLocaleLowerCase("en");
  return assets.filter((asset) => {
    assertPreviewAsset(asset);
    const categoryOk = category === "All worlds" || category === asset.category;
    const haystack = [asset.name, asset.category, asset.summary, asset.theme].join(" ").toLocaleLowerCase("en");
    return categoryOk && (!normalized || haystack.includes(normalized));
  });
}

export function evidenceReadiness(asset) {
  assertPreviewAsset(asset);
  const total = asset.documents.length;
  const reviewed = asset.documents.filter((document) => document.state === "reviewed_demo").length;
  return { total, reviewed, missing: asset.documents.filter((d) => d.state === "missing").length, complete: false, label: "Illustrative checklist — not verified evidence" };
}

/**
 * Rules below illustrate possible eligibility evaluation only.
 * This function never grants real utilization rights; those would be verified
 * on a server from an authenticated, legally entitled participant's record.
 */
export function previewAccessChecks(asset, { verifiedIdentity = false, recordedRights = false, acceptedRules = false } = {}) {
  assertPreviewAsset(asset);
  const checks = [
    { label: "Identity verified", pass: verifiedIdentity === true },
    { label: "Asset-specific use rights recorded", pass: recordedRights === true },
    { label: "Use policy accepted", pass: acceptedRules === true }
  ];
  return {
    checks,
    hypotheticalEligible: checks.every((check) => check.pass),
    canBook: false,
    note: "This preview cannot check real eligibility or create reservations."
  };
}

export function previewSlotSelection(asset, slotId) {
  assertPreviewAsset(asset);
  const slot = asset.slots.find((candidate) => candidate.id === slotId);
  if (!slot) return { selected: false, reserved: false, message: "Choose an illustrative slot." };
  return { selected: true, reserved: false, slot, message: "Planning preview selected. No reservation has been created." };
}

/**
 * Governance thresholds expressed in basis points and weighted units.
 * Preview votes never mutate an underlying tally.
 * Abstentions count for quorum but not the yes/no approval denominator.
 */
export function previewProposalOutcome(proposal, scenario = null) {
  if (!validateProposal(proposal)) throw new Error("Invalid proposal");
  const tally = { ...proposal.tally };
  if (scenario !== null) {
    if (!["yes", "no", "abstain"].includes(scenario)) throw new Error("Invalid scenario");
    const turnout = tally.yes + tally.no + tally.abstain;
    if (turnout >= proposal.eligibleWeight) throw new Error("No hypothetical voting weight remaining");
    tally[scenario] += 1;
  }
  const turnout = tally.yes + tally.no + tally.abstain;
  const decided = tally.yes + tally.no;
  const quorumBps = Math.round((turnout / proposal.eligibleWeight) * 10000);
  const approvalBps = decided ? Math.round((tally.yes / decided) * 10000) : 0;
  const quorumMet = quorumBps >= proposal.quorumBps;
  const approvalMet = decided > 0 && approvalBps >= proposal.approvalBps;
  return {
    tally,
    turnout,
    eligibleWeight: proposal.eligibleWeight,
    quorumPct: +(quorumBps / 100).toFixed(2),
    approvalPct: +(approvalBps / 100).toFixed(2),
    quorumMet,
    approvalMet,
    scenario,
    illustrativePass: quorumMet && approvalMet,
    binding: false
  };
}
