import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

/**
 * Stateless, encrypted Research rehearsal tokens. This workflow does not touch
 * research_invites, research_responses, research_answers, or Research jobs.
 * The admin must confirm actual inbox delivery; SES acceptance isn't proof.
 */
export type SimulationInvitation = Readonly<{
  kind: "invitation";
  slug: string;
  recipient: string;
  runId: string;
  issuedAt: number;
  expiresAt: number;
}>;

export type SimulationReceipt = Readonly<{
  kind: "receipt";
  slug: string;
  recipient: string;
  runId: string;
  submittedAt: number;
  expiresAt: number;
  answersCount: number;
  answerHash: string;
}>;

type SimulationPayload = SimulationInvitation | SimulationReceipt;
export const SIMULATION_TTL_MS = 30 * 60 * 1000;

function simulationKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret = env.BLS_AUTH_SECRET?.trim();
  if ((!secret || secret.length < 32) && env.NODE_ENV === "production") {
    throw new Error("RESEARCH_SIMULATION_SIGNING_NOT_CONFIGURED");
  }
  return createHash("sha256")
    .update("kontamou-research-simulation:aes-256-gcm:v1:")
    .update(secret && secret.length >= 32 ? secret : "development-only-research-simulation-secret")
    .digest();
}

function seal(payload: SimulationPayload, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", simulationKey(env), iv);
  cipher.setAAD(Buffer.from("research-rehearsal-v1"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function validSimulationEmail(value: string): boolean {
  return value.length <= 254
    && value.length >= 6
    && /^[^\s<>"'@,;:]+@[^\s<>"'@,;:]+\.[^\s<>"'@,;:]+$/.test(value)
    && !/[\r\n]/.test(value);
}

export function validSimulationSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,79}$/.test(value);
}

export function createSimulationInvitation(slug: string, recipient: string, now = Date.now(),
  env: NodeJS.ProcessEnv = process.env): { token: string; runId: string; expiresAt: number } {
  if (!validSimulationSlug(slug) || !validSimulationEmail(recipient)) throw new Error("SIMULATION_INPUT_INVALID");
  const runId = randomUUID();
  const expiresAt = now + SIMULATION_TTL_MS;
  return {
    token: seal({ kind: "invitation", slug, recipient: recipient.toLowerCase(), runId, issuedAt: now, expiresAt }, env),
    runId,
    expiresAt
  };
}

export function readSimulationToken(token: string, expectedKind: "invitation", now?: number,
  env?: NodeJS.ProcessEnv): SimulationInvitation;
export function readSimulationToken(token: string, expectedKind: "receipt", now?: number,
  env?: NodeJS.ProcessEnv): SimulationReceipt;
export function readSimulationToken(token: string, expectedKind: SimulationPayload["kind"],
  now = Date.now(), env: NodeJS.ProcessEnv = process.env): SimulationPayload {
  if (typeof token !== "string" || token.length > 4096 || !/^v1\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("SIMULATION_TOKEN_INVALID");
  }
  try {
    const bytes = Buffer.from(token.slice(3), "base64url");
    if (bytes.length < 29) throw new Error("invalid length");
    const decipher = createDecipheriv("aes-256-gcm", simulationKey(env), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from("research-rehearsal-v1"));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const raw = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    const payload = JSON.parse(raw) as SimulationPayload;
    if (!payload || payload.kind !== expectedKind
      || !validSimulationSlug(payload.slug)
      || !validSimulationEmail(payload.recipient)
      || !/^[0-9a-f-]{36}$/.test(payload.runId)
      || !Number.isFinite(payload.expiresAt)
      || payload.expiresAt < now
      || payload.expiresAt > now + SIMULATION_TTL_MS + 60_000) {
      throw new Error("SIMULATION_TOKEN_INVALID_OR_EXPIRED");
    }
    if (payload.kind === "receipt"
      && (!Number.isFinite(payload.submittedAt) || !Number.isSafeInteger(payload.answersCount)
        || payload.answersCount < 1 || payload.answersCount > 12
        || !/^[0-9a-f]{64}$/.test(payload.answerHash))) {
      throw new Error("SIMULATION_RECEIPT_INVALID");
    }
    return payload;
  } catch {
    throw new Error("SIMULATION_TOKEN_INVALID_OR_EXPIRED");
  }
}

export function createSimulationReceipt(invitation: SimulationInvitation,
  answers: Record<string, string>, now = Date.now(),
  env: NodeJS.ProcessEnv = process.env): string {
  if (now > invitation.expiresAt) throw new Error("SIMULATION_INVITATION_EXPIRED");
  const allowedKeys = ["business", "online", "priority"];
  const entries = Object.entries(answers);
  if (entries.length !== allowedKeys.length
    || entries.some(([key, value]) => !allowedKeys.includes(key)
      || typeof value !== "string" || !value.trim() || value.length > 400)) {
    throw new Error("SIMULATION_ANSWERS_INVALID");
  }
  const answerHash = createHash("sha256").update(JSON.stringify(
    allowedKeys.map((key) => [key, answers[key]?.trim()])
  )).digest("hex");
  return seal({
    kind: "receipt", slug: invitation.slug, recipient: invitation.recipient,
    runId: invitation.runId, submittedAt: now,
    // Keep the receipt valid for a full review window after submission.
    expiresAt: now + SIMULATION_TTL_MS, answersCount: allowedKeys.length, answerHash
  }, env);
}
