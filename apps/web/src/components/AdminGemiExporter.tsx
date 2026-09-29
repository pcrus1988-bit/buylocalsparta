"use client";

import { useEffect, useMemo, useState } from "react";

type Activity = Readonly<{ id: string; descr: string; descrEn?: string; kadVersion?: string }>;
type Prefecture = Readonly<{ id: string; descr: string; descrEn?: string }>;
type Municipality = Readonly<{ id: string; prefectureId: string; descr: string; descrEn?: string }>;
type Metadata = Readonly<{
  activities: readonly Activity[];
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
}>;
type Preview = Readonly<{ totalCount: number; returned: number; withEmail: number; rows: readonly PreviewRow[] }>;

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR");
}

function activityLabel(activity: Activity): string {
  return `${activity.id} · ${activity.descr}${activity.kadVersion ? ` · ΚΑΔ ${activity.kadVersion}` : ""}`;
}

export function AdminGemiExporter() {
  const [metadata, setMetadata] = useState<Metadata>();
  const [metadataError, setMetadataError] = useState("");
  const [kadQuery, setKadQuery] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<Activity>();
  const [prefectureId, setPrefectureId] = useState("");
  const [municipalityId, setMunicipalityId] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [preview, setPreview] = useState<Preview>();
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/gemi/metadata", { method: "GET", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as Metadata & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατή η φόρτωση των φίλτρων ΓΕΜΗ.");
        if (!cancelled) setMetadata(payload);
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

  function queryString() {
    if (!selectedActivity || !prefectureId) return "";
    const query = new URLSearchParams({
      activity: selectedActivity.id,
      prefecture: prefectureId,
      activeOnly: String(activeOnly)
    });
    if (municipalityId) query.set("municipality", municipalityId);
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
      const response = await fetch(`/api/admin/gemi/preview?${query}`, { method: "GET", cache: "no-store" });
      const payload = await response.json() as { preview?: Preview; error?: string };
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

  const downloadQuery = queryString();

  return <div className="gemi-export-workspace">
    <form className="gemi-export-card" onSubmit={(event) => void runPreview(event)}>
      <div className="gemi-export-card-head">
        <div>
          <span>1 · Κριτήρια ΓΕΜΗ</span>
          <strong>Επίλεξε ΚΑΔ και περιοχή</strong>
          <small>Τα φίλτρα προέρχονται απευθείας από τα επίσημα metadata του ΓΕΜΗ.</small>
        </div>
        {metadata && <span className="status-pill">{metadata.activities.length.toLocaleString("el-GR")} ΚΑΔ</span>}
      </div>

      {metadataError && <div className="workspace-inline-note form-error" role="alert">{metadataError}</div>}

      <div className="gemi-filter-grid">
        <label className="gemi-kad-picker">
          <span>ΚΑΔ</span>
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
              required
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
              <small>{activity.kadVersion ? `ΚΑΔ ${activity.kadVersion}` : "ΓΕΜΗ δραστηριότητα"}</small>
            </button>) : <div className="gemi-kad-empty">Δεν βρέθηκε ΚΑΔ με αυτή την αναζήτηση.</div>}
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
            required
          >
            <option value="">— Επίλεξε νομό —</option>
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
            <option value="">Όλοι οι δήμοι του νομού</option>
            {municipalities.map((item) => <option key={item.id} value={item.id}>{item.descr}</option>)}
          </select>
        </label>

        <label className="gemi-active-toggle">
          <input type="checkbox" checked={activeOnly} onChange={(event) => { setActiveOnly(event.target.checked); setPreview(undefined); }} />
          <span><strong>Μόνο ενεργές επιχειρήσεις</strong><small>Συνιστάται για partner prospecting.</small></span>
        </label>
      </div>

      <div className="gemi-export-actions">
        <button className="button" type="submit" disabled={!selectedActivity || !prefectureId || busy}>
          {busy ? "Αναζήτηση…" : "Προεπισκόπηση αποτελεσμάτων"}
        </button>
        <span>{selectedPrefecture ? selectedMunicipality ? `${selectedMunicipality.descr}, ${selectedPrefecture.descr}` : selectedPrefecture.descr : "Επίλεξε περιοχή"}</span>
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
      </div>

      {!preview ? <div className="workspace-empty-state">
        <strong>Κάνε πρώτα προεπισκόπηση.</strong>
        <span>Θα δεις το συνολικό πλήθος πριν ξεκινήσεις το πλήρες CSV export.</span>
      </div> : <>
        <div className="gemi-export-summary">
          <div><span>Σύνολο</span><strong>{preview.totalCount.toLocaleString("el-GR")}</strong><small>matching businesses</small></div>
          <div><span>Preview</span><strong>{preview.returned}</strong><small>πρώτες εγγραφές</small></div>
          <div><span>Email στο preview</span><strong>{preview.withEmail}</strong><small>δημοσιευμένα στο ΓΕΜΗ</small></div>
        </div>

        <div className="gemi-download-bar">
          <div>
            <strong>{selectedActivity?.id}</strong>
            <span>{selectedMunicipality?.descr ?? selectedPrefecture?.descr ?? ""}</span>
          </div>
          {preview.totalCount > 0
            ? <a className="button" href={`/api/admin/gemi/export?${downloadQuery}`}>Λήψη όλων ως CSV</a>
            : <span className="status-pill">0 αποτελέσματα</span>}
        </div>

        {preview.rows.length > 0 && <div className="gemi-preview-table" role="table" aria-label="ΓΕΜΗ preview">
          <div className="gemi-preview-head" role="row">
            <span>Επιχείρηση</span><span>Περιοχή</span><span>Επικοινωνία</span><span>Κατάσταση</span>
          </div>
          {preview.rows.map((row) => <div className="gemi-preview-row" role="row" key={row.gemiNumber || `${row.afm}:${row.legalName}`}>
            <span><strong>{row.legalName || row.tradingNames || "—"}</strong><small>ΓΕΜΗ {row.gemiNumber || "—"} · ΑΦΜ {row.afm || "—"}</small></span>
            <span><strong>{row.municipality || row.city || "—"}</strong><small>{row.postcode || row.prefecture || "—"}</small></span>
            <span><strong>{row.email || "—"}</strong><small>{row.website || "χωρίς website"}</small></span>
            <span><span className="status-pill">{row.status || "—"}</span></span>
          </div>)}
        </div>}
      </>}
    </section>

    <div className="workspace-inline-note">
      Το CSV περιλαμβάνει μόνο business-level δημόσια πεδία: ΓΕΜΗ, ΑΦΜ, επωνυμίες/τίτλους, κατάσταση, νομική μορφή, υπηρεσία ΓΕΜΗ, διεύθυνση, email, τηλέφωνο όταν επιστρέφεται, website, ημερομηνίες και δραστηριότητες ΚΑΔ. Πρόσωπα, έγγραφα, κεφάλαιο και λοιπά μη αναγκαία πεδία δεν εξάγονται.
    </div>
  </div>;
}
