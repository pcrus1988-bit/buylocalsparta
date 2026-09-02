"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  LaunchControlTargetKey,
  LaunchControlTargetSettings
} from "../../../../lib/admin-launch-control-targets";

const ROWS: ReadonlyArray<Readonly<{
  key: LaunchControlTargetKey;
  label: string;
  unit: string;
  step: string;
  min: string;
  max?: string;
}>> = [
  { key: "activeVendors", label: "Active vendors", unit: "vendors", step: "1", min: "1" },
  { key: "catalogueProducts", label: "Catalogue products", unit: "products", step: "1", min: "1" },
  { key: "indexableProducts", label: "Indexable products", unit: "products", step: "1", min: "1" },
  { key: "orders30d", label: "Paid orders · 30d", unit: "orders", step: "1", min: "1" },
  { key: "gmv30dMinor", label: "Merchandise GMV · 30d", unit: "€", step: "0.01", min: "0.01" },
  { key: "searchSuccessRate", label: "Search success · 30d", unit: "%", step: "0.1", min: "0.1", max: "100" }
];

type Draft = Record<LaunchControlTargetKey, { value: string; deadline: string }>;

function initialDraft(settings: LaunchControlTargetSettings): Draft {
  return Object.fromEntries(ROWS.map((row) => {
    const target = settings.document.targets[row.key];
    let value = "";
    if (target) {
      if (row.key === "gmv30dMinor") value = (target.value / 100).toFixed(2);
      else if (row.key === "searchSuccessRate") value = (target.value * 100).toFixed(1);
      else value = String(target.value);
    }
    return [row.key, { value, deadline: target?.deadline ?? "" }];
  })) as Draft;
}

export function TargetEditor({ csrfToken, settings }: Readonly<{ csrfToken: string; settings: LaunchControlTargetSettings }>) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(settings));
  const [version, setVersion] = useState(settings.version);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const configured = useMemo(() => ROWS.filter((row) => draft[row.key].value || draft[row.key].deadline).length, [draft]);

  async function save() {
    setMessage(undefined);
    const targets: Record<string, { value: number; deadline: string }> = {};
    for (const row of ROWS) {
      const item = draft[row.key];
      if (!item.value && !item.deadline) continue;
      if (!item.value || !item.deadline) {
        setMessage(`${row.label}: both target and deadline are required, or leave both blank to remove it.`);
        return;
      }
      const entered = Number(item.value);
      if (!Number.isFinite(entered) || entered <= 0) {
        setMessage(`${row.label}: enter a target greater than zero.`);
        return;
      }
      if (row.key === "searchSuccessRate" && entered > 100) {
        setMessage("Search success cannot exceed 100%.");
        return;
      }
      const value = row.key === "gmv30dMinor"
        ? Math.round(entered * 100)
        : row.key === "searchSuccessRate"
          ? entered / 100
          : Math.round(entered);
      targets[row.key] = { value, deadline: item.deadline };
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/launchcontrol/targets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({ expectedVersion: version, targets })
      });
      const body = await response.json() as { error?: string; settings?: LaunchControlTargetSettings };
      if (!response.ok || !body.settings) throw new Error(body.error ?? "Target update failed");
      setVersion(body.settings.version);
      setDraft(initialDraft(body.settings));
      setMessage(`Saved version ${body.settings.version}. Changed targets now start from a fresh authoritative baseline.`);
      router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Target update failed";
      setMessage(text === "LAUNCH_CONTROL_TARGET_VERSION_CONFLICT" ? "Targets changed in another Admin session. Reload this page before saving again." : text);
    } finally {
      setSaving(false);
    }
  }

  return <section className="lc-target-editor" aria-label="Launch Control targets editor">
    <div className="lc-target-editor-head">
      <div><span>Governed target document</span><strong>{configured} configured · version {version}</strong></div>
      <button className="button" type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save targets"}</button>
    </div>
    <div className="lc-target-form-grid">
      {ROWS.map((row) => <div className="lc-target-form-row" key={row.key}>
        <label><span>{row.label}</span><div><input type="number" min={row.min} max={row.max} step={row.step} value={draft[row.key].value} placeholder="Unset" onChange={(event) => setDraft((current) => ({ ...current, [row.key]: { ...current[row.key], value: event.target.value } }))} /><small>{row.unit}</small></div></label>
        <label><span>Deadline</span><input type="date" value={draft[row.key].deadline} onChange={(event) => setDraft((current) => ({ ...current, [row.key]: { ...current[row.key], deadline: event.target.value } }))} /></label>
        <button className="text-link" type="button" onClick={() => setDraft((current) => ({ ...current, [row.key]: { value: "", deadline: "" } }))}>Clear</button>
      </div>)}
    </div>
    <p className="lc-target-editor-note">Blank target + blank deadline means “not governed”. Changing a value or deadline resets that metric’s baseline to the authoritative current value when the save succeeds. Targets are never inferred from forecasts.</p>
    {message ? <div className="lc-target-message" role="status">{message}</div> : null}
  </section>;
}
