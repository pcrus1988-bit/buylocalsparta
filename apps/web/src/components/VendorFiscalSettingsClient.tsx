"use client";

import { useMemo, useState } from "react";
import type {
  VendorFiscalSettingsSnapshot,
  VendorFiscalTaxDisplayMode,
  VendorInvoiceTemplate
} from "../lib/vendor-fiscal-settings";

const money = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

function initialForm(snapshot: VendorFiscalSettingsSnapshot) {
  return {
    environment: snapshot.aade.environment,
    aadeUserId: "",
    subscriptionKey: "",
    documentSeries: snapshot.invoice.documentSeries,
    branchNumber: snapshot.invoice.branchNumber == null ? "" : String(snapshot.invoice.branchNumber),
    previewVatRatePercent: snapshot.invoice.previewVatRatePercent == null ? "" : String(snapshot.invoice.previewVatRatePercent),
    taxDisplayMode: snapshot.invoice.taxDisplayMode,
    pdfTemplate: snapshot.invoice.pdfTemplate,
    pdfAccentHex: snapshot.invoice.pdfAccentHex,
    showLogo: snapshot.invoice.showLogo,
    showAadeQr: snapshot.invoice.showAadeQr,
    showPaymentDetails: snapshot.invoice.showPaymentDetails,
    footerNote: snapshot.invoice.footerNote
  };
}

function connectionLabel(snapshot: VendorFiscalSettingsSnapshot) {
  if (!snapshot.aade.vaultAvailable) return "Vault μη διαθέσιμο";
  if (snapshot.aade.lastConnectionStatus === "succeeded") return "Σύνδεση επιβεβαιωμένη";
  if (snapshot.aade.lastConnectionStatus === "failed") return "Η τελευταία δοκιμή απέτυχε";
  if (snapshot.aade.userIdConfigured && snapshot.aade.subscriptionKeyConfigured) return "Κλειδιά αποθηκευμένα · δεν έχει γίνει δοκιμή";
  return "Δεν έχει ρυθμιστεί";
}

export function VendorFiscalSettingsClient({ initial }: { initial: VendorFiscalSettingsSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [form, setForm] = useState(() => initialForm(initial));
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const preview = useMemo(() => {
    const parsed = Number(String(form.previewVatRatePercent).replace(",", "."));
    const rate = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 0;
    const net = 10_000;
    const vat = Math.round(net * rate / 100);
    return { rate, net, vat, gross: net + vat };
  }, [form.previewVatRatePercent]);

  const accent = /^#[0-9A-Fa-f]{6}$/.test(form.pdfAccentHex) ? form.pdfAccentHex : "#0F766E";

  function applySnapshot(next: VendorFiscalSettingsSnapshot) {
    setSnapshot(next);
    setForm(initialForm(next));
  }

  async function persistSettings(showSuccess = true): Promise<VendorFiscalSettingsSnapshot | undefined> {
    setError("");
    if (showSuccess) setMessage("");
    const response = await fetch("/api/vendor/finance/fiscal-settings", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": snapshot.csrfToken },
      body: JSON.stringify(form)
    });
    const payload = await response.json() as VendorFiscalSettingsSnapshot & { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Οι φορολογικές ρυθμίσεις δεν αποθηκεύτηκαν.");
      return undefined;
    }
    applySnapshot(payload);
    if (showSuccess) setMessage("Οι ρυθμίσεις AADE και παραστατικών αποθηκεύτηκαν.");
    return payload;
  }

  async function save() {
    setBusy("save");
    try {
      await persistSettings(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Οι ρυθμίσεις δεν αποθηκεύτηκαν.");
    } finally {
      setBusy("");
    }
  }

  async function testConnection() {
    setBusy("test");
    setError("");
    setMessage("");
    try {
      const saved = await persistSettings(false);
      if (!saved) return;
      const response = await fetch("/api/vendor/finance/fiscal-settings", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": saved.csrfToken },
        body: JSON.stringify({ action: "test_connection" })
      });
      const payload = await response.json() as { ok?: boolean; snapshot?: VendorFiscalSettingsSnapshot; error?: string };
      if (!response.ok || !payload.snapshot) throw new Error(payload.error ?? "Η δοκιμή σύνδεσης AADE απέτυχε.");
      applySnapshot(payload.snapshot);
      setMessage("Η σύνδεση με AADE myDATA επιβεβαιώθηκε με read-only έλεγχο.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η δοκιμή σύνδεσης AADE απέτυχε.");
      try {
        const response = await fetch("/api/vendor/finance/fiscal-settings", { cache: "no-store" });
        if (response.ok) applySnapshot(await response.json() as VendorFiscalSettingsSnapshot);
      } catch {
        // Keep the existing local snapshot if the refresh also fails.
      }
    } finally {
      setBusy("");
    }
  }

  return <section className="shell vendor-section" id="fiscal-settings">
    <div className="workspace-section-heading">
      <div>
        <div className="eyebrow">HUB · AADE / myDATA</div>
        <h2>AADE & ρυθμίσεις παραστατικών</h2>
        <p className="workspace-page-muted">
          Σύνδεσε τα δικά σου στοιχεία AADE και διαμόρφωσε τον τρόπο που θα εμφανίζονται τα παραστατικά της επιχείρησής σου.
        </p>
      </div>
    </div>

    {snapshot.trialMode && <div className="workspace-page-callout">
      <strong>Trial-safe ρύθμιση.</strong> Οι επιλογές και τα κλειδιά αποθηκεύονται, όμως το Trial δεν εκδίδει ούτε διαβιβάζει πραγματικά παραστατικά. Η παραγωγική έκδοση παραμένει κλειδωμένη μέχρι την ενεργοποίηση του vendor.
    </div>}
    <div className="workspace-page-callout">
      <strong>Φορολογική ασφάλεια.</strong> Το VAT του πραγματικού παραστατικού συνεχίζει να προκύπτει από τα εγκεκριμένα product tax profiles / accounting mapping. Το ποσοστό παρακάτω χρησιμοποιείται μόνο στην προεπισκόπηση και σε draft layout.
    </div>

    {error && <div className="form-error vendor-error" role="alert"><strong>Σφάλμα.</strong> {error}</div>}
    {message && <div className="workspace-page-callout is-positive" role="status"><strong>Ολοκληρώθηκε.</strong> {message}</div>}

    <div className="workspace-dashboard-grid" style={{ alignItems: "start" }}>
      <div style={{ display: "grid", gap: "1rem" }}>
        <article className="workspace-tool-panel" style={{ padding: "1rem" }}>
          <div className="workspace-queue-head">
            <div>
              <strong>1 · Σύνδεση AADE myDATA</strong>
              <small>{snapshot.hubName} · {snapshot.business.tradingName}</small>
            </div>
            <span className={snapshot.aade.lastConnectionStatus === "succeeded" ? "status-chip is-positive" : "status-chip"}>
              {connectionLabel(snapshot)}
            </span>
          </div>
          <p className="workspace-page-muted">
            Τα credentials αποθηκεύονται server-side στο Supabase Vault. Το API key δεν επιστρέφεται ποτέ στον browser μετά την αποθήκευση.
          </p>
          <div className="workspace-form-grid">
            <label className="workspace-form-field">
              <span>Περιβάλλον AADE</span>
              <select value={form.environment} onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value as "test" | "production" }))}>
                <option value="production">Production</option>
                <option value="test">Test / development</option>
              </select>
            </label>
            <label className="workspace-form-field">
              <span>AADE User ID</span>
              <input
                autoComplete="off"
                value={form.aadeUserId}
                onChange={(event) => setForm((current) => ({ ...current, aadeUserId: event.target.value }))}
                placeholder={snapshot.aade.userIdConfigured ? "Αποθηκευμένο · γράψε μόνο για αντικατάσταση" : "User ID"}
              />
            </label>
            <label className="workspace-form-field">
              <span>Subscription Key / API Key</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.subscriptionKey}
                onChange={(event) => setForm((current) => ({ ...current, subscriptionKey: event.target.value }))}
                placeholder={snapshot.aade.subscriptionKeyConfigured ? "•••••••••••• · γράψε μόνο για αντικατάσταση" : "AADE subscription key"}
              />
            </label>
          </div>
          {snapshot.aade.lastConnectionCheckAt && <p className="workspace-page-muted">
            Τελευταίος έλεγχος: {new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(snapshot.aade.lastConnectionCheckAt))}
            {snapshot.aade.lastConnectionError ? " · " + snapshot.aade.lastConnectionError : ""}
          </p>}
          <div className="workspace-form-actions">
            <button className="button" type="button" disabled={Boolean(busy)} onClick={() => void testConnection()}>
              {busy === "test" ? "Έλεγχος…" : "Αποθήκευση & δοκιμή σύνδεσης"}
            </button>
          </div>
        </article>

        <article className="workspace-tool-panel" style={{ padding: "1rem" }}>
          <div className="workspace-queue-head">
            <div><strong>2 · Φόρος & αρίθμηση</strong><small>Ρυθμίσεις εμφάνισης / draft</small></div>
          </div>
          <div className="workspace-form-grid">
            <label className="workspace-form-field">
              <span>Σειρά παραστατικού</span>
              <input value={form.documentSeries} maxLength={20} onChange={(event) => setForm((current) => ({ ...current, documentSeries: event.target.value }))} placeholder="π.χ. A" />
            </label>
            <label className="workspace-form-field">
              <span>Αρ. εγκατάστασης / branch</span>
              <input inputMode="numeric" value={form.branchNumber} onChange={(event) => setForm((current) => ({ ...current, branchNumber: event.target.value }))} placeholder="π.χ. 0" />
            </label>
            <label className="workspace-form-field">
              <span>VAT % για preview / draft</span>
              <input inputMode="decimal" value={form.previewVatRatePercent} onChange={(event) => setForm((current) => ({ ...current, previewVatRatePercent: event.target.value }))} placeholder="π.χ. 24" />
            </label>
            <label className="workspace-form-field">
              <span>Εμφάνιση φόρου στο PDF</span>
              <select value={form.taxDisplayMode} onChange={(event) => setForm((current) => ({ ...current, taxDisplayMode: event.target.value as VendorFiscalTaxDisplayMode }))}>
                <option value="gross_with_breakdown">Τελική τιμή + ανάλυση ΦΠΑ</option>
                <option value="net_plus_vat">Καθαρή αξία + ΦΠΑ + σύνολο</option>
                <option value="summary_only">Συνοπτικά στο τέλος</option>
              </select>
            </label>
          </div>
        </article>

        <article className="workspace-tool-panel" style={{ padding: "1rem" }}>
          <div className="workspace-queue-head">
            <div><strong>3 · Εμφάνιση PDF</strong><small>Live preview δεξιά / πιο κάτω σε κινητό</small></div>
          </div>
          <div className="workspace-form-grid">
            <label className="workspace-form-field">
              <span>Template</span>
              <select value={form.pdfTemplate} onChange={(event) => setForm((current) => ({ ...current, pdfTemplate: event.target.value as VendorInvoiceTemplate }))}>
                <option value="clean">Clean</option>
                <option value="classic">Classic</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="workspace-form-field">
              <span>Accent</span>
              <span style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                <input type="color" value={accent} onChange={(event) => setForm((current) => ({ ...current, pdfAccentHex: event.target.value.toUpperCase() }))} style={{ width: 56, minHeight: 42, padding: 4 }} />
                <input value={form.pdfAccentHex} onChange={(event) => setForm((current) => ({ ...current, pdfAccentHex: event.target.value }))} maxLength={7} aria-label="HEX accent colour" />
              </span>
            </label>
          </div>
          <div style={{ display: "grid", gap: ".55rem", marginTop: ".85rem" }}>
            <label><input type="checkbox" checked={form.showLogo} onChange={(event) => setForm((current) => ({ ...current, showLogo: event.target.checked }))} /> Εμφάνιση λογότυπου</label>
            <label><input type="checkbox" checked={form.showAadeQr} onChange={(event) => setForm((current) => ({ ...current, showAadeQr: event.target.checked }))} /> Εμφάνιση AADE QR / MARK όταν υπάρχει</label>
            <label><input type="checkbox" checked={form.showPaymentDetails} onChange={(event) => setForm((current) => ({ ...current, showPaymentDetails: event.target.checked }))} /> Εμφάνιση τρόπου πληρωμής</label>
          </div>
          <label className="workspace-form-field" style={{ marginTop: ".85rem" }}>
            <span>Footer / σημείωση</span>
            <textarea value={form.footerNote} maxLength={1200} onChange={(event) => setForm((current) => ({ ...current, footerNote: event.target.value }))} placeholder="Προαιρετική σημείωση που θα εμφανίζεται στο παραστατικό." />
          </label>
          <div className="workspace-form-actions">
            <button className="button" type="button" disabled={Boolean(busy)} onClick={() => void save()}>
              {busy === "save" ? "Αποθήκευση…" : "Αποθήκευση ρυθμίσεων"}
            </button>
          </div>
        </article>
      </div>

      <aside className="workspace-tool-panel" style={{ padding: "1rem", position: "sticky", top: "1rem" }}>
        <div className="eyebrow">LIVE INVOICE PREVIEW</div>
        <div style={{
          marginTop: ".8rem",
          background: "#fff",
          color: "#17202b",
          border: "1px solid rgba(23,32,43,.16)",
          borderRadius: form.pdfTemplate === "classic" ? 2 : form.pdfTemplate === "compact" ? 8 : 16,
          padding: form.pdfTemplate === "compact" ? "1rem" : "1.35rem",
          boxShadow: "0 18px 45px rgba(23,32,43,.08)"
        }}>
          <div style={{ borderTop: "5px solid " + accent, paddingTop: ".9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
              <div>
                {form.showLogo && <div style={{ fontWeight: 900, letterSpacing: ".08em", color: accent }}>KONTA MOY</div>}
                <strong style={{ display: "block", marginTop: ".35rem" }}>{snapshot.business.tradingName}</strong>
                <small>{snapshot.business.taxNumber ? "ΑΦΜ " + snapshot.business.taxNumber : "ΑΦΜ —"} · HUB {snapshot.hubName}</small>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>ΤΙΜΟΛΟΓΙΟ</strong>
                <small style={{ display: "block" }}>{form.documentSeries ? "Σειρά " + form.documentSeries : "Σειρά —"} · 000001</small>
              </div>
            </div>

            <div style={{ marginTop: "1.1rem", padding: ".75rem", background: "#f6f5f0", borderRadius: 8 }}>
              <small>ΠΕΛΑΤΗΣ</small>
              <strong style={{ display: "block" }}>Παράδειγμα πελάτη</strong>
              <span style={{ fontSize: ".82rem" }}>ΑΦΜ 000000000 · Αθήνα</span>
            </div>

            <div style={{ marginTop: "1rem", borderTop: "1px solid #ddd", borderBottom: "1px solid #ddd", padding: ".7rem 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: ".7rem" }}>
                <span>Παράδειγμα προϊόντος</span>
                <strong>{form.taxDisplayMode === "gross_with_breakdown" ? money(preview.gross) : money(preview.net)}</strong>
              </div>
              {form.taxDisplayMode !== "summary_only" && <small style={{ display: "block", marginTop: ".35rem" }}>
                ΦΠΑ preview {preview.rate.toLocaleString("el-GR")}% · {money(preview.vat)}
              </small>}
            </div>

            <div style={{ marginTop: ".9rem", display: "grid", gap: ".25rem" }}>
              {form.taxDisplayMode === "net_plus_vat" && <>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Καθαρή αξία</span><span>{money(preview.net)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>ΦΠΑ</span><span>{money(preview.vat)}</span></div>
              </>}
              {form.taxDisplayMode === "summary_only" && <div style={{ display: "flex", justifyContent: "space-between" }}><span>ΦΠΑ preview</span><span>{money(preview.vat)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.05rem", fontWeight: 800, marginTop: ".25rem" }}><span>ΣΥΝΟΛΟ</span><span>{money(preview.gross)}</span></div>
            </div>

            {form.showPaymentDetails && <div style={{ marginTop: "1rem", fontSize: ".8rem" }}><strong>Πληρωμή:</strong> Κάρτα / online</div>}
            {form.showAadeQr && <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "end", gap: "1rem" }}>
              <div style={{ fontSize: ".76rem" }}><strong>AADE / myDATA</strong><br />MARK · εμφανίζεται μετά την έκδοση</div>
              <div aria-label="Θέση AADE QR" style={{ width: 54, height: 54, border: "6px double #17202b", display: "grid", placeItems: "center", fontSize: ".62rem", fontWeight: 800 }}>QR</div>
            </div>}
            {form.footerNote && <p style={{ margin: "1rem 0 0", paddingTop: ".7rem", borderTop: "1px solid #ddd", fontSize: ".72rem" }}>{form.footerNote}</p>}
          </div>
        </div>
        <p className="workspace-page-muted" style={{ marginTop: ".7rem" }}>Η προεπισκόπηση είναι δείγμα layout. Τα πραγματικά φορολογικά στοιχεία, MARK/UID και VAT προκύπτουν από την εγκεκριμένη ροή κατά την έκδοση.</p>
      </aside>
    </div>
  </section>;
}
