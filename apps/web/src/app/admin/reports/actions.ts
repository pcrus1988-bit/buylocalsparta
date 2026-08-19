"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/admin-session";
import { createReport, emailReport, reportSpecFromForm, saveReportDefinition } from "../../../lib/reporting-engine";
import { resolveReportPrincipal } from "../../../lib/reporting-principal";
import { runSavedReport } from "../../../lib/reporting-saved";

async function adminReportPrincipal() {
  const sessionPrincipal = await getAdminSession();
  if (!sessionPrincipal) redirect("/admin/login");
  return resolveReportPrincipal(sessionPrincipal);
}

export async function createAdminReportAction(formData: FormData) {
  const principal = await adminReportPrincipal();
  let destination: string;
  try {
    const spec = reportSpecFromForm("admin", principal, formData);
    const job = await createReport("admin", principal, spec);
    destination = `/admin/reports?report=${encodeURIComponent(job.publicId)}&created=1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία δημιουργίας αναφοράς.";
    destination = `/admin/reports?error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}

export async function runSavedAdminReportAction(formData: FormData) {
  const principal = await adminReportPrincipal();
  const templateId = String(formData.get("templateId") ?? "");
  let destination: string;
  try {
    const job = await runSavedReport("admin", principal, templateId);
    destination = `/admin/reports?report=${encodeURIComponent(job.publicId)}&created=1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία εκτέλεσης report template.";
    destination = `/admin/reports?error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}

export async function emailAdminReportAction(formData: FormData) {
  const principal = await adminReportPrincipal();
  const reportId = String(formData.get("reportId") ?? "");
  let destination: string;
  try {
    const result = await emailReport("admin", principal, reportId);
    destination = `/admin/reports?report=${encodeURIComponent(reportId)}&emailed=${result.sent ? "1" : "0"}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία αποστολής email.";
    destination = `/admin/reports?report=${encodeURIComponent(reportId)}&error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}

export async function saveAdminReportDefinitionAction(formData: FormData) {
  const principal = await adminReportPrincipal();
  let destination: string;
  try {
    const spec = reportSpecFromForm("admin", principal, formData);
    const templateName = String(formData.get("templateName") ?? "").trim();
    await saveReportDefinition("admin", principal, templateName || spec.title, spec);
    destination = "/admin/reports?saved=1";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία αποθήκευσης προτύπου.";
    destination = `/admin/reports?error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}
