"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchSurveyDesignAdminOverview } from "../lib/research-survey-admin-design";
import { athensDeadlineInputToIso, isoToAthensDeadlineInput } from "../lib/research-survey-athens-deadline";

export function ResearchSurveySettingsPanel({
  slug,
  csrfToken,
  canEdit,
  data
}: {
  slug: string;
  csrfToken: string;
  canEdit: boolean;
  data: ResearchSurveyDesignAdminOverview;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(data.study.title);
  const [subtitle, setSubtitle] = useState(data.study.subtitle ?? "");
  const [populationDefinition, setPopulationDefinition] = useState(data.study.populationDefinition);
  const [methodologySummary, setMethodologySummary] = useState(data.study.methodologySummary);
  const [defaultLocale, setDefaultLocale] = useState(data.study.defaultLocale || "el-GR");
  const [fieldworkEndsAt, setFieldworkEndsAt] = useState(isoToAthensDeadlineInput(data.study.fieldworkEndsAt));
  const publicResultsUrl = data.study.publicResultsUrl ?? "";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const editable = canEdit && data.study.status === "draft";
  const pilotDeadlineEditable = canEdit && data.study.status === "pilot" && data.study.pilotDeadlineMutable;
  const deadlineEditable = editable || pilotDeadlineEditable;
  const deadlinePreview = useMemo(() => {
    if (!fieldworkEndsAt) return "No deadline set";
    return fieldworkEndsAt.replace("T", " ") + " (Europe/Athens)";
  }, [fieldworkEndsAt]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          action: "save_study_settings",
          title,
          subtitle,
          populationDefinition,
          methodologySummary,
          defaultLocale,
          fieldworkEndsAt: fieldworkEndsAt ? athensDeadlineInputToIso(fieldworkEndsAt) : ""
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Research survey settings could not be saved.");
      setMessage("Survey settings saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Survey settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function savePilotDeadline() {
    if (!fieldworkEndsAt) return;
    setMessage("");
    try {
      const deadline = athensDeadlineInputToIso(fieldworkEndsAt);
      if (!window.confirm("Set the official survey deadline to " + deadlinePreview + "?\n\nThis closes participant access at the selected time. The Pilot remains a separate phase. Other locked study settings will not change.")) return;
      setBusy(true);
      const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "save_pilot_deadline", fieldworkEndsAt: deadline })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pilot deadline could not be saved.");
      setMessage("Pilot deadline saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pilot deadline could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="shell vendor-section">
    <div className="workspace-action-bar">
      <span>
        <strong>Survey-specific settings</strong><br />
        These values belong to <strong>{data.study.title}</strong> only. They do not change other Research surveys.
      </span>
      <span>
        <strong>Status:</strong> {data.study.status}
      </span>
    </div>

    {!editable && <div className="workspace-inline-note">
      {canEdit
        ? pilotDeadlineEditable
          ? "The survey design is locked in Pilot. You may still set the official closing date before any invitation is issued. Other settings remain read-only, and the change is recorded in the Admin audit."
          : "The survey design is locked. Deadline changes after recruitment starts require a governed amendment; other settings are read-only."
        : "You have read-only Research access. Editing survey design requires Research design permission."}
    </div>}

    <div className="workspace-queue-card" style={{ display: "grid", gap: 16 }}>
      <label>
        <strong>Survey title</strong><br />
        <input
          disabled={!editable}
          maxLength={240}
          onChange={(event) => setTitle(event.target.value)}
          style={{ width: "100%" }}
          type="text"
          value={title}
        />
      </label>

      <label>
        <strong>Subtitle</strong><br />
        <input
          disabled={!editable}
          maxLength={320}
          onChange={(event) => setSubtitle(event.target.value)}
          style={{ width: "100%" }}
          type="text"
          value={subtitle}
        />
      </label>

      <label>
        <strong>Target population</strong><br />
        <textarea
          disabled={!editable}
          onChange={(event) => setPopulationDefinition(event.target.value)}
          rows={5}
          style={{ width: "100%" }}
          value={populationDefinition}
        />
        <small>Who the study is intended to represent.</small>
      </label>

      <label>
        <strong>Methodology summary</strong><br />
        <textarea
          disabled={!editable}
          onChange={(event) => setMethodologySummary(event.target.value)}
          rows={7}
          style={{ width: "100%" }}
          value={methodologySummary}
        />
        <small>Plain-language study design shown in the Research methodology surfaces.</small>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
        <label>
          <strong>Default language</strong><br />
          <select disabled={!editable} onChange={(event) => setDefaultLocale(event.target.value)} value={defaultLocale}>
            <option value="el-GR">Ελληνικά (el-GR)</option>
            <option value="en-GB">English (en-GB)</option>
          </select>
        </label>

        <label>
          <strong>Survey deadline · Athens time</strong><br />
          <input
            disabled={!deadlineEditable}
            onChange={(event) => setFieldworkEndsAt(event.target.value)}
            type="datetime-local"
            value={fieldworkEndsAt}
          />
          <small>{deadlinePreview}. This is the official survey closing date (Europe/Athens), not the Pilot closeout date. After the deadline, participation closes; automated main-study evaluation follows governed lifecycle rules.</small>
        </label>
      </div>

      <div>
        <label htmlFor="research-public-results-url"><strong>Public results URL · Αυτόματος σύνδεσμος</strong></label>
        <input
          id="research-public-results-url"
          aria-label="Public results URL"
          readOnly
          style={{ width: "100%", marginTop: 6 }}
          type="url"
          value={publicResultsUrl}
        />
        <div className="workspace-action-buttons" style={{ marginTop: 8 }}>
          <a className="button button-secondary" href={publicResultsUrl} target="_blank" rel="noreferrer noopener">
            Open public results page ↗
          </a>
          <button className="button button-secondary" type="button"
            onClick={() => void navigator.clipboard.writeText(publicResultsUrl)
              .then(() => setMessage("Results URL copied."))
              .catch(() => setMessage("Unable to copy automatically. Select the URL and copy it."))}>
            Copy results URL
          </button>
        </div>
        <small>Generated automatically from this survey's current wave. The link works before publication and displays a holding page until reviewed results are released. The address is read-only and is not a publication action.</small>
      </div>

      {pilotDeadlineEditable && <div className="workspace-action-buttons">
        <button className="button" disabled={busy || !fieldworkEndsAt} onClick={() => void savePilotDeadline()} type="button">
          {busy ? "Saving…" : "Set official survey deadline"}
        </button>
        <small>Available only until the first invitation batch is created; audited change, no emails sent.</small>
      </div>}

      {editable && <div className="workspace-action-buttons">
        <button className="button" disabled={busy} onClick={() => void save()} type="button">
          {busy ? "Saving…" : "Save survey settings"}
        </button>
      </div>}

      {message && <div className={["Survey settings saved.", "Pilot deadline saved.", "Results URL copied."].includes(message) ? "workspace-inline-note" : "workspace-inline-note form-error"}>
        {message}
      </div>}
    </div>
  </section>;
}
