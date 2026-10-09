/**
 * NYXI Agent 4: fail-closed eligibility gate for immutable, rights-cleared snapshots.
 * Pure validation: does not fetch, mutate, parse, or assert scientific facts.
 * Extraction workers MUST verify SHA-256 against original object bytes before use.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SUPPORTED = new Set(['text/html','application/pdf','application/json','text/csv','application/xml','text/xml','text/plain']);
const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const same = (a,b) => typeof a === 'string' && a === b;

/** Pure readiness assessment; no database writes or network calls. */
export function assessNyxiExtractionReadiness(input) {
  const {source={},snapshot={},manifest={},approval={}} = input ?? {};
  const reasons=[];
  const check=(test,reason)=>{if(!test) reasons.push(reason)};
  check(UUID.test(source.id??''),'source_identity_missing');
  check(UUID.test(snapshot.id??''),'snapshot_identity_missing');
  check(UUID.test(manifest.id??''),'manifest_identity_missing');
  check(UUID.test(approval.id??''),'approval_identity_missing');
  check(same(source.id,snapshot.source_id) && same(source.id,manifest.source_id) && same(source.id,approval.source_id),'source_identity_mismatch');
  check(same(snapshot.id,manifest.snapshot_id),'manifest_snapshot_mismatch');
  check(source.status === 'verified' || source.status === 'active','source_not_verified');
  check(approval.acquisition_authorized === true,'asset_not_authorized');
  check(same(approval.asset_url,snapshot.provenance?.requested_url),'requested_asset_mismatch');
  check(same(approval.approved_final_url || approval.asset_url,snapshot.final_url),'final_asset_mismatch');
  check(same(approval.id,snapshot.provenance?.asset_approval_id),'approval_provenance_mismatch');
  check(typeof approval.retention_policy==='string' && approval.retention_policy.trim().length>0 && same(approval.retention_policy,snapshot.provenance?.retention_policy),'retention_policy_missing_or_mismatched');
  check(validDate(snapshot.fetched_at),'fetch_timestamp_missing');
  const fetchTime=Date.parse(snapshot.fetched_at??'');
  check(validDate(approval.approved_at) && Date.parse(approval.approved_at)<=fetchTime,'approval_not_valid_at_fetch');
  check(validDate(approval.expires_at) && Date.parse(approval.expires_at)>fetchTime,'approval_expired_at_fetch');
  check(validDate(approval.review_due_at) && Date.parse(approval.review_due_at)>fetchTime,'review_overdue_at_fetch');
  check(approval.retention_until == null || (validDate(approval.retention_until) && Date.parse(approval.retention_until)>Date.now()),'retention_expired');
  check(snapshot.provenance?.original_bytes_preserved===true,'original_bytes_not_confirmed');
  check(snapshot.http_status===200,'capture_not_http_200');
  check(snapshot.storage_bucket==='nyxi-evidence' && typeof snapshot.storage_path==='string' && snapshot.storage_path.startsWith('private/nyxi/source-archive/'),'immutable_storage_missing');
  check(SHA256.test(snapshot.sha256??'') && snapshot.storage_path?.includes(snapshot.sha256??'!'),'sha256_or_content_address_missing');
  check(Number.isSafeInteger(snapshot.byte_length) && snapshot.byte_length>0,'byte_length_missing');
  check(SUPPORTED.has(String(snapshot.mime_type??'').split(';')[0].trim().toLowerCase()),'unsupported_mime');
  check(manifest.corpus_state==='archived','manifest_not_archived');
  check(manifest.extraction_status==='pending' || manifest.extraction_status==='ready','extraction_not_pending');
  check(!['failed','quarantined','rejected'].includes(snapshot.parser_status),'parser_rejected');
  // Drive mirroring is NOT an extraction prerequisite. Immutable storage is authoritative.
  return {ready:reasons.length===0,reasons,idempotencyKey:reasons.length===0?`${snapshot.id}:${snapshot.sha256}`:null,sourceId:UUID.test(source.id??'')?source.id:null,snapshotId:UUID.test(snapshot.id??'')?snapshot.id:null};
}
