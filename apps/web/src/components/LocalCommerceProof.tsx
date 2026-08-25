import type { LocalCommerceProof as LocalCommerceProofValue } from "../lib/local-commerce-proof";

export function LocalCommerceProof({ proof, compact = false }: { proof?: LocalCommerceProofValue; compact?: boolean }) {
  if (!proof) return null;
  const labels = [
    proof.freshLocalStock
      ? proof.stockConfirmedToday
        ? "Τοπικό απόθεμα · επιβεβαιωμένο σήμερα"
        : "Τοπικό απόθεμα · πρόσφατα επιβεβαιωμένο"
      : undefined,
    proof.pickup ? "Παραλαβή από κατάστημα" : undefined,
    proof.localDelivery ? "Τοπική παράδοση · live tracking" : undefined,
    proof.advice ? "Συμβουλή από άνθρωπο" : undefined,
    !compact && proof.leadTimeMinutes !== undefined && proof.leadTimeMinutes > 0
      ? `Προετοιμασία περίπου ${proof.leadTimeMinutes}′`
      : undefined
  ].filter((label): label is string => Boolean(label));

  if (!labels.length) return null;
  return (
    <div
      aria-label="Τοπικές δυνατότητες"
      style={{ display: "flex", flexWrap: "wrap", gap: compact ? 5 : 7, marginTop: compact ? 10 : 14 }}
    >
      {labels.map((label) => (
        <span
          key={label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: compact ? 25 : 29,
            padding: compact ? "4px 8px" : "5px 10px",
            border: "1px solid var(--line)",
            borderRadius: 999,
            background: "rgba(255,253,248,.78)",
            color: "var(--ink-soft)",
            fontSize: compact ? 10 : 11,
            fontWeight: 800,
            lineHeight: 1.25
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
