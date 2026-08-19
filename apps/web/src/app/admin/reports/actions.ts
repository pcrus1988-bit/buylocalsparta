"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/admin-session";
import { createReport, emailReport, reportSpecFromForm, saveReportDefinition } from "../../../lib/reporting-engine";

export async function createAdminReportAction(formData: FormData) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
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

export async function emailAdminReportAction(formData: FormData) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
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
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let destination: string;
  try {
    const spec = reportSpecFromForm("admin", principal, formData);
    const name = String(formData.get("templateName") ?? spec.title);
    await saveReportDefinition("admin", principal, name, spec);
    destination = "/admin/reports?saved=1";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία αποθήκευσης προτύπου.";
    destination = `/admin/reports?error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}
