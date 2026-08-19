"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { AdminAgreementVendor, CommercialAgreementWorkspace } from "../lib/admin-commercial-agreements";

function euroMinor(value: number | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(value / 100);
}

function pct(bps: number): string {
  return `${(bps / 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })}%`;
}

function localDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString("el-GR") : "—";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Πρόχειρο",
    data_complete: "Στοιχεία ολοκληρωμένα",
    pdf_generated: "PDF δημιουργήθηκε",
    sent: "Απεστάλη",
    pending_signature: "Αναμονή υπογραφών",
    signed_received: "Υπογεγραμμένο παρελήφθη",
    govgr_verified: "gov.gr επαληθεύτηκε",
    eligible_for_activation: "Έτοιμο για ενεργοποίηση",
    active: "Ενεργό",
    suspended: "Σε αναστολή",
    expired: "Έληξε",
    terminated: "Τερματίστηκε",
    superseded: "Αντικαταστάθηκε",
    rejected: "Απορρίφθηκε"
  };
  return labels[status] ?? status;
}

function moneyToMinor(raw: FormDataEntryValue | null): number | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined;
}

function selectedVendor(workspace: CommercialAgreementWorkspace, vendorId: string): AdminAgreementVendor | undefined {
  return workspace.vendors.find((vendor) => vendor.id === vendorId);
}

export function AdminCommercialAgreementsClient({ initial, csrfToken }: { initial: CommercialAgreementWorkspace; csrfToken: string }) {
  const [workspace, setWorkspace] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");

  const vendor = selectedVendor(workspace, selectedVendorId);
  const visible = useMemo(
    () => workspace.agreements.filter((agreement) => !vendorFilter || agreement.vendorId === vendorFilter),
    [workspace, vendorFilter]
  );

  function adopt(data: CommercialAgreementWorkspace & { error?: string; warning?: string }) {
    if (data.error) throw new Error(data.error);
    setWorkspace(data);
    setWarning(data.warning ?? "");
  }

  async function postJson(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const response = await fetch("/api/admin/finance/agreements", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as CommercialAgreementWorkspace & { error?: string; warning?: string };
      if (!response.ok) throw new Error(data.error ?? "Η ενέργεια απέτυχε");
      adopt(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  async function postMultipart(form: FormData) {
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const response = await fetch("/api/admin/finance/agreements", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body: form
      });
      const data = await response.json() as CommercialAgreementWorkspace & { error?: string; warning?: string };
      if (!response.ok) throw new Error(data.error ?? "Η μεταφόρτωση απέτυχε");
      adopt(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η μεταφόρτωση απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const percent = Number(form.get("commissionPercent"));
    const taxPercent = Number(form.get("commissionTaxPercent"));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Η προμήθεια πρέπει να είναι από 0% έως 100%.");
      return;
    }
    if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
      setError("Ο συντελεστής ΦΠΑ προμήθειας δεν είναι έγκυρος.");
      return;
    }

    await postJson({
      action: "create",
      vendorId: String(form.get("vendorId") ?? ""),
      agreementVersion: 1,
      startsAt: String(form.get("startsAt") ?? ""),
      endsAt: String(form.get("endsAt") ?? "") || undefined,
      commissionRateBps: Math.round(percent * 100),
      commissionTaxMode: String(form.get("commissionTaxMode") ?? "included"),
      commissionTaxRateBps: Math.round(taxPercent * 100),
      listingFeeMinor: moneyToMinor(form.get("listingFeeEuro")),
      recurringFeeMinor: moneyToMinor(form.get("recurringFeeEuro")),
      recurringFeePeriod: String(form.get("recurringFeePeriod") ?? "") || undefined,
      vendorLegalForm: String(form.get("vendorLegalForm") ?? "") || undefined,
      vendorTaxOffice: String(form.get("vendorTaxOffice") ?? "") || undefined,
      vendorRegisteredAddress: String(form.get("vendorRegisteredAddress") ?? ""),
      vendorShopAddress: String(form.get("vendorShopAddress") ?? "") || undefined,
      vendorLegalRepresentative: String(form.get("vendorLegalRepresentative") ?? ""),
      vendorContactEmail: String(form.get("vendorContactEmail") ?? ""),
      vendorPhone: String(form.get("vendorPhone") ?? "") || undefined,
      vendorIban: String(form.get("vendorIban") ?? "") || undefined,
      vendorBankBeneficiary: String(form.get("vendorBankBeneficiary") ?? "") || undefined,
      vendorCategories: String(form.get("vendorCategories") ?? "") || undefined,
      planName: String(form.get("planName") ?? "") || undefined,
      commissionBase: "merchandise_gross",
      settlementTerms: String(form.get("settlementTerms") ?? "") || undefined,
      paymentProcessingTerms: String(form.get("paymentProcessingTerms") ?? "") || undefined,
      contractTerm: String(form.get("contractTerm") ?? "") || undefined,
      autoRenewal: String(form.get("autoRenewal") ?? "") || undefined,
      terminationNoticeDays: String(form.get("terminationNoticeDays") ?? "") || undefined,
      specialCommercialTerms: String(form.get("specialCommercialTerms") ?? "") || undefined,
      orderAcceptanceSla: String(form.get("orderAcceptanceSla") ?? "") || undefined,
      fulfilmentSla: String(form.get("fulfilmentSla") ?? "") || undefined,
      pickupShippingMethods: String(form.get("pickupShippingMethods") ?? "") || undefined,
      stockFreshnessRequirement: String(form.get("stockFreshnessRequirement") ?? "") || undefined,
      supportSla: String(form.get("supportSla") ?? "") || undefined
    });

    formElement.reset();
    setSelectedVendorId("");
  }

  async function uploadSigned(event: FormEvent<HTMLFormElement>, agreementId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("action", "signed_upload");
    form.set("agreementId", agreementId);
    await postMultipart(form);
  }

  async function downloadPdf(agreementId: string, kind: "unsigned" | "signed") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/finance/agreements?agreementId=${encodeURIComponent(agreementId)}&document=${kind}`, {
        headers: { accept: "application/pdf" }
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Η λήψη του PDF απέτυχε");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `agreement-${agreementId}-${kind}.pdf`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η λήψη του PDF απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="shell vendor-section">
      <div className="workspace-section-heading">
        <div>
          <div className="eyebrow">Vendor contract lifecycle</div>
          <h2>Νέα συμφωνία συνεργασίας</h2>
          <p>Τα στοιχεία αποθηκεύονται ως αμετάβλητο snapshot της συγκεκριμένης έκδοσης. Με την αποθήκευση δημιουργείται αυτόματα το συμβατικό PDF.</p>
        </div>
      </div>

      <div className="workspace-callout">
        <strong>Κανόνας ενεργοποίησης</strong>
        <span>Ο vendor δεν μπορεί να γίνει ενεργός πριν αποθηκευτεί το τελικό συνυπογεγραμμένο PDF του gov.gr, καταχωριστεί ο κωδικός επαλήθευσης και ο admin επιβεβαιώσει ρητά την επαλήθευσή του.</span>
      </div>

      <form className="vendor-form-card" onSubmit={create}>
        <div className="form-grid">
          <label>Κωδικός συμφωνίας
            <input value={workspace.nextAgreementCode} readOnly aria-readonly="true" />
            <small>Δημιουργείται οριστικά από τον server κατά την αποθήκευση.</small>
          </label>
          <label>Vendor
            <select name="vendorId" required value={selectedVendorId} onChange={(event) => setSelectedVendorId(event.target.value)}>
              <option value="" disabled>Επιλέξτε vendor</option>
              {workspace.vendors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}
            </select>
          </label>
          <label>Έναρξη συνεργασίας<input name="startsAt" type="datetime-local" required /></label>
          <label>Λήξη, αν υπάρχει<input name="endsAt" type="datetime-local" /></label>
        </div>

        {vendor && <fieldset key={vendor.id} className="vendor-form-fieldset">
          <legend>Στοιχεία συμβαλλόμενου vendor</legend>
          <div className="form-grid">
            <label>Επωνυμία<input value={vendor.legalName} readOnly /></label>
            <label>Διακριτικός τίτλος<input value={vendor.tradingName} readOnly /></label>
            <label>ΑΦΜ<input value={vendor.taxNumber ?? ""} readOnly /></label>
            <label>ΓΕΜΗ<input value={vendor.gemiNumber ?? ""} readOnly /></label>
            <label>Νομική μορφή<input name="vendorLegalForm" defaultValue={vendor.legalForm ?? ""} /></label>
            <label>Δ.Ο.Υ.<input name="vendorTaxOffice" placeholder="π.χ. Δ.Ο.Υ. Σπάρτης" /></label>
            <label>Νόμιμος εκπρόσωπος<input name="vendorLegalRepresentative" required placeholder="Ονοματεπώνυμο" /></label>
            <label>Email σύμβασης<input name="vendorContactEmail" type="email" required defaultValue={vendor.contactEmail ?? ""} /></label>
            <label>Τηλέφωνο<input name="vendorPhone" defaultValue={vendor.phone ?? ""} /></label>
            <label>IBAN<input name="vendorIban" autoComplete="off" placeholder="GR…" /></label>
            <label className="form-span-2">Δικαιούχος τραπεζικού λογαριασμού<input name="vendorBankBeneficiary" /></label>
            <label className="form-span-2">Έδρα<input name="vendorRegisteredAddress" required defaultValue={vendor.registeredAddress ?? vendor.shopAddress ?? ""} /></label>
            <label className="form-span-2">Διεύθυνση καταστήματος<input name="vendorShopAddress" defaultValue={vendor.shopAddress ?? vendor.registeredAddress ?? ""} /></label>
            <label className="form-span-2">Κατηγορίες δραστηριότητας<input name="vendorCategories" defaultValue={vendor.primaryCategory ?? ""} /></label>
          </div>
        </fieldset>}

        <fieldset className="vendor-form-fieldset">
          <legend>Οικονομικοί όροι</legend>
          <div className="form-grid">
            <label>Πρόγραμμα συνεργασίας<input name="planName" placeholder="π.χ. Annual / Monthly / Founding Partner" /></label>
            <label>Προμήθεια επί πώλησης %<input name="commissionPercent" type="number" min="0" max="100" step="0.01" required placeholder="5.00" /></label>
            <label>ΦΠΑ προμήθειας
              <select name="commissionTaxMode" defaultValue="included">
                <option value="included">Περιλαμβάνεται στην προμήθεια</option>
                <option value="plus_vat">Προστίθεται στην προμήθεια</option>
                <option value="none">Χωρίς ΦΠΑ</option>
              </select>
            </label>
            <label>Συντελεστής ΦΠΑ προμήθειας %<input name="commissionTaxPercent" type="number" min="0" max="100" step="0.01" defaultValue="24" /></label>
            <label>One-time / listing fee €<input name="listingFeeEuro" type="number" min="0" step="0.01" /></label>
            <label>Recurring fee €<input name="recurringFeeEuro" type="number" min="0" step="0.01" /></label>
            <label>Περίοδος recurring fee
              <select name="recurringFeePeriod" defaultValue="">
                <option value="">—</option>
                <option value="month">Μήνας</option>
                <option value="year">Έτος</option>
                <option value="term">Συμφωνημένη περίοδος</option>
              </select>
            </label>
            <label>Προειδοποίηση καταγγελίας (ημέρες)<input name="terminationNoticeDays" type="number" min="0" step="1" /></label>
            <label className="form-span-2">Όροι εκκαθάρισης<input name="settlementTerms" placeholder="π.χ. μηνιαία εκκαθάριση μετά από επιστροφές/αντιλογισμούς" /></label>
            <label className="form-span-2">Έξοδα / όροι payment processing<input name="paymentProcessingTerms" /></label>
            <label>Διάρκεια σύμβασης<input name="contractTerm" placeholder="π.χ. 12 μήνες" /></label>
            <label>Αυτόματη ανανέωση<input name="autoRenewal" placeholder="Ναι / Όχι και όροι" /></label>
            <label className="form-span-2">Ειδικοί εμπορικοί όροι<textarea name="specialCommercialTerms" rows={3} /></label>
          </div>
        </fieldset>

        <fieldset className="vendor-form-fieldset">
          <legend>Λειτουργικοί όροι / SLA</legend>
          <div className="form-grid">
            <label>Επιβεβαίωση παραγγελίας<input name="orderAcceptanceSla" placeholder="π.χ. εντός 2 ωρών λειτουργίας" /></label>
            <label>Χρόνος προετοιμασίας<input name="fulfilmentSla" /></label>
            <label>Παραλαβή / αποστολή<input name="pickupShippingMethods" /></label>
            <label>Freshness αποθέματος<input name="stockFreshnessRequirement" /></label>
            <label className="form-span-2">Χρόνος απόκρισης support<input name="supportSla" /></label>
          </div>
        </fieldset>

        <div className="workspace-action-bar">
          <span>Επίσημη επικοινωνία KONTA MOY: <strong>info@kontamou.site</strong></span>
          <button className="button button-primary" disabled={busy || !selectedVendorId}>{busy ? "Αποθήκευση…" : "Αποθήκευση & δημιουργία PDF"}</button>
        </div>
        {warning && <p className="form-warning" role="status">{warning}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </section>

    <section className="vendor-section section-tint">
      <div className="shell">
        <div className="workspace-section-heading">
          <div>
            <div className="eyebrow">Agreement evidence</div>
            <h2>Συμφωνίες vendors</h2>
            <p>Κάθε κάρτα ακολουθεί το ίδιο audit-able workflow: PDF → υπογραφές gov.gr → signed PDF + reference → επαλήθευση → ενεργοποίηση.</p>
          </div>
          <label>Vendor filter
            <select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}>
              <option value="">Όλοι</option>
              {workspace.vendors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>

        {visible.length === 0 ? <div className="workspace-empty-state">
          <strong>Δεν υπάρχουν συμφωνίες.</strong>
          <span>Καμία προμήθεια ή ενεργοποίηση vendor δεν θεωρείται δεδομένη χωρίς καταχωρισμένη συμφωνία.</span>
        </div> : <div className="workspace-queue-list">
          {visible.map((agreement) => {
            const canUploadSigned = ["pdf_generated","sent","pending_signature","signed_received"].includes(agreement.status) && agreement.unsignedPdfAvailable && !agreement.govgrVerifiedAt;
            const canVerify = agreement.status === "signed_received" && agreement.signedPdfAvailable && Boolean(agreement.govgrReference);
            const canActivate = ["govgr_verified","eligible_for_activation","suspended"].includes(agreement.status) && Boolean(agreement.govgrVerifiedAt) && agreement.signedPdfAvailable;

            return <article className="workspace-queue-card" key={agreement.id}>
              <div className="workspace-queue-head">
                <div>
                  <strong>{agreement.vendorName}</strong>
                  <small>{agreement.agreementCode} · v{agreement.agreementVersion}</small>
                </div>
                <span className="status-pill">{statusLabel(agreement.status)}</span>
              </div>

              <div className="workspace-queue-primary">
                <span>Commission <strong>{pct(agreement.commissionRateBps)}</strong></span>
                <span>{agreement.commissionTaxMode} · VAT {pct(agreement.commissionTaxRateBps)}</span>
                <span>{localDate(agreement.startsAt)} → {localDate(agreement.endsAt)}</span>
              </div>

              <div className="workspace-compact-list">
                <div className="workspace-compact-row"><strong>1. Contract data</strong><span>✓ {agreement.agreementCode}</span></div>
                <div className="workspace-compact-row"><strong>2. Unsigned PDF</strong><span>{agreement.unsignedPdfAvailable ? `✓ ${localDate(agreement.pdfGeneratedAt)}` : "Εκκρεμεί"}</span></div>
                <div className="workspace-compact-row"><strong>3. Αποστολή vendor</strong><span>{agreement.pdfSentAt ? `✓ ${localDate(agreement.pdfSentAt)}` : "Εκκρεμεί / προαιρετική"}</span></div>
                <div className="workspace-compact-row"><strong>4. Signed gov.gr PDF</strong><span>{agreement.signedPdfAvailable ? `✓ ${localDate(agreement.signedDocumentReceivedAt)}` : "Εκκρεμεί"}</span></div>
                <div className="workspace-compact-row"><strong>5. Reference gov.gr</strong><span>{agreement.govgrReference ?? "Εκκρεμεί"}</span></div>
                <div className="workspace-compact-row"><strong>6. Επαλήθευση admin</strong><span>{agreement.govgrVerifiedAt ? `✓ ${new Date(agreement.govgrVerifiedAt).toLocaleString("el-GR")}` : "Εκκρεμεί"}</span></div>
                <div className="workspace-compact-row"><strong>7. Vendor activation</strong><span>{agreement.status === "active" ? `✓ ${localDate(agreement.activatedAt)}` : "Μπλοκαρισμένη μέχρι την επαλήθευση"}</span></div>
              </div>

              <details className="workspace-record-details">
                <summary>Commercial & legal snapshot</summary>
                <div className="workspace-compact-list">
                  <div className="workspace-compact-row"><strong>Vendor email</strong><span>{agreement.vendorEmail ?? "—"}</span></div>
                  <div className="workspace-compact-row"><strong>Signed</strong><span>{localDate(agreement.signedAt)}</span></div>
                  <div className="workspace-compact-row"><strong>Document reference</strong><span>{agreement.sourceDocumentReference ?? "—"}</span></div>
                  <div className="workspace-compact-row"><strong>Listing fee</strong><span>{euroMinor(agreement.listingFeeMinor)}</span></div>
                  <div className="workspace-compact-row"><strong>Recurring</strong><span>{euroMinor(agreement.recurringFeeMinor)} {agreement.recurringFeePeriod ?? ""}</span></div>
                </div>
              </details>

              {canUploadSigned && <form className="vendor-form-card" onSubmit={(event) => void uploadSigned(event, agreement.id)}>
                <strong>Καταχώριση συνυπογεγραμμένου εγγράφου gov.gr</strong>
                <div className="form-grid">
                  <label>Reference υπογεγραμμένου εγγράφου<input name="govgrReference" required placeholder="Κωδικός / reference επαλήθευσης gov.gr" /></label>
                  <label>Ημερομηνία υπογραφής<input name="signedAt" type="datetime-local" /></label>
                  <label className="form-span-2">Τελικό PDF gov.gr<input name="signedPdf" type="file" accept="application/pdf,.pdf" required /></label>
                </div>
                <button className="button button-secondary" disabled={busy}>Αποθήκευση signed PDF & reference</button>
              </form>}

              <div className="workspace-action-bar">
                <span>Updated {new Date(agreement.updatedAt).toLocaleString("el-GR")}</span>
                <div className="workspace-action-buttons">
                  {!agreement.unsignedPdfAvailable && ["data_complete","pdf_generated"].includes(agreement.status) && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void postJson({ action: "generate_pdf", agreementId: agreement.id })}>Δημιουργία PDF</button>}
                  {agreement.unsignedPdfAvailable && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void downloadPdf(agreement.id, "unsigned")}>Λήψη αρχικού PDF</button>}
                  {agreement.unsignedPdfAvailable && ["pdf_generated","sent","pending_signature"].includes(agreement.status) && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void postJson({ action: "email_pdf", agreementId: agreement.id })}>Αποστολή στον vendor</button>}
                  {agreement.signedPdfAvailable && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void downloadPdf(agreement.id, "signed")}>Λήψη signed PDF</button>}
                  {canVerify && <a className="button button-secondary" href="https://www.gov.gr/ipiresies/polites-kai-kathemerinoteta/psephiaka-eggrapha-gov-gr/elegkhos-egkurotetas-eggraphon-gov-gr" target="_blank" rel="noreferrer">Έλεγχος στο gov.gr</a>}
                  {canVerify && <button type="button" className="button button-primary" disabled={busy} onClick={() => {
                    if (!window.confirm(`Έχετε ελέγξει στο gov.gr ότι το reference ${agreement.govgrReference} αντιστοιχεί στο τελικό συνυπογεγραμμένο έγγραφο ${agreement.agreementCode};`)) return;
                    void postJson({ action: "verify_govgr", agreementId: agreement.id, confirmed: true });
                  }}>Επιβεβαίωση επαλήθευσης</button>}
                  {canActivate && <button type="button" className="button button-primary" disabled={busy} onClick={() => {
                    if (!window.confirm(`Ενεργοποίηση του vendor ${agreement.vendorName}; Η συμφωνία ${agreement.agreementCode} έχει επαληθευτεί.`)) return;
                    void postJson({ action: "activate", agreementId: agreement.id });
                  }}>{agreement.status === "suspended" ? "Επανενεργοποίηση" : "Ενεργοποίηση vendor"}</button>}
                  {agreement.status === "active" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void postJson({ action: "status", agreementId: agreement.id, status: "suspended" })}>Suspend</button>}
                  {["data_complete","pdf_generated","sent","pending_signature","signed_received","govgr_verified","eligible_for_activation","active","suspended"].includes(agreement.status) && <button type="button" className="button admin-danger" disabled={busy} onClick={() => {
                    if (window.confirm("Terminate this agreement?")) void postJson({ action: "status", agreementId: agreement.id, status: "terminated", endsAt: new Date().toISOString() });
                  }}>Terminate</button>}
                </div>
              </div>
            </article>;
          })}
        </div>}
        {warning && <p className="form-warning" role="status">{warning}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  </>;
}
