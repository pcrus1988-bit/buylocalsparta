import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const date = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
const bytes = x => Buffer.isBuffer(x) || x instanceof Uint8Array;
const uuid = x => typeof x === 'string' && UUID.test(x);
const sha = x => typeof x === 'string' && SHA.test(x);
const safeUrl = x => { try { const u = new URL(x); return u.protocol === 'https:' && !u.username && !u.password && !u.hash; } catch { return false; } };
const reasons = new Set(['missing_retention','missing_rights_evidence','undecidable_scope','original_bytes_unavailable']);
// Process-local capability: a byte-verified event must originate from observe().
// This does NOT replace independent byte access or a trusted external witness.
const byteVerifiedEvents = new WeakSet();
const eventKeys = ['type','source_id','snapshot_id','approval_id','snapshot_sha256','byte_length','fetched_at','observed_at','reason','publication_authorized'];
// A snapshot is immutable. Later observations may change type/reason/time,
// never the identity of the captured source, authorization, hash or bytes.
const snapshotIdentity = e => JSON.stringify([e.source_id,e.approval_id,e.snapshot_sha256,e.byte_length,e.fetched_at]);

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' +
    Object.keys(value).sort().map(k => {
      if (['__proto__','constructor','prototype'].includes(k)) throw Error('unsafe_key');
      return JSON.stringify(k) + ':' + canonical(value[k]);
    }).join(',') + '}';
  throw Error('noncanonical_value');
}
function checkEvent(e) {
  if (!e || Object.getPrototypeOf(e) !== Object.prototype || Object.keys(e).some(k => !eventKeys.includes(k))) throw Error('invalid_event_schema');
  if (!['catalog_observed','original_bytes_verified','rights_review_hold'].includes(e.type) ||
      !uuid(e.source_id) || !uuid(e.snapshot_id) || !uuid(e.approval_id) ||
      !sha(e.snapshot_sha256) || !Number.isSafeInteger(e.byte_length) || e.byte_length <= 0 ||
      !date(e.fetched_at) || !date(e.observed_at) || Date.parse(e.observed_at) < Date.parse(e.fetched_at) || e.publication_authorized !== false)
    throw Error('invalid_event_fields');
  if (e.type === 'rights_review_hold' ? !reasons.has(e.reason) : Object.hasOwn(e,'reason')) throw Error('invalid_reason');
  canonical(e);
}
function binding(source, approval, snapshot) {
  if (!uuid(source?.id) || !uuid(approval?.id) || !uuid(snapshot?.id) ||
      source.id !== approval.source_id || source.id !== snapshot.source_id ||
      snapshot?.provenance?.asset_approval_id !== approval.id || approval.acquisition_authorized !== true)
    throw Error('acquisition_binding_invalid');
  const finalUrl = approval.approved_final_url || approval.asset_url;
  if (![source.canonical_url,approval.asset_url,finalUrl,snapshot.final_url].every(safeUrl) ||
      source.canonical_url !== approval.asset_url || snapshot.final_url !== finalUrl) throw Error('exact_url_invalid');
  if (![approval.approved_at,approval.expires_at,snapshot.fetched_at].every(date) ||
      Date.parse(snapshot.fetched_at) < Date.parse(approval.approved_at) ||
      Date.parse(snapshot.fetched_at) >= Date.parse(approval.expires_at)) throw Error('capture_outside_authorization');
  if (!sha(snapshot.sha256) || !Number.isSafeInteger(snapshot.byte_length) || snapshot.byte_length <= 0)
    throw Error('invalid_snapshot_hash_or_size');
  const path = snapshot.storage_path;
  if (snapshot.storage_bucket !== 'nyxi-evidence' || typeof path !== 'string' ||
      path.startsWith('/') || path.includes('\\') || path.split('/').some(x => !x || x === '.' || x === '..' || x.includes('\0')) ||
      !path.startsWith(source.id + '/' + snapshot.sha256 + '/')) throw Error('invalid_private_storage_binding');
}
export function observe({source,approval,snapshot,originalBytes,observedAt,holdReason} = {}) {
  binding(source,approval,snapshot);
  if (!date(observedAt)) throw Error('invalid_observed_at');
  let type = 'catalog_observed';
  if (holdReason !== undefined) {
    if (!reasons.has(holdReason) || originalBytes !== undefined) throw Error('invalid_hold');
    type = 'rights_review_hold';
  } else if (originalBytes !== undefined) {
    if (!bytes(originalBytes)) throw Error('original_bytes_required');
    if (originalBytes.byteLength !== snapshot.byte_length || digest(originalBytes) !== snapshot.sha256)
      throw Error('original_bytes_mismatch');
    type = 'original_bytes_verified';
  }
  const event = {type,source_id:source.id,snapshot_id:snapshot.id,approval_id:approval.id,
    snapshot_sha256:snapshot.sha256,byte_length:snapshot.byte_length,
    fetched_at:snapshot.fetched_at,observed_at:observedAt,publication_authorized:false};
  if (type === 'rights_review_hold') event.reason = holdReason;
  checkEvent(event);
  if (type === 'original_bytes_verified') byteVerifiedEvents.add(event);
  return Object.freeze(event);
}
export function append(chain,event) {
  if (!Array.isArray(chain)) throw Error('invalid_chain');
  checkEvent(event);
  if (event.type === 'original_bytes_verified' && !byteVerifiedEvents.has(event))
    throw Error('unverified_byte_attestation_event');
  const previous_hash = chain.length ? chain[chain.length - 1]?.entry_hash : '0'.repeat(64);
  if (!sha(previous_hash) || (chain.length && !verify(chain, previous_hash)))
    throw Error('invalid_existing_chain');
  if (chain.some(row => row.event.snapshot_id === event.snapshot_id &&
      snapshotIdentity(row.event) !== snapshotIdentity(event))) throw Error('snapshot_identity_drift');
  const row = {sequence:chain.length + 1,previous_hash,event:structuredClone(event)};
  return [...chain,{...row,entry_hash:digest('NYXI_AGENT1_LEDGER_V1\n' + canonical(row))}];
}
export function verify(chain,independentlyPinnedRoot) {
  if (!Array.isArray(chain) || !chain.length || !sha(independentlyPinnedRoot)) return false;
  let previous = '0'.repeat(64);
  const identities = new Map();
  try {
    for (let i = 0; i < chain.length; i++) {
      const row = chain[i];
      if (!row || Object.getPrototypeOf(row) !== Object.prototype ||
          Object.keys(row).sort().join(',') !== 'entry_hash,event,previous_hash,sequence' ||
          row.sequence !== i + 1 || row.previous_hash !== previous) return false;
      checkEvent(row.event);
      const id = snapshotIdentity(row.event);
      const known = identities.get(row.event.snapshot_id);
      if (known !== undefined && known !== id) return false;
      identities.set(row.event.snapshot_id, id);
      const actual = digest('NYXI_AGENT1_LEDGER_V1\n' + canonical({sequence:row.sequence,previous_hash:row.previous_hash,event:row.event}));
      if (actual !== row.entry_hash) return false;
      previous = actual;
    }
    return previous === independentlyPinnedRoot;
  } catch { return false; }
}
export function root(chain) {
  if (!Array.isArray(chain) || !chain.length) throw Error('empty_chain');
  const candidate = chain[chain.length - 1]?.entry_hash;
  // This validates internal consistency only. Publication or independent
  // provenance claims still require an externally pinned root.
  if (!sha(candidate) || !verify(chain, candidate)) throw Error('invalid_existing_chain');
  return candidate;
}
