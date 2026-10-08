import { createHash } from "node:crypto";
import { KONTA_MOY_EMAIL_COMPANY } from "@buy-local-sparta/resend-notifications";
import { buildAdminMailRawMime, type AdminMailAddress } from "./admin-mail-mime";
import { sendRawSesEmail, sesMailConfigFromEnv } from "./admin-mail-ses";

const DEFAULT_FROM = "research@kontamou.site";
const DEFAULT_REPLY_TO = "research@kontamou.site";
const DEFAULT_DOMAIN = "kontamou.site";
const SPARTA_BRANCH_ADDRESS = "Σειρήνων 11, 23100 Σπάρτη";

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

/** Independent one-recipient SES simulation; does not open live fieldwork. */
export function assertResearchSimulationEmailReady(
  env: NodeJS.ProcessEnv = process.env
): ResearchSurveyEmailConfiguration {
  if (env.BLS_RESEARCH_SIMULATION_EMAIL_ENABLED !== "true") {
    throw new Error("RESEARCH_SIMULATION_EMAIL_DISABLED");
  }
  const configuration = researchSurveyEmailConfiguration(env);
  sesMailConfigFromEnv(env);
  return configuration;
}

export function assertResearchSurveyEmailReady(env: NodeJS.ProcessEnv = process.env): ResearchSurveyEmailConfiguration {
  const configuration = researchSurveyEmailConfiguration(env);
  if (!configuration.enabled) {
    throw new Error("RESEARCH_EMAIL_DELIVERY_DISABLED");
  }
  if (!configuration.configurationSetName) {
    throw new Error("BLS_RESEARCH_SES_CONFIGURATION_SET is required for governed research delivery");
  }
  // Verify credentials and same-region SNS topic before accepting any live send.
  const ses = sesMailConfigFromEnv(env);
  const topicArn = env.BLS_RESEARCH_SES_SNS_TOPIC_ARN?.trim();
  if (!topicArn) throw new Error("BLS_RESEARCH_SES_SNS_TOPIC_ARN is required for governed research delivery");
  const topicPattern = /^arn:aws:sns:[a-z0-9-]+:[0-9]{12}:[A-Za-z0-9_.-]+$/;
  if (!topicPattern.test(topicArn) || !topicArn.startsWith("arn:aws:sns:" + ses.region + ":")) {
    throw new Error("RESEARCH_SES_SNS_TOPIC_REGION_OR_ARN_INVALID");
  }
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
  companyName?: string;
}>): Promise<Readonly<{ providerMessageId: string }>> {
  const configuration = assertResearchSurveyEmailReady();
  const { subject, text, html } = previewResearchRecruitmentEmail(input);

  const fromAddress = mailAddress(configuration.from, "KONTA MOY Research");
  const replyToAddress = mailAddress(configuration.replyTo);
  const mime = buildAdminMailRawMime({
    from: fromAddress,
    to: [{ address: input.destination }],
    replyTo: [replyToAddress],
    subject,
    text,
    html,
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

export function previewResearchRecruitmentEmail(input: Readonly<{
  studyTitle: string;
  surveyUrl: string;
  methodologyUrl: string;
  subjectTemplate: string;
  bodyTemplate: string;
  companyName?: string;
  attemptKind?: "initial" | "reminder" | "reissue";
}>): Readonly<{ subject: string; text: string; html: string }> {
  const optOutUrl = `${input.surveyUrl}?optout=1`;
  const privacyUrl = new URL("/research/privacy", input.surveyUrl).toString();
  const companyName = input.companyName?.trim() || "";
  const companyGreeting = companyName
    ? `Προς την επιχείρηση «${companyName}»,`
    : "Προς την επιλεγμένη επιχείρηση,";
  const replacements = {
    survey_url: input.surveyUrl,
    methodology_url: input.methodologyUrl,
    privacy_url: privacyUrl,
    optout_url: optOutUrl,
    study_title: input.studyTitle,
    company_name: companyName,
    company_greeting: companyGreeting
  };
  const subject = renderRecruitmentTemplate(input.subjectTemplate, replacements).trim();
  let text = renderRecruitmentTemplate(input.bodyTemplate, replacements).trim();
  if (!/\{\{company_(?:name|greeting)\}\}/i.test(input.bodyTemplate)) {
    text = `${companyGreeting}\n\n${text}`;
  }
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
  if (!text.includes(optOutUrl)) {
    text += `\n\nΔεν επιθυμείτε άλλη ερευνητική επικοινωνία από το KONTA MOY; ${optOutUrl}`;
  }
  text += `\n\n${researchPlainTextFooter()}`;

  return {
    subject,
    text,
    html: researchInvitationHtml({
      subject, text, surveyUrl: input.surveyUrl, methodologyUrl: input.methodologyUrl,
      privacyUrl, optOutUrl, companyName, attemptKind: input.attemptKind
    })
  };
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
        ${researchEmailFooterHtml()}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function researchPlainTextFooter(): string {
  return [
    "—",
    "KONTA MOY · Buy Local Sparta",
    KONTA_MOY_EMAIL_COMPANY.legalName,
    `ΑΦΜ ${KONTA_MOY_EMAIL_COMPANY.taxNumber} · ΓΕΜΗ ${KONTA_MOY_EMAIL_COMPANY.gemiNumber}`,
    `Έδρα: ${KONTA_MOY_EMAIL_COMPANY.address}`,
    `Υποκατάστημα Σπάρτης: ${SPARTA_BRANCH_ADDRESS}`,
    `Email: ${KONTA_MOY_EMAIL_COMPANY.email} · Τηλ.: ${KONTA_MOY_EMAIL_COMPANY.phone}`,
    `Website: ${KONTA_MOY_EMAIL_COMPANY.website}`
  ].join("\n");
}

function researchEmailFooterHtml(): string {
  const website = KONTA_MOY_EMAIL_COMPANY.website.replace(/\/$/, "");
  return `<tr><td style="background:#101f18;padding:26px 32px;color:#cfd8d1;font-size:11px;line-height:1.7">
    <div style="font-size:13px;font-weight:800;color:#fffdf8;letter-spacing:.07em;margin-bottom:6px">KONTA MOY · BUY LOCAL SPARTA</div>
    <div style="color:#fffdf8;font-weight:700;margin-bottom:8px">ΚΟΝΤΑ ΜΟΥ: Η Σπάρτη δίπλα σου</div>
    <strong style="color:#fffdf8">${escapeHtml(KONTA_MOY_EMAIL_COMPANY.legalName)}</strong><br>
    ΑΦΜ ${escapeHtml(KONTA_MOY_EMAIL_COMPANY.taxNumber)} · ΓΕΜΗ ${escapeHtml(KONTA_MOY_EMAIL_COMPANY.gemiNumber)}<br>
    Έδρα: ${escapeHtml(KONTA_MOY_EMAIL_COMPANY.address)}<br>
    Υποκατάστημα Σπάρτης: ${escapeHtml(SPARTA_BRANCH_ADDRESS)}<br>
    <a href="mailto:${escapeHtml(KONTA_MOY_EMAIL_COMPANY.email)}" style="color:#fffdf8">${escapeHtml(KONTA_MOY_EMAIL_COMPANY.email)}</a>
    &nbsp;·&nbsp;
    <a href="tel:+30${escapeHtml(KONTA_MOY_EMAIL_COMPANY.phone)}" style="color:#fffdf8">${escapeHtml(KONTA_MOY_EMAIL_COMPANY.phone)}</a>
    &nbsp;·&nbsp;
    <a href="${escapeHtml(website)}" style="color:#fffdf8">kontamou.site</a>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.12);color:#91a098">
      <a href="${escapeHtml(website + "/privacy")}" style="color:#cfd8d1">Ιδιωτικότητα</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(website + "/help")}" style="color:#cfd8d1">Βοήθεια & επικοινωνία</a>
    </div>
  </td></tr>`;
}

function researchInvitationHtml(input: Readonly<{
  subject: string;
  text: string;
  surveyUrl: string;
  methodologyUrl: string;
  privacyUrl: string;
  optOutUrl: string;
  companyName: string;
  attemptKind?: "initial" | "reminder" | "reissue";
}>): string {
  const actionUrls = [input.surveyUrl, input.methodologyUrl, input.privacyUrl, input.optOutUrl];
  const paragraphs = input.text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph) => !actionUrls.some((url) => paragraph.includes(url)))
    .filter((paragraph) => !paragraph.startsWith("—\nKONTA MOY"))
    .map((paragraph) => `<p style="margin:0 0 17px;font-size:15px;line-height:1.7;color:#263d34">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const reminder = input.attemptKind === "reminder";
  const preheader = input.subject;
  const companyLabel = input.companyName
    ? `<div style="margin-top:20px;display:inline-block;padding:7px 11px;border:1px solid rgba(255,255,255,.22);border-radius:999px;color:#e8ede9;font-size:11px;line-height:1.3">ΠΡΟΣ · ${escapeHtml(input.companyName)}</div>`
    : "";
  const primaryLabel = reminder ? "Συνέχεια στη μελέτη" : "Συμμετοχή στη μελέτη";

  return `<!doctype html>
<html lang="el">
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#183027">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f4f0e8;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:#fffdf8;border:1px solid #d6cfbf;border-radius:24px;overflow:hidden">
        <tr><td style="background:#183027;color:#fffdf8;padding:30px 32px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td valign="middle">
                <div style="width:46px;height:46px;border:1px solid #f4f0e8;border-radius:50%;line-height:46px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.12em;color:#fffdf8">KM</div>
              </td>
              <td valign="middle" align="right" style="font-size:10px;line-height:1.4;letter-spacing:.14em;font-weight:800;color:#d8d8c7">KONTA MOY<br>ΕΡΕΥΝΑ ΛΙΑΝΕΜΠΟΡΙΟΥ</td>
            </tr>
          </table>
          ${companyLabel}
          <div style="margin-top:20px;font-size:11px;letter-spacing:.14em;font-weight:800;color:#c7c9a8">${reminder ? "ΥΠΕΝΘΥΜΙΣΗ" : "ΠΡΟΣΚΛΗΣΗ ΣΥΜΜΕΤΟΧΗΣ"}</div>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:32px;line-height:1.1;letter-spacing:-.02em;margin:10px 0 0;color:#fffdf8">${escapeHtml(input.subject)}</h1>
        </td></tr>
        <tr><td style="padding:32px">
          ${paragraphs}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 24px">
            <tr><td style="padding:14px 16px;border-left:3px solid #b29661;background:#f4f0e8;border-radius:10px;font-size:13px;line-height:1.6;color:#405149">
              <strong style="color:#183027">Η συμμετοχή είναι απολύτως προαιρετική.</strong><br>
              Οι απαντήσεις χρησιμοποιούνται για ερευνητικούς σκοπούς και τα δημοσιευμένα αποτελέσματα παρουσιάζονται συγκεντρωτικά.
            </td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 14px">
            <tr><td style="border-radius:999px;background:#183027">
              <a href="${escapeHtml(input.surveyUrl)}" style="display:inline-block;padding:15px 23px;color:#fffdf8;text-decoration:none;font-size:14px;font-weight:800">${primaryLabel} →</a>
            </td></tr>
          </table>
          <div style="margin-bottom:26px;font-size:11px;line-height:1.55;color:#758078">
            Αν το κουμπί δεν ανοίγει, χρησιμοποιήστε τον προσωπικό σύνδεσμο:<br>
            <a href="${escapeHtml(input.surveyUrl)}" style="color:#405149;word-break:break-all">${escapeHtml(input.surveyUrl)}</a>
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #d6cfbf;border-bottom:1px solid #d6cfbf;margin:0 0 22px">
            <tr><td style="padding:14px 0;font-size:13px;line-height:1.55">
              <strong>Μεθοδολογία & επιλογή δείγματος</strong><br>
              <a href="${escapeHtml(input.methodologyUrl)}" style="color:#183027;text-decoration:underline;text-underline-offset:3px">Δείτε πώς σχεδιάστηκε η μελέτη</a>
            </td></tr>
            <tr><td style="padding:14px 0;border-top:1px solid #e6e0d5;font-size:13px;line-height:1.55">
              <strong>Ιδιωτικότητα & προέλευση στοιχείων</strong><br>
              <a href="${escapeHtml(input.privacyUrl)}" style="color:#183027;text-decoration:underline;text-underline-offset:3px">Γιατί λάβατε την πρόσκληση και πώς χρησιμοποιούνται τα δεδομένα</a>
            </td></tr>
          </table>
          <p style="margin:0 0 12px;font-size:12px;line-height:1.65;color:#58645f">
            Ο προσωπικός σύνδεσμος εξυπηρετεί αποκλειστικά τη συγκεκριμένη επιλεγμένη συμμετοχή και την αποτροπή διπλών απαντήσεων. Δεν χρειάζεται να πληκτρολογήσετε ΑΦΜ, email ή επωνυμία στο ερωτηματολόγιο.
          </p>
          <p style="margin:0 0 12px;font-size:12px;line-height:1.65;color:#58645f">
            Η πρόσκληση αυτή αφορά αποκλειστικά ερευνητική επικοινωνία και δεν αποτελεί εμπορική επικοινωνία ούτε συγκατάθεση marketing.
          </p>
          <p style="margin:0;font-size:12px;line-height:1.65;color:#58645f">
            Δεν επιθυμείτε άλλη ερευνητική επικοινωνία;
            <a href="${escapeHtml(input.optOutUrl)}" style="color:#183027;text-decoration:underline;text-underline-offset:3px">Να μη λάβω άλλες ερευνητικές προσκλήσεις</a>.
          </p>
        </td></tr>
        ${researchEmailFooterHtml()}
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
