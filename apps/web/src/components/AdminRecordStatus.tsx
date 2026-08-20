export type AdminRecordStateTone = "neutral" | "positive" | "caution" | "critical";
export type AdminAttentionSeverity = "info" | "attention" | "critical";

export function AdminRecordState({ label, tone = "neutral" }: Readonly<{ label: string; tone?: AdminRecordStateTone }>) {
  return <span className={`admin-record-state is-${tone}`}><i aria-hidden="true" />{label}</span>;
}

export function AdminAttentionFlag({ label, severity = "attention" }: Readonly<{ label: string; severity?: AdminAttentionSeverity }>) {
  return <span className={`admin-attention-flag is-${severity}`}><i aria-hidden="true" />{label}</span>;
}

export function AdminStatusStack({
  state,
  stateTone = "neutral",
  attention,
  attentionSeverity = "attention"
}: Readonly<{
  state: string;
  stateTone?: AdminRecordStateTone;
  attention?: string;
  attentionSeverity?: AdminAttentionSeverity;
}>) {
  return <span className="admin-status-stack">
    <AdminRecordState label={state} tone={stateTone} />
    {attention ? <AdminAttentionFlag label={attention} severity={attentionSeverity} /> : null}
  </span>;
}
