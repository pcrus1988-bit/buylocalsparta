"use server";

import { redirect } from "next/navigation";
import { getVendorSession } from "../../../lib/vendor-session";
import { createReport, emailReport, reportSpecFromForm, saveReportDefinition } from "../../../lib/reporting-engine";
import { resolveReportPrincipal } from "../../../lib/reporting-principal";
import { runSavedReport } from "../../../lib/reporting-saved";

async function vendorReportPrincipal() {
  const sessionPrincipal = await getVendorSession();
  if (!sessionPrincipal) redirect("/vendor/login");
  return resolveReportPrincipal(sessionPrincipal);
}

export async function createVendorReportAction(formData: FormData) {
  const principal = await vendorReportPrincipal();
  let destination: string;
  try {
    const spec = reportSpecFromForm("vendor", principal, formData);
    const job = await createReport("vendor", principal, spec);
    destination = `/vendor/reports?report=${encodeURIComponent(job.publicId)}&created=1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία δημιουργίας αναφοράς.";
    destination = `/vendor/reports?error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}

export async function runSavedVendorReportAction(formData: FormData) {
  const principal = await vendorReportPrincipal();
  const templateId = String(formData.get("templateId") ?? "");
  let destination: string;
  try {
    const job = await runSavedReport("vendor", principal, templateId);
    destination = `/vendor/reports?report=${encodeURIComponent(job.publicId)}&created=1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία εκτέλεσης report template.";
    destination = `/vendor/reports?error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}

export async function emailVendorReportAction(formData: FormData) {
  const principal = await vendorReportPrincipal();
  const reportId = String(formData.get("reportId") ?? "");
  let destination: string;
  try {
    const result = await emailReport("vendor", principal, reportId);
    destination = `/vendor/reports?report=${encodeURIComponent(reportId)}&emailed=${result.sent ? "1" : "0"}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία αποστολής email.";
    destination = `/vendor/reports?report=${encodeURIComponent(reportId)}&error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}

export async function saveVendorReportDefinitionAction(formData: FormData) {
  const principal = await vendorReportPrincipal();
  let destination: string;
  try {
    const spec = reportSpecFromForm("vendor", principal, formData);
    const templateName = String(formData.get("templateName") ?? "").trim();
    await saveReportDefinition("vendor", principal, templateName || spec.title, spec);
    destination = "/vendor/reports?saved=1";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία αποθήκευσης προτύπου.";
    destination = `/vendor/reports?error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}
