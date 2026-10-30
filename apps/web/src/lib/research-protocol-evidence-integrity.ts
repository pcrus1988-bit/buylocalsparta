import { createHash } from "node:crypto";

/**
 * Exceptional, exact-data reconciliation for four pre-canonical historical
 * protocol-event evidence digests. Both original and canonical digests remain
 * visible in the immutable correction event. This is NOT an integrity bypass:
 * new/changed evidence without this pinned provenance fails closed.
 */
export const LEGACY_PROTOCOL_RECONCILIATION_EVENT_ID = "7e9f5904-0f31-41fd-bc41-db383aa51bed";
const RECONCILIATION_SHA256 = "026c18afeb8f68eb0be560f85f8ed5893a54ec7dd219e8410936cb3eec877d8c";

const VERIFIED_LEGACY_DIGESTS: Readonly<Record<string, Readonly<{
  storedHash: string;
  canonicalHash: string;
}>>> = {
  "9f756ec8-476f-4940-8701-d2a73fd7602d": {
    storedHash: "e2d63b0be42550adac9b770c8cedf21780d62974b70ae64ca19572b3dde791e2",
    canonicalHash: "4ab368fe8c73e7b5f233403ee83ffa99d9bcd35d25d0a5c8cb85992243289f35"
  },
  "395c6ae7-7335-43de-9893-e615bef50702": {
    storedHash: "d7d5c0c276e519a59b8384545962856a2cb02e5b66e3e3ad24d658d82d37bff6",
    canonicalHash: "d14945f93cb69326f874728458c9a44bd17d9bbdd89f7afc4333af7455ee93b9"
  },
  "d4f91e97-92d9-45e3-aab5-c84587768945": {
    storedHash: "d70e8aec832062a050aa903911f48a448a0aadf503fdcc4cd4fc6d96e726f7bf",
    canonicalHash: "99c4e1c8eda23eda5fbb65d85de5a8c071383ef6ee82c5db2e32f4340414bdf1"
  },
  "2e4bb2ba-bb8e-48c4-90f9-90c06672dd89": {
    storedHash: "8e53fb94f8741316b72a57d036f248b8a91d333073354eb29fcf81f86212dd1c",
    canonicalHash: "c6f6233c68830ac2e62287dff511569b66d910aa457e33e215d8a2034eed987b"
  }
};

export type ProtocolEvidenceRow = Readonly<{
  id: unknown;
  event_type: unknown;
  category: unknown;
  severity: unknown;
  content_sha256: unknown;
  evidence_json: unknown;
}>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort()
    .map((key) => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
}

function canonicalDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function hasTrustedCorrectionEvent(rows: readonly ProtocolEvidenceRow[]): boolean {
  const correctionRows = rows.filter((row) => row.id === LEGACY_PROTOCOL_RECONCILIATION_EVENT_ID);
  if (correctionRows.length !== 1) return false;
  const event = correctionRows[0]!;
  const evidence = asRecord(event.evidence_json);
  const corrections = evidence.corrections;
  if (event.event_type !== "amendment" || event.category !== "operations" || event.severity !== "minor"
    || event.content_sha256 !== RECONCILIATION_SHA256
    || canonicalDigest(evidence) !== RECONCILIATION_SHA256
    || evidence.reconciliationVersion !== "greek-retail-2026-protocol-digest-reconciliation-v1"
    || evidence.correctionPolicy !== "exact-four-event-original-and-canonical-digest-match-or-fail"
    || evidence.studySlug !== "greek-retail-2026"
    || evidence.sourceEvidenceModified !== false
    || evidence.surveyResponsesModified !== false
    || evidence.consentRecordsModified !== false
    || !Array.isArray(corrections)
    || corrections.length !== Object.keys(VERIFIED_LEGACY_DIGESTS).length) {
    return false;
  }
  const correctionIds = new Set<string>();
  for (const raw of corrections) {
    const item = asRecord(raw);
    const id = item.eventId;
    if (typeof id !== "string" || correctionIds.has(id)) return false;
    const expected = VERIFIED_LEGACY_DIGESTS[id];
    if (!expected || item.storedHash !== expected.storedHash
      || item.canonicalHash !== expected.canonicalHash) return false;
    correctionIds.add(id);
  }
  return correctionIds.size === Object.keys(VERIFIED_LEGACY_DIGESTS).length;
}

export function verifyResearchProtocolEvidenceIntegrity(
  rows: readonly ProtocolEvidenceRow[]
): Readonly<{ reconciledEventIds: readonly string[] }> {
  const trustedCorrection = hasTrustedCorrectionEvent(rows);
  const reconciledEventIds: string[] = [];
  for (const row of rows) {
    const actual = canonicalDigest(asRecord(row.evidence_json));
    if (row.content_sha256 === actual) continue;
    const id = typeof row.id === "string" ? row.id : String(row.id ?? "");
    const expected = VERIFIED_LEGACY_DIGESTS[id];
    if (!trustedCorrection || !expected
      || row.content_sha256 !== expected.storedHash
      || actual !== expected.canonicalHash) {
      throw new Error(`RESEARCH_RELEASE_PROTOCOL_EVIDENCE_INTEGRITY_FAILED:${id}`);
    }
    reconciledEventIds.push(id);
  }
  return { reconciledEventIds };
}
