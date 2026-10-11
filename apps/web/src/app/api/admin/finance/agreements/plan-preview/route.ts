import { requireAdminSession } from "../../../../../../lib/admin-session";
import { getProductionPostgresRuntime } from "../../../../../../lib/postgres-runtime";
import { renderDirectoryAgreementPreviewPdf } from "../../../../../../lib/vendor-directory-agreement-pdf";
import { renderVendorAgreementPdf, type VendorAgreementPdfData } from "../../../../../../lib/vendor-agreement-pdf";
import {
  isVendorAgreementPlanCode,
  planAgreementCommercialSnapshot,
  vendorAgreementPlanTerms,
  type VendorPlanAgreementTerms
} from "../../../../../../lib/vendor-plan-agreements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function field(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function previewProspect(id: string, code: string, cycle: string) {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(
    "SELECT public_id,plan_code,billing_cycle,legal_name,business_name,tax_number,gemi_number,email,phone,address_line,contact_name,setup_fee_cents FROM hub_expansion_prospects WHERE public_id=$1 OR id::text=$1 LIMIT 1",
    [id]
  );
  if (!result.rowCount) throw new Error("Hub applicant not found");
  const row = result.rows[0];
  if (String(row.plan_code) !== code || (code !== "claim" && String(row.billing_cycle) !== cycle)) {
    throw new Error("Requested agreement plan or billing cycle does not match the saved application");
  }
  return {
    subject: {
      legalName: String(row.legal_name || row.business_name || ""),
      tradingName: field(row.business_name),
      taxNumber: field(row.tax_number),
      gemiNumber: field(row.gemi_number),
      contactEmail: field(row.email),
      phone: field(row.phone),
      registeredAddress: field(row.address_line),
      // Application contact is not proof of legal representation; verify separately.
      legalRepresentative: undefined
    },
    setupFeeMinor: Number(row.setup_fee_cents),
    reference: String(row.public_id)
  };
}

async function previewSpartaVendor(id: string) {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(
    "SELECT v.public_id,v.legal_name,v.trading_name,v.tax_number,v.gemi_number,va.contact_email,va.phone,COALESCE(va.address_line1,vl.address_line1) AS address_line1 FROM vendor_businesses v LEFT JOIN LATERAL (SELECT contact_email,phone,address_line1 FROM vendor_applications WHERE vendor_id=v.id ORDER BY created_at DESC LIMIT 1) va ON true LEFT JOIN LATERAL (SELECT address_line1 FROM vendor_locations WHERE vendor_id=v.id ORDER BY is_primary DESC LIMIT 1) vl ON true WHERE v.public_id=$1 OR v.id::text=$1 LIMIT 1",
    [id]
  );
  if (!result.rowCount) throw new Error("Vendor not found");
  const row = result.rows[0];
  return {
    subject: {
      legalName: String(row.legal_name),
      tradingName: field(row.trading_name),
      taxNumber: field(row.tax_number),
      gemiNumber: field(row.gemi_number),
      contactEmail: field(row.contact_email),
      phone: field(row.phone),
      registeredAddress: field(row.address_line1)
    },
    reference: String(row.public_id)
  };
}

async function renderPreview(
  plan: VendorPlanAgreementTerms,
  subject: VendorAgreementPdfData["vendor"],
  reference: string
): Promise<Buffer> {
  const agreementCode = "PREVIEW-" + reference.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
  const createdAt = new Date().toISOString();
  if (plan.kind === "directory") {
    return renderDirectoryAgreementPreviewPdf({ plan, vendor: subject, agreementCode, createdAt });
  }
  const terms = planAgreementCommercialSnapshot(plan);
  return renderVendorAgreementPdf({
    agreementCode, agreementVersion: 1, createdAt, startsAt: createdAt,
    vendor: subject,
    commercial: {
      ...terms,
      commissionTaxMode: "plus_vat",
      commissionTaxRateBps: 2400,
      commissionBase: "merchandise_gross",
      specialCommercialTerms: "Εφαρμόζονται αποκλειστικά οι λειτουργίες του επιλεγμένου πλάνου και η συμφωνημένη διάρκεια. Οριστικοποίηση μόνο μετά από νομικό έλεγχο και επαλήθευση των οικονομικών/φορολογικών όρων.",
      settlementTerms: "Καθορίζεται ειδικά πριν από την τελική υπογραφή.",
      paymentProcessingTerms: "Καθορίζονται ειδικά πριν από την τελική υπογραφή."
    }
  });
}

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "finance.read" });
    const url = new URL(request.url);
    const code = url.searchParams.get("plan") || "";
    if (!isVendorAgreementPlanCode(code)) {
      return Response.json({ error: "Valid agreement plan is required" }, { status: 400 });
    }
    const billing = url.searchParams.get("billing") === "annual" ? "annual" : "monthly";
    const plan = vendorAgreementPlanTerms(code, billing);
    const templateOnly = url.searchParams.get("template") === "1";
    const id = (url.searchParams.get(plan.market === "sparta" ? "vendorId" : "prospectId") || "").trim();
    if (!templateOnly && !/^[A-Za-z0-9_-]{6,120}$/.test(id)) {
      return Response.json({ error: "A valid vendor or prospect reference is required" }, { status: 400 });
    }
    const source = templateOnly ? {
      subject: {
        legalName: "ΣΥΜΠΛΗΡΩΝΕΤΑΙ — Επωνυμία επιχείρησης",
        tradingName: "ΣΥΜΠΛΗΡΩΝΕΤΑΙ — Διακριτικός τίτλος",
        contactEmail: "ΣΥΜΠΛΗΡΩΝΕΤΑΙ — Εmail"
      },
      reference: "TEMPLATE-" + code
    } : plan.market === "sparta"
      ? await previewSpartaVendor(id)
      : await previewProspect(id, code, plan.billingCycle);
    if ("setupFeeMinor" in source) {
      const savedSetupFee = source.setupFeeMinor;
      if (typeof savedSetupFee !== "number" ||
          !Number.isSafeInteger(savedSetupFee) ||
          savedSetupFee < 0 || savedSetupFee > plan.setupFeeMinor) {
        throw new Error("Application setup fee cannot be reconciled with the plan catalogue");
      }
    }
    const resolvedPlan = "setupFeeMinor" in source && typeof source.setupFeeMinor === "number"
      ? { ...plan, setupFeeMinor: source.setupFeeMinor } : plan;
    const buffer = await renderPreview(resolvedPlan, source.subject, source.reference);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=KONTAMOU-" + code + "-DRAFT.pdf",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Agreement preview unavailable";
    return Response.json({ error: message }, {
      status: message === "AUTH_REQUIRED" ? 401 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
