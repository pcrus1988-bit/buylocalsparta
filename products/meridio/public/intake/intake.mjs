import {
  EVIDENCE_CATEGORIES, validateDossierFields, createAssetDossier,
  parseDossier, dossierReadiness
} from "/intake/dossier.mjs";

const form = document.getElementById("asset-form");
const status = document.getElementById("validation-message");
const name = document.getElementById("dossier-name");
const description = document.getElementById("dossier-status");
const exportButton = document.getElementById("export");
const filePicker = document.getElementById("import");
const clear = document.getElementById("clear");
const fields = ["assetName", "world", "location", "country", "legalEntity", "intendedUse", "custodyNotes"];
let currentDossier = null;

function say(message, invalid = false) {
  status.textContent = message;
  status.classList.toggle("error", invalid);
}
function extract() {
  const values = {};
  for (const field of fields) values[field] = form.elements.namedItem(field).value;
  values.evidence = [...document.querySelectorAll('#evidence-options input[type="checkbox"]:checked')].map((item) => item.value);
  return values;
}
function invalidate() {
  currentDossier = null;
  exportButton.disabled = true;
  name.textContent = "No dossier prepared";
  description.textContent = "Validate the current information to prepare a downloadable record.";
}
function renderDossier(dossier) {
  const readiness = dossierReadiness(dossier);
  currentDossier = dossier;
  exportButton.disabled = false;
  name.textContent = dossier.assetName;
  description.textContent =
    "Structured draft ready. " + readiness.acknowledgedCategories.length +
    " of " + EVIDENCE_CATEGORIES.length + " supporting-document categories declared. " +
    "No documents were uploaded or checked.";
  say("Validated locally. Choose Export JSON dossier to download your record. No server copy exists.");
}
function populate(dossier) {
  for (const field of fields) form.elements.namedItem(field).value = dossier[field] ?? "";
  const checked = new Set(dossier.evidence);
  document.querySelectorAll('#evidence-options input[type="checkbox"]').forEach((item) => {
    item.checked = checked.has(item.value);
  });
}

form.addEventListener("input", () => {
  if (currentDossier) {
    invalidate();
    say("Changes detected. Validate again before exporting.");
  }
});
form.addEventListener("change", () => {
  if (currentDossier) {
    invalidate();
    say("Changes detected. Validate again before exporting.");
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const validated = validateDossierFields(extract());
    if (!globalThis.crypto?.randomUUID) throw new Error("Secure browser UUID generation is unavailable");
    renderDossier(createAssetDossier(validated, {
      id: globalThis.crypto.randomUUID(),
      generatedAt: new Date().toISOString()
    }));
  } catch (error) {
    invalidate();
    say(error instanceof Error ? error.message : "Could not validate fields", true);
  }
});

exportButton.addEventListener("click", () => {
  if (!currentDossier) return;
  const serial = JSON.stringify(currentDossier, null, 2) + "\n";
  const blob = new Blob([serial], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "meridio-asset-" + currentDossier.id + ".json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    say("Export requested. Keep the downloaded file securely; MERIDIO has not saved it on a server.");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});

filePicker.addEventListener("change", async () => {
  const file = filePicker.files?.[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error("The selected file is too large (maximum 100 KB)");
    const imported = parseDossier(await file.text());
    populate(imported);
    renderDossier(imported);
    say("Saved dossier reopened locally. Review the fields before exporting a new copy.");
  } catch (error) {
    invalidate();
    say(error instanceof Error ? error.message : "Could not reopen the selected file", true);
  } finally {
    filePicker.value = "";
  }
});

clear.addEventListener("click", () => {
  if (!globalThis.confirm("Clear everything entered in this browser tab? This cannot be undone unless you exported a file.")) return;
  form.reset();
  invalidate();
  say("Form cleared. No server data was affected.");
});
