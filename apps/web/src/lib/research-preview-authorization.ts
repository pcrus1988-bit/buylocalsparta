import "server-only";

import { cookies } from "next/headers";
import { getAdminSession } from "./admin-session";
import { hasAdminPermission } from "./admin-runtime";
import { rawResearchAnswerAccess } from "./research-survey-response-admin";
import { RESEARCH_PREVIEW_COOKIE, validResearchPreviewTicket } from "./research-preview-access";

/** Existing eligible administrators OR the dedicated aggregate-preview session. */
export async function canReadResearchResultsPreview(): Promise<boolean> {
  if (validResearchPreviewTicket((await cookies()).get(RESEARCH_PREVIEW_COOKIE)?.value)) return true;
  const principal = await getAdminSession();
  return Boolean(principal && hasAdminPermission(principal, "research.read") && rawResearchAnswerAccess(principal));
}
