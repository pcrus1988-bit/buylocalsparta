import { createHash } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { buildDirectoryAgreementPreview, renderDirectoryAgreementPreviewPdf } from "./vendor-directory-agreement-pdf";
import { vendorAgreementPlanTerms } from "./vendor-plan-agreements";

type ClaimAgreementSubject = Readonly<{
  public_id: string;
  plan_code: string;
  billing_cycle: string;
  legal_name: string;
  business_name: string;
  tax_number: string;
  contact_name: string;
  email: string;
}>;

export function claimDirectoryAgreement(subject: ClaimAgreementSubject) {
  if (subject.plan_code !== "claim" || subject.billing_cycle !== "annual") {
    throw new Error("CLAIM_AGREEMENT_PLAN_MISMATCH");
  }
  const plan = vendorAgreementPlanTerms("claim", "annual");
  if (plan.legalReviewStatus !== "approved") throw new Error("CLAIM_AGREEMENT_UNAPPROVED");
  const agreementCode = "CLAIM-" + subject.public_id;
  const createdAt = "2026-10-20T00:00:00.000Z";
  const vendor = {
    legalName: subject.legal_name,
    tradingName: subject.business_name,
    taxNumber: subject.tax_number,
    legalRepresentative: subject.contact_name,
    contactEmail: subject.email
  };
  // Hash the precise, fully resolved plan and actual legal text that the owner can view.
  // This must change when a clause, amount, party or template version changes.
  const document = buildDirectoryAgreementPreview({ agreementCode, createdAt, vendor, plan });
  const terms = { agreementCode, createdAt, vendor, plan, documentContent: document.content };
  const templateSha256 = createHash("sha256").update(JSON.stringify(terms)).digest("hex");
  return { plan, vendor, agreementCode, createdAt, templateSha256, terms };
}

export async function claimDirectoryAgreementForViewer(id: string, principal: SessionPrincipal) {
  if (!/^hubprospect_[A-Za-z0-9_-]{6,90}$/.test(id) || !principal.roles.includes("customer")) {
    throw new Error("CLAIM_AGREEMENT_AUTH_REQUIRED");
  }
  const rows = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT h.public_id,h.plan_code,h.billing_cycle,h.legal_name,h.business_name,
           h.tax_number,h.contact_name,h.email
    FROM hub_expansion_prospects h
    JOIN users u ON lower(u.email::text)=lower(h.email)
      AND u.public_id=$2 AND u.status='active' AND u.email_verified_at IS NOT NULL
    WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status='approved'
    LIMIT 1
  `, [id, principal.userId]);
  if (!rows.rowCount) throw new Error("CLAIM_AGREEMENT_NOT_ELIGIBLE");
  return claimDirectoryAgreement(rows.rows[0] as ClaimAgreementSubject);
}

export async function renderClaimDirectoryAgreementPdf(id: string, principal: SessionPrincipal) {
  const approved = await claimDirectoryAgreementForViewer(id, principal);
  return renderDirectoryAgreementPreviewPdf({
    agreementCode: approved.agreementCode, createdAt: approved.createdAt,
    vendor: approved.vendor, plan: approved.plan
  });
}
