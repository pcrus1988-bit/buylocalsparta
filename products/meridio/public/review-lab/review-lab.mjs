import {
  createReviewDemo, reviewBlockers, reviewPermissions, simulateReviewTransition
} from "/platform/review.mjs";

const id = (name) => document.getElementById(name);
let tenantKey = "alpha";
let review = createReviewDemo(tenantKey);
let actorId = review.members[0].id;

function text(node, value) {
  node.textContent = String(value);
}
function setMessage(message, isError = false) {
  const el = id("action-message");
  el.textContent = message;
  el.classList.toggle("error", isError);
}

const ACTIONS = [
  { kind: "request_review", label: "Submit for review", permission: "canRequestReview" },
  { kind: "approve", label: "Approve sample asset", permission: "canApprove" },
  { kind: "reject", label: "Reject sample asset", permission: "canReject" },
  { kind: "mark_publish_ready", label: "Mark preview publish-ready", permission: "canMarkReady" },
  { kind: "suspend", label: "Suspend sample asset", permission: "canSuspend" }
];

function runAction(action, evidenceId) {
  try {
    review = simulateReviewTransition(review, {
      actorId, action, evidenceId, expectedSequence: review.history.length
    });
    render();
    setMessage("Simulated action recorded in this browser only. No real data or rights were changed.");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Action rejected", true);
  }
}

function render() {
  const asset = review.asset;
  const permissions = reviewPermissions(review, actorId);
  text(id("asset-name"), asset.name);
  text(id("asset-world"), asset.category + " · Fictional concept");
  text(id("asset-jurisdiction"), asset.jurisdiction + " (mock)");
  text(id("asset-disclosure"), asset.disclosureVersion);
  text(id("asset-approval"), asset.approvedBy ? "Simulated approval" : "Not approved");
  text(id("asset-stage"), asset.stage.replaceAll("_", " ").toUpperCase());
  text(id("evidence-summary"),
    asset.evidence.filter((entry) => entry.state === "reviewed_mock").length +
    " / " + asset.evidence.length + " mock-reviewed");

  const documents = id("evidence-list");
  documents.replaceChildren();
  for (const item of asset.evidence) {
    const row = document.createElement("div");
    row.className = "evidence-row";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    const label = document.createElement("span");
    text(title, item.label);
    text(label, item.mockEvidenceLabel + " · not an uploaded file");
    info.append(title, label);
    row.append(info);
    if (item.state === "reviewed_mock") {
      const status = document.createElement("span");
      status.className = "document-status done";
      text(status, "REVIEWED — MOCK");
      row.append(status);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      text(button, "Verify mock evidence ↗");
      button.disabled = !permissions.canVerify;
      button.addEventListener("click", () => runAction("verify_document", item.id));
      row.append(button);
    }
    documents.append(row);
  }

  const actions = id("review-actions");
  actions.replaceChildren();
  for (const item of ACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    text(button, item.label);
    button.disabled = !permissions[item.permission];
    button.addEventListener("click", () => runAction(item.kind));
    actions.append(button);
  }

  const blockerList = id("blockers");
  blockerList.replaceChildren();
  const blockers = reviewBlockers(review);
  for (const blocker of blockers.length ? blockers : ["All simulated evidence requirements satisfied. Still NOT legally verified."]) {
    const li = document.createElement("li");
    text(li, blocker);
    blockerList.append(li);
  }

  const audit = id("audit-events");
  audit.replaceChildren();
  if (!review.history.length) {
    const empty = document.createElement("li");
    empty.className = "empty-audit";
    text(empty, "No fictional actions yet.");
    audit.append(empty);
  }
  for (const event of review.history.toReversed()) {
    const li = document.createElement("li");
    const head = document.createElement("strong");
    const meta = document.createElement("span");
    text(head, "#" + event.sequence + " · " + event.action.replaceAll("_", " "));
    text(meta, event.detail + " · " + event.role + " · prev #" + event.prevSequence);
    li.append(head, meta);
    audit.append(li);
  }
}

function setTenant(nextTenant) {
  tenantKey = nextTenant;
  review = createReviewDemo(nextTenant);
  const selector = id("actor");
  selector.replaceChildren();
  for (const member of review.members) {
    const option = document.createElement("option");
    option.value = member.id;
    option.textContent = member.display + " (fictional)";
    selector.append(option);
  }
  actorId = review.members[0].id;
  render();
  setMessage("Fictional tenant switched. Simulation was reset; no cross-tenant state was carried over.");
}

id("tenant").addEventListener("change", (event) => setTenant(event.target.value));
id("actor").addEventListener("change", (event) => {
  actorId = event.target.value;
  render();
  setMessage("Demo actor switched. This is not a login or authorization.");
});
id("reset").addEventListener("click", () => setTenant(tenantKey));
setTenant("alpha");
