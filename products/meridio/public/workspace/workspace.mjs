import { ASSET_CATEGORIES, evidenceReadiness, findAssets, previewAccessChecks, previewProposalOutcome, previewSlotSelection } from "/platform/model.mjs";
import { demoAssets, getExample } from "/platform/examples.mjs";

const registry = document.getElementById("asset-results");
const categoryInput = document.getElementById("asset-category");
const searchInput = document.getElementById("asset-search");
const empty = document.getElementById("no-assets");
const panel = document.getElementById("asset-panel");
const tabs = [...document.querySelectorAll(".tab")];
const possibleId = new URL(window.location.href).searchParams.get("asset");
let current = getExample(possibleId) || demoAssets[0];
let activeTab = "passport";
let hypotheticalChoice = null;
let selectedSlot = null;
let accessFlags = { verifiedIdentity: false, recordedRights: false, acceptedRules: false };

function escapeText(value) {
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, (char) => replacements[char]);
}

function selectAsset(id) {
  const next = getExample(id);
  if (!next) return;
  current = next;
  activeTab = "passport";
  hypotheticalChoice = null;
  selectedSlot = null;
  accessFlags = { verifiedIdentity: false, recordedRights: false, acceptedRules: false };
  const url = new URL(window.location.href);
  url.searchParams.set("asset", next.id);
  window.history.replaceState(null, "", url);
  render();
}

function renderRegistry() {
  const matching = findAssets(demoAssets, { query: searchInput.value, category: categoryInput.value });
  registry.innerHTML = matching.map((asset) =>
    '<button type="button" class="registry-item" role="listitem" data-id="' + escapeText(asset.id) + '" aria-current="' + String(asset.id === current.id) + '">' +
    '<span class="item-icon" aria-hidden="true">' + escapeText(asset.icon) + '</span>' +
    '<span class="item-main"><span class="item-title">' + escapeText(asset.name) + '</span><span class="item-category">' + escapeText(asset.category) + ' · Fictional</span></span>' +
    '<span class="item-arrow" aria-hidden="true">↗</span></button>'
  ).join("");
  registry.querySelectorAll("button[data-id]").forEach((button) => button.addEventListener("click", () => selectAsset(button.dataset.id)));
  empty.hidden = matching.length > 0;
}

function renderIdentity() {
  document.getElementById("detail-icon").textContent = current.icon;
  document.getElementById("detail-category").textContent = current.category;
  document.getElementById("detail-name").textContent = current.name;
  document.getElementById("detail-summary").textContent = current.summary;
  document.getElementById("detail-location").textContent = current.location;
  document.getElementById("detail-mode").textContent = current.accessMode;
}

function passportPanel() {
  return '<div class="panel-intro"><h3>Asset passport</h3><p>A structured place for identity, rights, operation and risk evidence. This sample contains no legally verified information.</p></div>' +
    '<div class="detail-grid">' +
    '<div class="detail-tile"><small>ASSET WORLD</small><strong>' + escapeText(current.category) + '</strong><p>Classification used for discovery and applicable rules.</p></div>' +
    '<div class="detail-tile"><small>INTENDED UTILITY</small><strong>' + escapeText(current.theme) + '</strong><p>Usage patterns vary by asset and governing contract.</p></div>' +
    '<div class="detail-tile"><small>PERMISSIONS MODEL</small><strong>Asset-specific rights</strong><p>Intended to be server-enforced once identity, entitlements and contracts are verified.</p></div>' +
    '<div class="detail-tile"><small>FINANCIAL OFFERING</small><strong>Unavailable</strong><p>' + escapeText(current.valueDisclosure) + '</p></div>' +
    '</div><div class="panel-callout"><strong>Prelaunch limitation:</strong> ' + escapeText(current.risk) + '</div>';
}

function utilizationPanel() {
  const result = previewAccessChecks(current, accessFlags);
  return '<div class="panel-intro"><h3>Use &amp; access</h3><p>Explore the policy conditions that could be evaluated for a real participant. Checking these boxes does not verify identity, confer rights or create bookings.</p></div>' +
    '<div class="preview-section"><h4>Hypothetical eligibility checklist</h4>' +
    '<label class="check-option"><input type="checkbox" data-flag="verifiedIdentity" ' + (accessFlags.verifiedIdentity ? "checked" : "") + '> Assume identity verification is complete</label>' +
    '<label class="check-option"><input type="checkbox" data-flag="recordedRights" ' + (accessFlags.recordedRights ? "checked" : "") + '> Assume asset-specific use rights are recorded</label>' +
    '<label class="check-option"><input type="checkbox" data-flag="acceptedRules" ' + (accessFlags.acceptedRules ? "checked" : "") + '> Assume governing use rules are accepted</label>' +
    '<div class="check-result" role="status" aria-live="polite"><strong>' + (result.hypotheticalEligible ? "All hypothetical checks satisfied" : "Hypothetical conditions not yet met") + '</strong>' +
    'This is an educational rules demonstration. Real access is always disabled in this release.</div></div>' +
    '<div class="preview-section"><h4>Illustrative utilization windows</h4><p>Choose a sample time block to see the scheduling concept. No dates, capacity, availability or reservations are attached.</p>' +
    '<div class="demo-slots">' + current.slots.map((slot) =>
      '<button type="button" class="demo-slot" data-slot="' + escapeText(slot.id) + '" aria-pressed="' + String(selectedSlot === slot.id) + '">' + escapeText(slot.label) + '</button>'
    ).join("") + '</div>' +
    (selectedSlot ? '<div class="panel-callout green" role="status">' + escapeText(previewSlotSelection(current, selectedSlot).message) + '</div>' : "") +
    '</div><div class="panel-callout">Important: No live access grants, bookings, payments or confirmations are supported.</div>';
}

function governancePanel() {
  const proposal = current.proposals[0];
  const outcome = previewProposalOutcome(proposal, hypotheticalChoice);
  const tally = outcome.tally;
  const percent = (value) => (100 * value / outcome.eligibleWeight).toFixed(1) + "%";
  return '<div class="panel-intro"><h3>Governance lab</h3><p>See how a hypothetical quorum and voting threshold could influence a proposal. The record is fictional; each scenario is recalculated without saving any vote.</p></div>' +
    '<div class="preview-section"><div class="eyebrow dark">SAMPLE RESOLUTION</div><h4>' + escapeText(proposal.title) + '</h4><p>' + escapeText(proposal.description) + '</p>' +
    '<div class="voting-math">' +
    '<div><small>QUORUM / TURNOUT</small><strong>' + escapeText(String(outcome.quorumPct)) + '%</strong></div>' +
    '<div><small>YES / DECISIVE VOTES</small><strong>' + escapeText(String(outcome.approvalPct)) + '%</strong></div>' +
    '<div><small>ILLUSTRATIVE RESULT</small><strong>' + (outcome.illustrativePass ? "Passes" : "Does not pass") + '</strong></div>' +
    '</div><div class="vote-bar" aria-hidden="true">' +
    '<span style="width:' + percent(tally.yes) + '"></span><span style="width:' + percent(tally.no) + '"></span><span style="width:' + percent(tally.abstain) + '"></span></div>' +
    '<p class="voting-legend">YES ' + tally.yes + ' · NO ' + tally.no + ' · ABSTAIN ' + tally.abstain + ' · eligible weight ' + proposal.eligibleWeight + '</p>' +
    '<p>Model rules: quorum at least ' + (proposal.quorumBps / 100).toFixed(2) + '% of eligible weight; approval at least ' +
    (proposal.approvalBps / 100).toFixed(2) + '% of yes/no votes. Abstentions count toward quorum but not the approval denominator.</p></div>' +
    '<div class="preview-section"><h4>What-if: add one fictional voting unit</h4>' +
    '<div class="vote-actions">' + ["yes", "no", "abstain"].map((choice) =>
      '<button class="vote-btn" type="button" data-scenario="' + choice + '" aria-pressed="' + String(hypotheticalChoice === choice) + '">' +
      (choice === "yes" ? "Yes" : choice === "no" ? "No" : "Abstain") + '</button>'
    ).join("") + '<button class="vote-btn" type="button" data-scenario="reset">Reset scenario</button></div>' +
    '<div class="panel-callout green" role="status">' + (hypotheticalChoice === null ? "Base fictitious tally shown." : "Scenario recalculated with one fictitious " + escapeText(hypotheticalChoice) + " unit.") +
    ' No real ballot was cast and nothing was stored.</div></div>';
}

function evidencePanel() {
  const readiness = evidenceReadiness(current);
  return '<div class="panel-intro"><h3>Evidence room</h3><p>An asset cannot progress to real participation without appropriately reviewed title, operator rules, disclosures and audit history.</p></div>' +
    '<div class="detail-grid">' +
    '<div class="detail-tile"><small>CHECKLIST RECORDS</small><strong>' + readiness.total + ' demonstration items</strong><p>There are no uploaded files or independently validated facts.</p></div>' +
    '<div class="detail-tile"><small>PUBLICATION GATE</small><strong>Locked</strong><p>Documentation and legal approval have not been completed.</p></div></div>' +
    '<div class="preview-section"><h4>Illustrative evidence checklist</h4><div class="document-list">' +
    current.documents.map((document) =>
      '<div class="document-row"><strong>' + escapeText(document.name) + '</strong><span class="document-status ' + escapeText(document.state) + '">' +
      (document.state === "reviewed_demo" ? "REVIEWED — MOCK" : document.state === "awaiting_review" ? "AWAITING REVIEW — MOCK" : "NOT PROVIDED") + '</span></div>'
    ).join("") +
    '</div></div><div class="panel-callout"><strong>Fail-closed:</strong> The demo never treats checklist completion as proof of ownership, title, regulatory eligibility or investment suitability. Review steps require authorized human approval and source evidence before any real listing.</div>';
}

function renderPanel() {
  const factories = { passport: passportPanel, utilization: utilizationPanel, governance: governancePanel, evidence: evidencePanel };
  panel.innerHTML = factories[activeTab]();
  panel.setAttribute("aria-labelledby", "tab-" + activeTab);
  panel.querySelectorAll("input[data-flag]").forEach((input) => input.addEventListener("change", (event) => {
    accessFlags[event.currentTarget.dataset.flag] = event.currentTarget.checked;
    renderPanel();
  }));
  panel.querySelectorAll("button[data-slot]").forEach((button) => button.addEventListener("click", () => {
    selectedSlot = button.dataset.slot;
    renderPanel();
  }));
  panel.querySelectorAll("button[data-scenario]").forEach((button) => button.addEventListener("click", () => {
    hypotheticalChoice = button.dataset.scenario === "reset" ? null : button.dataset.scenario;
    renderPanel();
  }));
}

function renderTabs() {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === activeTab;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

function render() {
  renderIdentity();
  renderRegistry();
  renderTabs();
  renderPanel();
}

ASSET_CATEGORIES.forEach((category) => {
  const option = document.createElement("option");
  option.value = category;
  option.textContent = category;
  categoryInput.append(option);
});

document.getElementById("total-assets").textContent = String(demoAssets.length);
searchInput.addEventListener("input", renderRegistry);
categoryInput.addEventListener("change", renderRegistry);
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    renderTabs();
    renderPanel();
  });
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const indexToFocus = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
      event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    tabs[indexToFocus].click();
    tabs[indexToFocus].focus();
  });
});

render();
