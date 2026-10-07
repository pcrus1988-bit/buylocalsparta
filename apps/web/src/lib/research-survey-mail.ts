import { createHash } from "node:crypto";
import { buildAdminMailRawMime, type AdminMailAddress } from "./admin-mail-mime";
import { sendRawSesEmail, sesMailConfigFromEnv } from "./admin-mail-ses";

const DEFAULT_FROM = "partners@kontamou.site";
const DEFAULT_REPLY_TO = "partners@kontamou.site";
const DEFAULT_DOMAIN = "kontamou.site";

export type ResearchSurveyEmailConfiguration = Readonly<{
  enabled: boolean;
  from: string;
  replyTo: string;
  configurationSetName?: string;
}>;

export function researchSurveyEmailConfiguration(
  env: NodeJS.ProcessEnv = process.env
): ResearchSurveyEmailConfiguration {
  const enabled = env.BLS_RESEARCH_EMAIL_DELIVERY_ENABLED === "true";
  return {
    enabled,
    from: env.BLS_RESEARCH_SES_FROM?.trim() || DEFAULT_FROM,
    replyTo: env.BLS_RESEARCH_SES_REPLY_TO?.trim() || DEFAULT_REPLY_TO,
    configurationSetName: env.BLS_RESEARCH_SES_CONFIGURATION_SET?.trim() || undefined
  };
}

export function assertResearchSurveyEmailReady(env: NodeJS.ProcessEnv = process.env): ResearchSurveyEmailConfiguration {
  const configuration = researchSurveyEmailConfiguration(env);
  if (!configuration.enabled) {
    throw new Error("RESEARCH_EMAIL_DELIVERY_DISABLED");
  }
  if (!configuration.configurationSetName) {
    throw new Error("BLS_RESEARCH_SES_CONFIGURATION_SET is required for governed research delivery");
  }
  // Resolve credentials up-front so the admin queue action fails before a job is
  // accepted if the dedicated research delivery path is not actually usable.
  sesMailConfigFromEnv(env);
  return configuration;
}

export async function sendResearchSurveyInvitation(input: Readonly<{
  destination: string;
  studySlug: string;
  studyTitle: string;
  inviteId: string;
  batchId?: string;
  attemptId?: string;
  attemptKind?: "initial" | "reminder" | "reissue";
  surveyUrl: string;
  methodologyUrl: string;
  subjectTemplate: string;
  bodyTemplate: string;
}>): Promise<Readonly<{ providerMessageId: string }>> {
  const configuration = assertResearchSurveyEmailReady();
  const replacements = {
    survey_url: input.surveyUrl,
    methodology_url: input.methodologyUrl,
    study_title: input.studyTitle
  };
  const subject = renderRecruitmentTemplate(input.subjectTemplate, replacements).trim();
  const optOutUrl = `${input.surveyUrl}?optout=1`;
  const privacyUrl = new URL("/research/privacy", input.surveyUrl).toString();
  let text = renderRecruitmentTemplate(input.bodyTemplate, replacements).trim();
  if (!subject) throw new Error("RESEARCH_RECRUITMENT_SUBJECT_EMPTY");
  if (!text) throw new Error("RESEARCH_RECRUITMENT_BODY_EMPTY");
  if (!text.includes(input.surveyUrl)) {
    text += `\n\nΣυμμετοχή: ${input.surveyUrl}`;
  }
  if (!text.includes(input.methodologyUrl)) {
    text += `\n\nΜεθοδολογία: ${input.methodologyUrl}`;
  }
  if (!text.includes(privacyUrl)) {
    text += `\n\nΓιατί λάβατε την πρόσκληση & προστασία δεδομένων: ${privacyUrl}`;
  }
  text += `\n\nΔεν επιθυμείτε άλλη ερευνητική επικοινωνία από το KONTA MOY; ${optOutUrl}`;

  const fromAddress = mailAddress(configuration.from, "KONTA MOY Research");
  const replyToAddress = mailAddress(configuration.replyTo);
  const mime = buildAdminMailRawMime({
    from: fromAddress,
    to: [{ address: input.destination }],
    replyTo: [replyToAddress],
    subject,
    text,
    html: researchInvitationHtml(subject, text, input.surveyUrl, input.methodologyUrl, privacyUrl, optOutUrl),
    internetMessageIdDomain: DEFAULT_DOMAIN
  });

  return sendRawSesEmail({
    config: sesMailConfigFromEnv(),
    raw: mime.raw,
    from: formatEnvelopeFrom(configuration.from),
    to: [input.destination],
    configurationSetName: configuration.configurationSetName,
    emailTags: [
      { name: "research_study", value: safeTagValue(input.studySlug) },
      { name: "research_invite", value: safeTagValue(input.inviteId) },
      ...(input.batchId ? [{ name: "research_batch", value: safeTagValue(input.batchId) }] : []),
      ...(input.attemptId ? [{ name: "research_attempt", value: safeTagValue(input.attemptId) }] : []),
      ...(input.attemptKind ? [{ name: "research_attempt_kind", value: safeTagValue(input.attemptKind) }] : [])
    ]
  });
}

export async function sendResearchThankYouCode(input: Readonly<{
  destination: string;
  studySlug: string;
  studyTitle: string;
  responseId: string;
  deliveryId: string;
  rewardCode: string;
  joinUrl: string;
  methodologyUrl: string;
}>): Promise<Readonly<{ providerMessageId: string; subjectSha256: string; bodySha256: string }>> {
  const subject = `Ευχαριστούμε για τη συμμετοχή σας στη μελέτη «${input.studyTitle}»`;
  const text = [
    "Ευχαριστούμε για την ολοκλήρωση της μελέτης.",
    `Ο προσωπικός κωδικός ευχαριστίας σας είναι: ${input.rewardCode}`,
    "Ο κωδικός αφορά αποκλειστικά το ευχαριστήριο όφελος συμμετοχής και δεν αποτελεί συγκατάθεση για εμπορική επικοινωνία. Οι ισχύοντες όροι εφαρμογής εμφανίζονται πριν από οποιαδήποτε εμπορική ενεργοποίηση.",
    `Ένταξη στο KONTA MOY: ${input.joinUrl}`,
    `Μεθοδολογία μελέτης: ${input.methodologyUrl}`
  ].join("\n\n");
  return sendResearchParticipantMessage({
    destination: input.destination,
    studySlug: input.studySlug,
    responseId: input.responseId,
    deliveryId: input.deliveryId,
    messageKind: "thank_you_code",
    subject,
    text,
    primaryUrl: input.joinUrl,
    primaryLabel: "Χρήση κωδικού στο KONTA MOY →",
    methodologyUrl: input.methodologyUrl
  });
}

export async function sendResearchResultsNotification(input: Readonly<{
  destination: string;
  studySlug: string;
  studyTitle: string;
  responseId: string;
  deliveryId: string;
  releaseVersion: string;
  resultsUrl: string;
  methodologyUrl: string;
}>): Promise<Readonly<{ providerMessageId: string; subjectSha256: string; bodySha256: string }>> {
  const subject = `Δημοσιεύθηκαν τα αποτελέσματα της μελέτης «${input.studyTitle}»`;
  const text = [
    "Ζητήσατε να ενημερωθείτε όταν δημοσιευθούν τα αποτελέσματα της μελέτης.",
    `Η έκδοση ${input.releaseVersion} είναι πλέον διαθέσιμη.`,
    `Αποτελέσματα: ${input.resultsUrl}`,
    `Μεθοδολογία: ${input.methodologyUrl}`,
    "Η ενημέρωση αυτή αποστέλλεται βάσει της ξεχωριστής επιλογής ενημέρωσης αποτελεσμάτων και δεν αποτελεί εμπορική επικοινωνία."
  ].join("\n\n");
  return sendResearchParticipantMessage({
    destination: input.destination,
    studySlug: input.studySlug,
    responseId: input.responseId,
    deliveryId: input.deliveryId,
    messageKind: "results_notification",
    subject,
    text,
    primaryUrl: input.resultsUrl,
    primaryLabel: "Δείτε τα αποτελέσματα →",
    methodologyUrl: input.methodologyUrl
  });
}

async function sendResearchParticipantMessage(input: Readonly<{
  destination: string;
  studySlug: string;
  responseId: string;
  deliveryId: string;
  messageKind: "thank_you_code" | "results_notification";
  subject: string;
  text: string;
  primaryUrl: string;
  primaryLabel: string;
  methodologyUrl: string;
}>): Promise<Readonly<{ providerMessageId: string; subjectSha256: string; bodySha256: string }>> {
  const configuration = assertResearchSurveyEmailReady();
  const fromAddress = mailAddress(configuration.from, "KONTA MOY Research");
  const replyToAddress = mailAddress(configuration.replyTo);
  const mime = buildAdminMailRawMime({
    from: fromAddress,
    to: [{ address: input.destination }],
    replyTo: [replyToAddress],
    subject: input.subject,
    text: input.text,
    html: researchParticipantHtml(
      input.subject,
      input.text,
      input.primaryUrl,
      input.primaryLabel,
      input.methodologyUrl
    ),
    internetMessageIdDomain: DEFAULT_DOMAIN
  });
  const sent = await sendRawSesEmail({
    config: sesMailConfigFromEnv(),
    raw: mime.raw,
    from: formatEnvelopeFrom(configuration.from),
    to: [input.destination],
    configurationSetName: configuration.configurationSetName,
    emailTags: [
      { name: "research_study", value: safeTagValue(input.studySlug) },
      { name: "research_delivery", value: safeTagValue(input.deliveryId) },
      { name: "research_response", value: safeTagValue(input.responseId) },
      { name: "research_kind", value: safeTagValue(input.messageKind) }
    ]
  });
  return {
    providerMessageId: sent.providerMessageId,
    subjectSha256: sha256(input.subject),
    bodySha256: sha256(input.text)
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function renderRecruitmentTemplate(
  template: string,
  replacements: Readonly<Record<string, string>>
): string {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (match, key: string) => {
    const value = replacements[key.toLowerCase()];
    return value === undefined ? match : value;
  });
}

function mailAddress(value: string, defaultName?: string): AdminMailAddress {
  const match = value.match(/^\s*([^<>]+?)?\s*<([^<>]+)>\s*$/);
  if (match) {
    return {
      name: match[1]?.trim() || defaultName,
      address: match[2]!.trim()
    };
  }
  return { name: defaultName, address: value.trim() };
}

function formatEnvelopeFrom(value: string): string {
  const parsed = mailAddress(value, "KONTA MOY Research");
  return parsed.name ? `${parsed.name} <${parsed.address}>` : parsed.address;
}

function safeTagValue(value: string): string {
  const clean = value.trim().replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 256);
  return clean || "unknown";
}

function researchParticipantHtml(
  subject: string,
  text: string,
  primaryUrl: string,
  primaryLabel: string,
  methodologyUrl: string
): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.65">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!doctype html>
<html lang="el">
<body style="margin:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#183027">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#f4f0e8">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fffdf8;border:1px solid #d6cfbf;border-radius:20px;overflow:hidden">
        <tr><td style="background:#183027;color:#fffdf8;padding:28px 32px">
          <div style="font-size:11px;letter-spacing:.14em;font-weight:800;color:#d8d8c7">KONTA MOY · ΕΡΕΥΝΑ ΛΙΑΝΕΜΠΟΡΙΟΥ</div>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:31px;line-height:1.1;margin:12px 0 0">${escapeHtml(subject)}</h1>
        </td></tr>
        <tr><td style="padding:32px">
          ${paragraphs}
          <p style="margin:24px 0"><a href="${escapeHtml(primaryUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#183027;color:#fffdf8;text-decoration:none;font-weight:800">${escapeHtml(primaryLabel)}</a></p>
          <p style="font-size:13px;line-height:1.6;color:#58645f">Η επικοινωνία αυτή ανήκει στη μελέτη και ακολουθεί την αντίστοιχη επιλογή συγκατάθεσής σας. <a href="${escapeHtml(methodologyUrl)}" style="color:#183027">Μεθοδολογία και πληροφορίες μελέτης</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function researchInvitationHtml(
  subject: string,
  text: string,
  surveyUrl: string,
  methodologyUrl: string,
  privacyUrl: string,
  optOutUrl: string
): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.65">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!doctype html>
<html lang="el">
<body style="margin:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#183027">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#f4f0e8">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fffdf8;border:1px solid #d6cfbf;border-radius:20px;overflow:hidden">
        <tr><td style="background:#183027;color:#fffdf8;padding:28px 32px">
          <div style="font-size:11px;letter-spacing:.14em;font-weight:800;color:#d8d8c7">KONTA MOY · ΕΡΕΥΝΑ ΛΙΑΝΕΜΠΟΡΙΟΥ</div>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:31px;line-height:1.1;margin:12px 0 0">${escapeHtml(subject)}</h1>
        </td></tr>
        <tr><td style="padding:32px">
          ${paragraphs}
          <p style="margin:24px 0"><a href="${escapeHtml(surveyUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#183027;color:#fffdf8;text-decoration:none;font-weight:800">Συμμετοχή στην έρευνα →</a></p>
          <p style="font-size:13px;line-height:1.6;color:#58645f">Ο σύνδεσμος είναι προσωπικός για την επιλεγμένη συμμετοχή. Δεν περιέχει ΑΦΜ, email ή επωνυμία. <a href="${escapeHtml(methodologyUrl)}" style="color:#183027">Μεθοδολογία και πληροφορίες μελέτης</a>.</p>
          <p style="font-size:13px;line-height:1.6;color:#58645f"><a href="${escapeHtml(privacyUrl)}" style="color:#183027;font-weight:700">Γιατί λάβατε αυτή την πρόσκληση, από πού προήλθαν τα στοιχεία και πώς χρησιμοποιούνται σύμφωνα με τον GDPR</a>.</p>
          <p style="font-size:13px;line-height:1.6;color:#58645f">Δεν επιθυμείτε άλλη ερευνητική επικοινωνία; <a href="${escapeHtml(optOutUrl)}" style="color:#183027">Να μη λάβω άλλες ερευνητικές προσκλήσεις</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}
