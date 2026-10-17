"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "../../../../lib/admin-session";
import { assertAdminCsrf, assertAdminPermission, recordAdminAudit } from "../../../../lib/admin-runtime";
import {
  dispatchPressBatch, preparePressRelease, savePressList, savePressRelease,
  sendPressTest, suppressPressRecipient
} from "../../../../lib/research-press-office";

const path = "/admin/research/press";
const str = (v: FormDataEntryValue | null): string => typeof v === "string" ? v : "";
const url = (id?: string, name?: string, value?: string) => {
  const params = new URLSearchParams();
  if (id) params.set("id", id);
  if (name && value) params.set(name, value.replace(/[\r\n]+/g," ").slice(0,260));
  return path + (params.size ? "?" + params.toString() : "");
};
const err = (error: unknown, id?: string): never =>
  redirect(url(id, "error", error instanceof Error ? error.message : "Operation failed"));

async function principal(form: FormData) {
  const p = await getAdminSession();
  if (!p) throw new Error("Admin session required.");
  assertAdminPermission(p, "research.publish.manage");
  assertAdminCsrf(p, str(form.get("csrfToken")));
  return p;
}

export async function savePressAction(form: FormData): Promise<void> {
  const id = str(form.get("id"));
  let nextId = id;
  try {
    const p = await principal(form);
    const file = form.get("attachment");
    const fileEn = form.get("attachmentEn");
    const csv = form.get("recipientCsv");
    nextId = await savePressRelease(p,{
      id: id || undefined,
      title: str(form.get("title")),
      subject: str(form.get("subject")),
      bodyHtml: str(form.get("bodyHtml")),
      subjectEn: str(form.get("subjectEn")),
      bodyHtmlEn: str(form.get("bodyHtmlEn")),
      recipientCsv: csv instanceof File && csv.size ? csv : undefined,
      selectedListId: str(form.get("selectedListId")) || undefined,
      importMode: str(form.get("importMode"))==="append"?"append":"replace",
      file: file instanceof File && file.size ? file : undefined,
      fileEn: fileEn instanceof File && fileEn.size ? fileEn : undefined,
      clearAttachment: form.get("clearAttachment")==="yes",
      clearAttachmentEn: form.get("clearAttachmentEn")==="yes"
    });
    await recordAdminAudit(p,"research.press.saved","research_press_release",nextId,"Draft saved");
  } catch(error) { err(error, id); }
  revalidatePath(path);
  redirect(url(nextId,"notice","saved"));
}

export async function pressListAction(form: FormData): Promise<void> {
  try {
    const p = await principal(form);
    const csv=form.get("listCsv");
    if(!(csv instanceof File) || !csv.size) throw new Error("Upload a language-tagged contacts CSV first.");
    await savePressList(p,str(form.get("listName")),csv);
    await recordAdminAudit(p,"research.press.list.saved","research_press_list","selection","Press list saved");
  } catch(error) { err(error,str(form.get("id"))); }
  revalidatePath(path);
  redirect(url(str(form.get("id")),"notice","list"));
}

export async function suppressPressAction(form: FormData): Promise<void> {
  try {
    const p=await principal(form);
    await suppressPressRecipient(p,str(form.get("email")),str(form.get("reason")));
    await recordAdminAudit(p,"research.press.suppressed","research_press_contact","suppressed","Recipient opted out / bounced");
  } catch(error) { err(error,str(form.get("id"))); }
  revalidatePath(path);
  redirect(url(str(form.get("id")),"notice","suppressed"));
}

export async function preparePressAction(form: FormData): Promise<void> {
  const id=str(form.get("id"));
  try {
    const p=await principal(form);
    if (str(form.get("confirm")) !== "PREPARE") throw new Error("Type PREPARE to confirm the exact saved recipient list.");
    const count=await preparePressRelease(p,id);
    await recordAdminAudit(p,"research.press.prepared","research_press_release",id,"Recipients frozen for sending",{recipientCount:count});
  } catch(error) { err(error,id); }
  revalidatePath(path);
  redirect(url(id,"notice","prepared"));
}

export async function testPressAction(form: FormData): Promise<void> {
  const id=str(form.get("id"));
  try {
    const p=await principal(form);
    const target=str(form.get("testAddress"));
    if (str(form.get("confirmTest"))!=="yes") throw new Error("Confirm this real test email first.");
    await sendPressTest(p,id,target,str(form.get("testLanguage")) as "el"|"en");
  } catch(error) { err(error,id); }
  revalidatePath(path);
  redirect(url(id,"notice","test"));
}

export async function dispatchPressAction(form: FormData): Promise<void> {
  const id=str(form.get("id"));
  try {
    const p=await principal(form);
    if (str(form.get("confirmRecipients"))!=="yes" || str(form.get("confirmation"))!=="SEND") {
      throw new Error("Review the recipients, tick the acknowledgement and type SEND.");
    }
    const result=await dispatchPressBatch(p,id);
    revalidatePath(path);
    redirect(url(id,"batch",result.sent+"/"+result.attempted+"/"+result.remaining));
  } catch(error) {
    // redirect() uses a framework exception; preserve successful redirect.
    if (error && typeof error==="object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    err(error,id);
  }
}
