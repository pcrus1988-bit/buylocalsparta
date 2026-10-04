"use client";

import { useEffect, useMemo, useState } from "react";

type Activity = Readonly<{ id: string; descr: string; descrEn?: string; kadVersion?: string }>;
type ActivityGroup = Readonly<{ id: string; label: string; description: string; activityCount: number }>;
type ExportField = Readonly<{ id: string; label: string; category: string; categoryLabel: string }>;
type Prefecture = Readonly<{ id: string; descr: string; descrEn?: string }>;
type Municipality = Readonly<{ id: string; prefectureId: string; descr: string; descrEn?: string }>;
type Metadata = Readonly<{
  activities: readonly Activity[];
  activityGroups: readonly ActivityGroup[];
  exportFields: readonly ExportField[];
  prefectures: readonly Prefecture[];
  municipalities: readonly Municipality[];
  fetchedAt: number;
}>;
type PreviewRow = Readonly<{
  gemiNumber: string;
  afm: string;
  legalName: string;
  tradingNames: string;
  status: string;
  prefecture: string;
  municipality: string;
  city: string;
  postcode: string;
  email: string;
  website: string;
  matchedActivities: string;
  matchedGroups: string;
}>;
type Preview = Readonly<{
  totalCount: number;
  returned: number;
  withEmail: number;
  activityCount: number;
  rows: readonly PreviewRow[];
}>;

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR");
}

function kadVersionLabel(value?: string): string {
  const version = value?.trim().toLocaleLowerCase("en") ?? "";
  if (version.includes("2026")) return "ΚΑΔ 2026";
  if (version.includes("2008")) return "ΚΑΔ 2008";
  return value ? `ΚΑΔ ${value}` : "ΓΕΜΗ δραστηριότητα";
}

function activityLabel(activity: Activity): string {
  return `${activity.id} · ${activity.descr}${activity.kadVersion ? ` · ${kadVersionLabel(activity.kadVersion)}` : ""}`;
}

const EXPORT_FIELD_PRESETS = [
  {
    id: "crm",
    label: "CRM / outreach",
    fields: [
      "gemi_number", "afm", "legal_name_el", "trade_names_el", "company_status",
      "prefecture", "municipality", "city", "postcode",
      "email", "phone", "website",
      "matched_activity_codes", "matched_activity_descriptions", "matched_kad_groups"
    ]
  },
  {
    id: "contact",
    label: "Επικοινωνία",
    fields: [
      "gemi_number", "afm", "legal_name_el", "trade_names_el",
      "email", "phone", "website"
    ]
  },
  {
    id: "basic",
    label: "Βασικά στοιχεία",
    fields: [
      "gemi_number", "afm", "legal_name_el", "trade_names_el", "company_status",
      "legal_type", "prefecture", "municipality", "city"
    ]
  },
  {
    id: "activity",
    label: "ΚΑΔ / δραστηριότητες",
    fields: [
      "gemi_number", "afm", "legal_name_el",
      "activity_codes", "activity_descriptions", "activity_types",
      "matched_activity_codes", "matched_activity_descriptions", "matched_kad_groups"
    ]
  }
] as const;

const TRANSIENT_DB_CONNECT_ERROR = /timeout exceeded when trying to connect|too many clients|remaining connection slots|connection terminated/i;

async function gemiJson<T>(url: string): Promise<{ response: Response; payload: T & { error?: string } }> {
  let response!: Response;
  let payload!: T & { error?: string };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin"
    });
    payload = await response.json() as T & { error?: string };
    if (
      response.ok ||
      attempt === 1 ||
      !TRANSIENT_DB_CONNECT_ERROR.test(payload.error ?? "")
    ) return { response, payload };
    await new Promise((resolve) => window.setTimeout(resolve, 450));
  }
  return { response, payload };
}

export function AdminGemiExporter() {
  const [metadata, setMetadata] = useState<Metadata>();
  const [metadataError, setMetadataError] = useState("");
  const [kadQuery, setKadQuery] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<Activity>();
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>([]);
  const [prefectureId, setPrefectureId] = useState("");
  const [municipalityId, setMunicipalityId] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [preview, setPreview] = useState<Preview>();
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    gemiJson<Metadata>("/api/admin/gemi/metadata")
      .then(({ response, payload }) => {
        if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατή η φόρτωση των φίλτρων ΓΕΜΗ.");
        if (!cancelled) {
          setMetadata(payload);
          setSelectedExportFields(payload.exportFields.map((field) => field.id));
        }
      })
      .catch((error) => {
        if (!cancelled) setMetadataError(error instanceof Error ? error.message : "Δεν ήταν δυνατή η φόρτωση των φίλτρων ΓΕΜΗ.");
      });
    return () => { cancelled = true; };
  }, []);

  const matchingActivities = useMemo(() => {
    if (!metadata) return [];
    const needle = normalizeSearch(kadQuery.trim());
    if (!needle || selectedActivity) return [];
    return metadata.activities
      .filter((activity) => normalizeSearch(`${activity.id} ${activity.descr} ${activity.descrEn ?? ""} ${activity.kadVersion ?? ""}`).includes(needle))
      .slice(0, 60);
  }, [kadQuery, metadata, selectedActivity]);

  const municipalities = useMemo(() => {
    if (!metadata || !prefectureId) return [];
    return metadata.municipalities.filter((item) => item.prefectureId === prefectureId);
  }, [metadata, prefectureId]);

  const selectedPrefecture = metadata?.prefectures.find((item) => item.id === prefectureId);
  const selectedMunicipality = municipalities.find((item) => item.id === municipalityId);
  const exportFieldCategories = useMemo(() => {
    if (!metadata) return [];
    const groups = new Map<string, { label: string; fields: ExportField[] }>();
    for (const field of metadata.exportFields) {
      const group = groups.get(field.category) ?? { label: field.categoryLabel, fields: [] };
      group.fields.push(field);
      groups.set(field.category, group);
    }
    return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
  }, [metadata]);
  const selectedGroups = useMemo(
    () => metadata?.activityGroups.filter((group) => selectedGroupIds.includes(group.id)) ?? [],
    [metadata, selectedGroupIds]
  );
  const hasSelection = Boolean(selectedActivity || selectedGroupIds.length);
  const selectionSummary = [
    ...selectedGroups.map((group) => group.label),
    ...(selectedActivity ? [`ΚΑΔ ${selectedActivity.id}`] : [])
  ].join(" · ");

  function queryString(includeExportFields = false) {
    if (!hasSelection) return "";
    const query = new URLSearchParams({ activeOnly: String(activeOnly) });
    if (selectedActivity) query.set("activity", selectedActivity.id);
    if (selectedGroupIds.length) query.set("groups", selectedGroupIds.join(","));
    if (prefectureId) query.set("prefecture", prefectureId);
    if (municipalityId) query.set("municipality", municipalityId);
    if (includeExportFields && selectedExportFields.length) query.set("fields", selectedExportFields.join(","));
    return query.toString();
  }

  async function runPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = queryString();
    if (!query) return;
    setBusy(true);
    setPreview(undefined);
    setPreviewError("");
    try {
      const { response, payload } = await gemiJson<{ preview?: Preview }>(`/api/admin/gemi/preview?${query}`);
      if (!response.ok || !payload.preview) throw new Error(payload.error ?? "Η αναζήτηση ΓΕΜΗ απέτυχε.");
      setPreview(payload.preview);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Η αναζήτηση ΓΕΜΗ απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  function chooseActivity(activity: Activity) {
    setSelectedActivity(activity);
    setKadQuery(activityLabel(activity));
    setPreview(undefined);
    setPreviewError("");
  }

  function resetActivity() {
    setSelectedActivity(undefined);
    setKadQuery("");
    setPreview(undefined);
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((current) => current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId]);
    setPreview(undefined);
    setPreviewError("");
  }

  function resetGroups() {
    setSelectedGroupIds([]);
    setPreview(undefined);
    setPreviewError("");
  }

  function toggleExportField(fieldId: string) {
    setSelectedExportFields((current) => current.includes(fieldId)
      ? current.filter((id) => id !== fieldId)
      : [...current, fieldId]);
  }

  function setExportCategory(category: string, selected: boolean) {
    if (!metadata) return;
    const categoryIds = metadata.exportFields.filter((field) => field.category === category).map((field) => field.id);
    setSelectedExportFields((current) => {
      const currentSet = new Set(current);
      for (const id of categoryIds) selected ? currentSet.add(id) : currentSet.delete(id);
      return metadata.exportFields.map((field) => field.id).filter((id) => currentSet.has(id));
    });
  }

  function applyExportPreset(fields: readonly string[]) {
    if (!metadata) return;
    const allowed = new Set(fields);
    setSelectedExportFields(metadata.exportFields.map((field) => field.id).filter((id) => allowed.has(id)));
  }

  function selectAllExportFields() {
    setSelectedExportFields(metadata?.exportFields.map((field) => field.id) ?? []);
  }

  const downloadQuery = queryString(true);

  return <div className="gemi-export-workspace">
    <form className="gemi-export-card" onSubmit={(event) => void runPreview(event)}>
      <div className="gemi-export-card-head">
        <div>
          <span>1 · Κριτήρια ΓΕΜΗ</span>
          <strong>Επίλεξε ομάδα ΚΑΔ ή συγκεκριμένο ΚΑΔ και περιοχή</strong>
          <small>Οι ομάδες μεταφράζονται live σε τρέχοντες ΚΑΔ 2026 από τα επίσημα metadata του ΓΕΜΗ. Μπορείς να επιλέξεις πολλές ομάδες και προαιρετικά να προσθέσεις έναν συγκεκριμένο ΚΑΔ.</small>
        </div>
        {metadata && <span className="status-pill">{metadata.activities.length.toLocaleString("el-GR")} τρέχοντες ΚΑΔ</span>}
      </div>

      {metadataError && <div className="workspace-inline-note form-error" role="alert">{metadataError}</div>}

      <div className="gemi-group-section">
        <div className="gemi-group-section-head">
          <div>
            <strong>Ομάδες ΚΑΔ</strong>
            <small>Πολλαπλή επιλογή · οι ομάδες λειτουργούν ως ένωση (ANY). Τα αποτελέσματα αποδιπλοποιούνται από το ίδιο το ΓΕΜΗ.</small>
          </div>
          {selectedGroupIds.length > 0 && <button className="button button-secondary" type="button" onClick={resetGroups}>Καθαρισμός ομάδων</button>}
        </div>
        <div className="gemi-group-grid" aria-label="Ομάδες ΚΑΔ">
          {metadata?.activityGroups.map((group) => {
            const checked = selectedGroupIds.includes(group.id);
            return <label className={`gemi-group-option${checked ? " selected" : ""}`} key={group.id}>
              <input type="checkbox" checked={checked} onChange={() => toggleGroup(group.id)} />
              <span>
                <strong>{group.label}</strong>
                <small>{group.description}</small>
                <em>{group.activityCount.toLocaleString("el-GR")} ΚΑΔ 2026</em>
              </span>
            </label>;
          })}
          {!metadata && !metadataError && <div className="gemi-group-loading">Φόρτωση ομάδων ΚΑΔ…</div>}
        </div>
      </div>

      <div className="gemi-filter-grid">
        <label className="gemi-kad-picker">
          <span>Συγκεκριμένος ΚΑΔ <small>(προαιρετικά)</small></span>
          <div className="gemi-kad-input-row">
            <input
              value={kadQuery}
              onChange={(event) => {
                setKadQuery(event.target.value);
                setSelectedActivity(undefined);
                setPreview(undefined);
              }}
              placeholder="Γράψε κωδικό ή περιγραφή ΚΑΔ…"
              disabled={!metadata}
              autoComplete="off"
            />
            {selectedActivity && <button className="button button-secondary" type="button" onClick={resetActivity}>Αλλαγή</button>}
          </div>
          {!selectedActivity && kadQuery.trim() && <div className="gemi-kad-results" role="listbox" aria-label="Αποτελέσματα ΚΑΔ">
            {matchingActivities.length ? matchingActivities.map((activity) => <button
              type="button"
              role="option"
              className="gemi-kad-result"
              key={`${activity.kadVersion ?? "unknown"}:${activity.id}`}
              onClick={() => chooseActivity(activity)}
            >
              <strong>{activity.id}</strong>
              <span>{activity.descr}</span>
              <small>{kadVersionLabel(activity.kadVersion)}</small>
            </button>) : <div className="gemi-kad-empty">Δεν βρέθηκε τρέχων ΚΑΔ 2026 με αυτή την αναζήτηση. Οι ιστορικοί ΚΑΔ 2008 δεν χρησιμοποιούνται στην τρέχουσα αναζήτηση επιχειρήσεων ΓΕΜΗ.</div>}
          </div>}
          {selectedActivity && <small className="gemi-selection-confirmed">Επιλεγμένο: {selectedActivity.id} · {selectedActivity.descr}</small>}
        </label>

        <label>
          <span>Νομός</span>
          <select
            value={prefectureId}
            onChange={(event) => {
              setPrefectureId(event.target.value);
              setMunicipalityId("");
              setPreview(undefined);
            }}
            disabled={!metadata}
          >
            <option value="">Όλοι οι νομοί · Όλη η Ελλάδα</option>
            {metadata?.prefectures.map((item) => <option key={item.id} value={item.id}>{item.descr}</option>)}
          </select>
        </label>

        <label>
          <span>Δήμος <small>(προαιρετικό)</small></span>
          <select
            value={municipalityId}
            onChange={(event) => {
              setMunicipalityId(event.target.value);
              setPreview(undefined);
            }}
            disabled={!prefectureId}
          >
            <option value="">{prefectureId ? "Όλοι οι δήμοι του νομού" : "Επίλεξε συγκεκριμένο νομό για Δήμο"}</option>
            {municipalities.map((item) => <option key={item.id} value={item.id}>{item.descr}</option>)}
          </select>
        </label>

        <label className="gemi-active-toggle">
          <input type="checkbox" checked={activeOnly} onChange={(event) => { setActiveOnly(event.target.checked); setPreview(undefined); }} />
          <span><strong>Μόνο ενεργές επιχειρήσεις</strong><small>Συνιστάται για partner prospecting.</small></span>
        </label>
      </div>

      <div className="gemi-export-actions">
        <button className="button" type="submit" disabled={!hasSelection || busy}>
          {busy ? "Αναζήτηση…" : "Προεπισκόπηση αποτελεσμάτων"}
        </button>
        <span>{selectionSummary || "Επίλεξε ομάδα ή ΚΑΔ"} · {selectedPrefecture ? selectedMunicipality ? `${selectedMunicipality.descr}, ${selectedPrefecture.descr}` : selectedPrefecture.descr : "Όλη η Ελλάδα"}</span>
      </div>
      {previewError && <div className="workspace-inline-note form-error" role="alert">{previewError}</div>}
    </form>

    <section className="gemi-export-card">
      <div className="gemi-export-card-head">
        <div>
          <span>2 · Export</span>
          <strong>CSV επιχειρήσεων</strong>
          <small>Δεν δημιουργούνται vendors ή prospects στη βάση. Το αρχείο παράγεται live από το ΓΕΜΗ.</small>
        </div>
        {metadata && <span className="status-pill">{selectedExportFields.length}/{metadata.exportFields.length} πεδία</span>}
      </div>

      <div className="gemi-export-field-filter">
        <div className="gemi-export-field-filter-head">
          <div>
            <strong>Ποια δεδομένα να εξαχθούν;</strong>
            <small>Αποεπίλεξε οτιδήποτε δεν χρειάζεσαι. Το CSV θα περιέχει μόνο τα επιλεγμένα πεδία.</small>
          </div>
          <div className="gemi-export-presets">
            {EXPORT_FIELD_PRESETS.map((preset) => <button
              className="button button-secondary"
              type="button"
              key={preset.id}
              onClick={() => applyExportPreset(preset.fields)}
            >{preset.label}</button>)}
            <button className="button button-secondary" type="button" onClick={selectAllExportFields}>Όλα</button>
            <button className="button button-secondary" type="button" onClick={() => setSelectedExportFields([])}>Κανένα</button>
          </div>
        </div>

        <div className="gemi-export-field-categories">
          {exportFieldCategories.map((category) => {
            const selectedCount = category.fields.filter((field) => selectedExportFields.includes(field.id)).length;
            const allSelected = selectedCount === category.fields.length;
            return <section className="gemi-export-field-category" key={category.id}>
              <div className="gemi-export-field-category-head">
                <div>
                  <strong>{category.label}</strong>
                  <small>{selectedCount}/{category.fields.length}</small>
                </div>
                <button
                  type="button"
                  className="gemi-export-category-action"
                  onClick={() => setExportCategory(category.id, !allSelected)}
                >{allSelected ? "Καμία" : "Όλες"}</button>
              </div>
              <div className="gemi-export-field-list">
                {category.fields.map((field) => <label key={field.id}>
                  <input
                    type="checkbox"
                    checked={selectedExportFields.includes(field.id)}
                    onChange={() => toggleExportField(field.id)}
                  />
                  <span>{field.label}</span>
                </label>)}
              </div>
            </section>;
          })}
        </div>
        {selectedExportFields.length === 0 && <div className="workspace-inline-note form-error" role="alert">
          Επίλεξε τουλάχιστον ένα πεδίο για να ενεργοποιηθεί το CSV export.
        </div>}
      </div>

      {!preview ? <div className="workspace-empty-state">
        <strong>Κάνε πρώτα προεπισκόπηση.</strong>
        <span>Θα δεις το συνολικό πλήθος πριν ξεκινήσεις το πλήρες CSV export.</span>
      </div> : <>
        <div className="gemi-export-summary">
          <div><span>Σύνολο</span><strong>{preview.totalCount.toLocaleString("el-GR")}</strong><small>μοναδικές επιχειρήσεις</small></div>
          <div><span>ΚΑΔ φίλτρου</span><strong>{preview.activityCount.toLocaleString("el-GR")}</strong><small>ακριβείς τρέχοντες κωδικοί</small></div>
          <div><span>Preview</span><strong>{preview.returned}</strong><small>πρώτες εγγραφές</small></div>
          <div><span>Email στο preview</span><strong>{preview.withEmail}</strong><small>δημοσιευμένα στο ΓΕΜΗ</small></div>
        </div>

        <div className="gemi-download-bar">
          <div>
            <strong>{selectionSummary || "Επιλογή ΚΑΔ"}</strong>
            <span>{selectedMunicipality?.descr ?? selectedPrefecture?.descr ?? "Όλη η Ελλάδα"}</span>
          </div>
          {preview.totalCount > 0 && selectedExportFields.length > 0
            ? <a className="button" href={`/api/admin/gemi/export?${downloadQuery}`}>Λήψη όλων ως CSV</a>
            : <span className="status-pill">{preview.totalCount > 0 ? "Επίλεξε πεδία" : "0 αποτελέσματα"}</span>}
        </div>

        {preview.rows.length > 0 && <div className="gemi-preview-table" role="table" aria-label="ΓΕΜΗ preview">
          <div className="gemi-preview-head" role="row">
            <span>Επιχείρηση</span><span>Περιοχή</span><span>Επικοινωνία</span><span>Κατάσταση</span>
          </div>
          {preview.rows.map((row) => <div className="gemi-preview-row" role="row" key={row.gemiNumber || `${row.afm}:${row.legalName}`}>
            <span><strong>{row.legalName || row.tradingNames || "—"}</strong><small>ΓΕΜΗ {row.gemiNumber || "—"} · ΑΦΜ {row.afm || "—"}</small></span>
            <span><strong>{row.municipality || row.city || "—"}</strong><small>{row.postcode || row.prefecture || "—"}</small></span>
            <span><strong>{row.email || "—"}</strong><small>{row.website || "χωρίς website"}</small></span>
            <span>
              <span className="status-pill">{row.status || "—"}</span>
              {row.matchedGroups && <small>{row.matchedGroups}</small>}
              {row.matchedActivities && <small className="gemi-match-kads">{row.matchedActivities}</small>}
            </span>
          </div>)}
        </div>}
      </>}
    </section>

    <div className="workspace-inline-note">
      Το CSV μπορεί πλέον να περιοριστεί στα business-level δημόσια πεδία που επιλέγεις πριν από τη λήψη. Πρόσωπα, έγγραφα, κεφάλαιο και λοιπά μη αναγκαία πεδία δεν εξάγονται από τη λειτουργία. Η δημοσίευση email στο ΓΕΜΗ δεν αντιμετωπίζεται από το KONTA MOY ως συγκατάθεση για marketing.
    </div>
  </div>;
}
