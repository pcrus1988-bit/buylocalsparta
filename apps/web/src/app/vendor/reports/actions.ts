"use server";

import { redirect } from "next/navigation";
import { getVendorSession } from "../../../lib/vendor-session";
import { createReport, emailReport, reportSpecFromForm, saveReportDefinition } from "../../../lib/reporting-engine";

export async function createVendorReportAction(formData: FormData) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
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

export async function emailVendorReportAction(formData: FormData) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
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
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  let destination: string;
  try {
    const spec = reportSpecFromForm("vendor", principal, formData);
    const name = String(formData.get("templateName") ?? spec.title);
    await saveReportDefinition("vendor", principal, name, spec);
    destination = "/vendor/reports?saved=1";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Αποτυχία αποθήκευσης προτύπου.";
    destination = `/vendor/reports?error=${encodeURIComponent(message.slice(0, 500))}`;
  }
  redirect(destination);
}
