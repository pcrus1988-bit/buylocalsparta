import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const SHA256_DIGEST = bytes => createHash('sha256').update(bytes).digest('hex');
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const firstParty = (sourceUrl, assetUrl) => {
  try {
    const s = new URL(sourceUrl), a = new URL(assetUrl);
    return s.protocol === 'https:' && a.protocol === 'https:' &&
      !s.username && !s.password && !a.username && !a.password &&
      s.origin === a.origin && !a.hash;
  } catch { return false; }
};
const instant = v => {
  if (typeof v !== 'string') return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!m) return NaN;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month-1] || hour > 23 || minute > 59 || second > 59) return NaN;
  if (m[7] !== 'Z') {
    const zoneHour = Number(m[7].slice(1, 3)), zoneMinute = Number(m[7].slice(4, 6));
    if (zoneHour > 14 || zoneMinute > 59 || (zoneHour === 14 && zoneMinute !== 0)) return NaN;
  }
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Read-only offline archive preflight. This is NOT a grant of collection,
 * mirroring, retention or publication rights. An independently authenticated
 * human must separately verify policy scope and provenance. No fragment text,
 * private Storage URLs or credentials are returned.
 */
export function preflightExactAsset({ source, snapshot, acquisition, archiveBytes, rightsEvidenceBytes } = {}) {
  const errors = [];
  const check = (ok, code) => { if (!ok) errors.push(code); };
  const s = source && typeof source === 'object' ? source : {};
  const v = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const a = acquisition && typeof acquisition === 'object' ? acquisition : {};
  const p = v.provenance && typeof v.provenance === 'object' ? v.provenance : {};
  const fm = v.fetch_metadata && typeof v.fetch_metadata === 'object' ? v.fetch_metadata : {};
  const am = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};

  check(UUID.test(s.id ?? '') && UUID.test(v.id ?? '') && UUID.test(a.id ?? '') && v.source_id === s.id && a.source_id === s.id && p.asset_approval_id === a.id, 'EXACT_SOURCE_APPROVAL_BINDING');
  check(nonempty(fm.asset_id) && fm.asset_id === am.asset_id, 'ASSET_ID_BINDING');
  check(nonempty(v.final_url) && v.final_url === a.approved_final_url && a.asset_url === a.approved_final_url && firstParty(s.canonical_url, v.final_url), 'EXACT_FINAL_URL_SCOPE');
  const fetchTime = instant(v.fetched_at), approvalTime = instant(a.approved_at), retentionTime = instant(a.retention_until);
  check(Number.isFinite(fetchTime) && Number.isFinite(approvalTime) && approvalTime <= fetchTime, 'NO_RETROACTIVE_ACQUISITION');
  check(Number.isFinite(retentionTime) && Number.isFinite(fetchTime) && retentionTime >= fetchTime, 'RETENTION_SCOPE_MISSING');
  check(a.acquisition_authorized === true && a.mirror_authorized === false, 'ACQUISITION_SCOPE_INVALID');
  check(s.status === 'active', 'SOURCE_NOT_ACTIVE');
  check(v.http_status === 200, 'ARCHIVE_HTTP_STATUS_INVALID');
  check(nonempty(a.approved_by) && !/\b(ai[ _-]?assisted|agent|bot|worker|automation|model)\b/i.test(a.approved_by), 'INDEPENDENT_APPROVAL_NOT_ATTESTED');
  check(nonempty(a.rights_policy_url) && firstParty(s.canonical_url, a.rights_policy_url), 'RIGHTS_POLICY_ORIGIN_INVALID');
  const expiresTime = a.expires_at == null ? Infinity : instant(a.expires_at);
  const reviewTime = a.review_due_at == null ? Infinity : instant(a.review_due_at);
  check(!Number.isNaN(expiresTime) && fetchTime <= expiresTime, 'ACQUISITION_EXPIRED_AT_FETCH');
  check(!Number.isNaN(reviewTime) && fetchTime <= reviewTime, 'ACQUISITION_REVIEW_OVERDUE_AT_FETCH');
  check(p.no_link_following === true && p.original_bytes_preserved === true, 'PROVENANCE_SCOPE_INVALID');
  check(SHA256.test(v.sha256 ?? '') && v.storage_bucket === 'nyxi-evidence' && typeof v.storage_path === 'string' &&
    v.storage_path.startsWith(`${s.id}/${v.sha256}/`) &&
    /^[^/]+\/[a-f0-9]{64}\/[^/]+$/.test(v.storage_path) &&
    !v.storage_path.includes('..'), 'CONTENT_ADDRESS_INVALID');
  check(Number.isSafeInteger(v.byte_length) && v.byte_length > 0, 'ARCHIVE_SIZE_INVALID');
  check(v.mime_type === 'text/html' || v.mime_type === 'application/pdf', 'UNSUPPORTED_OR_UNVERIFIED_MIME');
  const bytesOk = archiveBytes instanceof Uint8Array && archiveBytes.byteLength === v.byte_length && SHA256_DIGEST(archiveBytes) === v.sha256;
  if (bytesOk && v.mime_type === 'application/pdf') check(Buffer.from(archiveBytes.subarray(0,5)).toString('ascii') === '%PDF-', 'PDF_SIGNATURE_MISMATCH');
  check(bytesOk, 'ORIGINAL_BYTES_UNVERIFIED');
  const evidenceHash = am.rights_evidence_sha256;
  const evidenceOk = rightsEvidenceBytes instanceof Uint8Array && rightsEvidenceBytes.byteLength > 0 && SHA256.test(evidenceHash ?? '') && SHA256_DIGEST(rightsEvidenceBytes) === evidenceHash;
  check(evidenceOk, 'DOCUMENTARY_RIGHTS_EVIDENCE_UNVERIFIED');
  return Object.freeze({
    state: errors.length ? 'HOLD' : 'READY_FOR_INDEPENDENT_HUMAN_REVIEW',
    blockers: Object.freeze([...new Set(errors)].sort()),
    original_bytes_verified: bytesOk,
    rights_document_bytes_verified: evidenceOk,
    acquisition_authorized: false,
    mirror_authorized: false,
    publication_authorized: false,
  });
}
