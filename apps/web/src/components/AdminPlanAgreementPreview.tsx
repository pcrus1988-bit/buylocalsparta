"use client";

import { useState } from "react";
import {
  VENDOR_AGREEMENT_PLAN_CODES,
  vendorAgreementPlanTerms,
  type VendorAgreementPlanCode
} from "../lib/vendor-plan-agreements";

function money(cents: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * Read-only prospect/vendor PDF generator. This does NOT activate a vendor,
 * sign a contract, or store a signed agreement in the vault.
 */
export function AdminPlanAgreementPreview() {
  const [planCode, setPlanCode] = useState<VendorAgreementPlanCode>("claim");
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const plan = vendorAgreementPlanTerms(planCode, billing);
  const isHub = plan.market === "expansion_hubs";
  const referenceLabel = isHub ? "Κωδικός HUB αίτησης / prospect" : "Vendor ID / public ID";

  return <section className="shell vendor-section">
    <div className="workspace-section-heading">
      <div>
        <div className="eyebrow">8 versioned contract generators</div>
        <h2>Προσχέδιο συμφωνίας ανά πρόγραμμα</h2>
        <p>Δημιουργεί PDF από την καταχωρισμένη αίτηση HUB ή τον vendor Σπάρτης με κλειδωμένη τιμολογιακή πολιτική και σαφείς λειτουργίες. Το PDF είναι μόνο προσχέδιο και δεν αποτελεί αποδοχή ή υπογραφή.</p>
      </div>
    </div>
    <form className="vendor-form-card"
      action="/api/admin/finance/agreements/plan-preview"
      method="get" target="_blank">
      <div className="form-grid">
        <label>Πρόγραμμα
          <select name="plan" value={planCode} onChange={event => setPlanCode(event.target.value as VendorAgreementPlanCode)}>
            {VENDOR_AGREEMENT_PLAN_CODES.map(code =>
              <option key={code} value={code}>{vendorAgreementPlanTerms(code).name}</option>
            )}
          </select>
        </label>
        <label>Χρέωση
          <select name="billing" value={billing}
            disabled={plan.market === "sparta" || planCode === "claim"}
            onChange={event => setBilling(event.target.value as "annual" | "monthly")}>
            <option value="annual">Ετήσια</option><option value="monthly">Μηνιαία</option>
          </select>
        </label>
        <label key={isHub ? "prospect" : "vendor"} className="form-span-2">{referenceLabel}
          <input name={isHub ? "prospectId" : "vendorId"} required minLength={6} maxLength={120}
            autoComplete="off" placeholder={isHub ? "hub_prospect_…" : "vendor_…"} />
        </label>
      </div>
      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Τύπος</strong><span>{plan.kind === "directory" ? "Μη εμπορική καταχώριση" : "Marketplace merchant"}</span></div>
        <div className="workspace-compact-row"><strong>Εφάπαξ ένταξη</strong><span>{money(plan.setupFeeMinor)}</span></div>
        <div className="workspace-compact-row"><strong>Συνδρομή</strong><span>{money(plan.recurringFeeMinor)} · {plan.recurringFeePeriod ?? "χωρίς περιοδική χρέωση"}</span></div>
        <div className="workspace-compact-row"><strong>Προμήθεια</strong><span>{(plan.commissionRateBps / 100).toLocaleString("el-GR")}%</span></div>
        <div className="workspace-compact-row"><strong>Έκδοση</strong><span>{plan.templateVersion}</span></div>
      </div>
      <p className="workspace-inline-note">Πριν από παραγωγική χρήση απαιτείται έλεγχος του ελληνικού νομικού κειμένου. Τα σχέδια HUB λαμβάνουν υπόψη την ήδη καταχωρισμένη έκπτωση ένταξης. Εάν πλάνο ή κύκλος δεν συμφωνεί με την αίτηση, ο server αρνείται τη δημιουργία.</p>
      <button className="button button-secondary" type="submit">Δημιουργία PDF προσχεδίου →</button>
    </form>
  </section>;
}
