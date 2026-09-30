"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AdminJsonFormOption = string | Readonly<{ value: string; label: string }>;
type AdminJsonFormField = Readonly<{
  name: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: readonly AdminJsonFormOption[];
}>;

function optionValue(option: AdminJsonFormOption): string {
  return typeof option === "string" ? option : option.value;
}

function optionLabel(option: AdminJsonFormOption): string {
  return typeof option === "string" ? option : option.label;
}

export function AdminJsonForm({
  endpoint,
  csrfToken,
  fields,
  label,
  defaults = {}
}: {
  endpoint: string;
  csrfToken: string;
  fields: readonly AdminJsonFormField[];
  label: string;
  defaults?: Record<string, string | number>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const fd = new FormData(form);
    const body: Record<string, unknown> = { ...defaults };
    for (const field of fields) {
      const value = fd.get(field.name);
      body[field.name] = field.type === "number" ? Number(value) : String(value ?? "");
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Admin action failed");
      form.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Admin action failed");
    } finally {
      setBusy(false);
    }
  }

  return <form className="admin-json-form" onSubmit={submit}>
    {fields.map((field) => <label key={field.name}>
      <span>{field.label}</span>
      {field.type === "select"
        ? <select name={field.name} defaultValue={String(defaults[field.name] ?? (field.options?.[0] ? optionValue(field.options[0]) : ""))}>
            {field.options?.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>)}
          </select>
        : <input name={field.name} type={field.type === "number" ? "number" : "text"} defaultValue={defaults[field.name] ?? ""} required />}
    </label>)}
    <button className="button" disabled={busy}>{busy ? "…" : label}</button>
    {error && <small className="form-error" role="alert">{error}</small>}
  </form>;
}
