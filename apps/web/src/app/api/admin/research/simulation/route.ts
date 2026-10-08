import { buildAdminMailRawMime } from "../../../../../lib/admin-mail-mime";
import { sendRawSesEmail, sesMailConfigFromEnv } from "../../../../../lib/admin-mail-ses";
import { requireAdminSession } from "../../../../../lib/admin-session";
import { assertResearchSimulationEmailReady } from "../../../../../lib/research-survey-mail";
import {
  createSimulationInvitation, readSimulationToken, validSimulationEmail,
  validSimulationSlug
} from "../../../../../lib/research-workflow-simulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const recentSends = new Map<string, number>();

function simulationBaseUrl(): string {
  // Preview tests must stay on their preview deployment; never trust request Host.
  const preview = process.env.VERCEL_URL?.trim();
  if (process.env.VERCEL_ENV === "preview" && preview && /^[a-z0-9-]+\.vercel\.app$/i.test(preview)) {
    return "https://" + preview;
  }
  return "https://kontamou.site";
}

function failure(error: unknown): Response {
  const message = error instanceof Error ? error.message : "SIMULATION_FAILED";
  const status = message.includes("TOKEN_INVALID_OR_EXPIRED") || message.includes("INVITATION_EXPIRED") ? 410
    : message.includes("STUDY_MISMATCH") ? 409
    : message.includes("AUTH") ? 401 : message.includes("permission") || message.includes("CSRF") ? 403
    : message.includes("RATE_LIMIT") ? 429 : message.includes("SES") || message.includes("CONFIGURED")
      || message.includes("DISABLED") ? 503 : 400;
  return Response.json({ error: message }, { status, headers: noStore });
}

async function sendTestMessage(input: {
  to: string; slug: string; runId: string; kind: "invitation" | "admin_notification";
  link?: string; answerCount?: number;
}): Promise<string> {
  const config = assertResearchSimulationEmailReady();
  const from = config.from.match(/<([^<>]+)>/)?.[1] ?? config.from;
  const title = input.kind === "invitation"
    ? "[TEST ONLY] KONTA MOY Research · Rehearsal invitation"
    : "[TEST ONLY] KONTA MOY Research · Admin submission notification";
  const text = input.kind === "invitation"
    ? [
        "ΔΟΚΙΜΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ",
        "Αυτό το μήνυμα ελέγχει τη λήψη email και την προσωπική δοκιμαστική διαδρομή της έρευνας.",
        "Άνοιξε τον σύνδεσμο και συμπλήρωσε τις δοκιμαστικές ερωτήσεις:",
        input.link ?? "",
        "Ο σύνδεσμος λήγει σε 30 λεπτά. Καμία απάντηση δεν αποθηκεύεται στα αποτελέσματα της μελέτης.",
        "Study: " + input.slug,
        "Simulation run: " + input.runId
      ].join("\n\n")
    : [
        "ΔΟΚΙΜΗ — ΕΙΔΟΠΟΙΗΣΗ ΔΙΑΧΕΙΡΙΣΤΗ",
        "Επιβεβαιώθηκε η δοκιμαστική υποβολή μέσω κρυπτογραφικά ελεγμένης απόδειξης.",
        "Study: " + input.slug,
        "Simulation run: " + input.runId,
        "Sample answers submitted: " + String(input.answerCount ?? 0),
        "Δεν έχουν καταχωριστεί πραγματικές απαντήσεις, προσκλήσεις ή συγκαταθέσεις.",
        "Η αποδοχή από το SES δεν αποδεικνύει άφιξη στα εισερχόμενα — επιβεβαίωσέ το χειροκίνητα."
      ].join("\n\n");
  const mime = buildAdminMailRawMime({
    from: { name: "KONTA MOY Research · TEST", address: from },
    to: [{ address: input.to }],
    replyTo: [{ address: config.replyTo.match(/<([^<>]+)>/)?.[1] ?? config.replyTo }],
    subject: title,
    text,
    internetMessageIdDomain: "kontamou.site"
  });
  const result = await sendRawSesEmail({
    config: sesMailConfigFromEnv(),
    raw: mime.raw,
    from,
    to: [input.to],
    configurationSetName: config.configurationSetName,
    emailTags: [
      { name: "research_study", value: input.slug },
      { name: "research_kind", value: "workflow_simulation" },
      { name: "research_attempt_kind", value: input.kind }
    ]
  });
  return result.providerMessageId;
}

export async function POST(request: Request): Promise<Response> {
  let action = "unknown";
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.manage" });
    const raw = await request.text();
    if (raw.length > 8192) throw new Error("SIMULATION_PAYLOAD_TOO_LARGE");
    const body = JSON.parse(raw) as Record<string, unknown>;
    action = typeof body.action === "string" ? body.action : "unknown";
    const slug = typeof body.slug === "string" ? body.slug : "";
    if (!validSimulationSlug(slug)) throw new Error("SIMULATION_STUDY_INVALID");

    if (action === "preview") {
      const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
      if (!validSimulationEmail(to)) throw new Error("SIMULATION_RECIPIENT_INVALID");
      const invitation = createSimulationInvitation(slug, to);
      return Response.json({
        ok: true, status: "dry_run_no_email", runId: invitation.runId,
        expiresAt: invitation.expiresAt,
        previewLink: simulationBaseUrl() + "/research/simulation/" + encodeURIComponent(invitation.token)
      }, { headers: noStore });
    }

    if (action === "send") {
      if (body.confirm !== "SEND ONE TEST EMAIL") throw new Error("SIMULATION_SEND_NOT_CONFIRMED");
      const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
      if (!validSimulationEmail(to)) throw new Error("SIMULATION_RECIPIENT_INVALID");
      // Defense in depth. One destination, never a batch, and a per-instance cooldown.
      const key = principal.userId + ":" + to;
      const last = recentSends.get(key) ?? 0;
      if (Date.now() - last < 60_000) throw new Error("SIMULATION_RATE_LIMIT");
      recentSends.set(key, Date.now());
      try {
        const invitation = createSimulationInvitation(slug, to);
        // Do not construct test links from request Host or Forwarded headers.
        const link = simulationBaseUrl() + "/research/simulation/" + encodeURIComponent(invitation.token);
        const messageId = await sendTestMessage({
          to, slug, runId: invitation.runId, kind: "invitation", link
        });
        return Response.json({
          ok: true, status: "ses_accepted_not_delivered", messageId, runId: invitation.runId,
          expiresAt: invitation.expiresAt, previewLink: link
        }, { headers: noStore });
      } catch (error) {
        recentSends.delete(key);
        throw error;
      }
    }

    if (action === "verify" || action === "notify") {
      const receipt = typeof body.receipt === "string" ? body.receipt.trim() : "";
      const proof = readSimulationToken(receipt, "receipt");
      if (proof.slug !== slug) throw new Error("SIMULATION_STUDY_MISMATCH");
      if (action === "verify") {
        return Response.json({
          ok: true, runId: proof.runId, submittedAt: proof.submittedAt,
          answersCount: proof.answersCount, status: "verified_not_saved"
        }, { headers: noStore });
      }
      if (body.confirm !== "SEND ONE ADMIN TEST NOTICE") throw new Error("SIMULATION_ADMIN_NOTICE_NOT_CONFIRMED");
      const key = principal.userId + ":notice:" + proof.runId;
      if (Date.now() - (recentSends.get(key) ?? 0) < 60_000) throw new Error("SIMULATION_RATE_LIMIT");
      recentSends.set(key, Date.now());
      try {
        const messageId = await sendTestMessage({
          to: proof.recipient, slug, runId: proof.runId, kind: "admin_notification",
          answerCount: proof.answersCount
        });
        return Response.json({ ok: true, status: "ses_accepted_not_delivered", messageId },
          { headers: noStore });
      } catch (error) {
        recentSends.delete(key);
        throw error;
      }
    }
    throw new Error("SIMULATION_ACTION_INVALID");
  } catch (error) {
    // Route handles expected errors itself: emit only a safe diagnostic code,
    // never log addresses, encrypted receipts, invitation URLs or credentials.
    const message = error instanceof Error ? error.message : "SIMULATION_FAILED";
    const safeCode = /^[A-Z0-9_]{3,100}$/.test(message) ? message : "SIMULATION_OPERATION_ERROR";
    console.warn(JSON.stringify({ level: "warn", event: "research.simulation_step_failed", action, code: safeCode }));
    return failure(error);
  }
}
