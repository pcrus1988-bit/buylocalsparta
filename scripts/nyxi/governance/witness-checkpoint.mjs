import { createHash, verify as verifySignature } from 'node:crypto';
import { root, verify as verifyChain } from './attestation-ledger.mjs';

const VERSION = 1;
const SCOPE = 'nyxi-agent1-provenance-only';
const PREFIX = 'NYXI_AGENT1_EXTERNAL_WITNESS_V1\n';
const SHA = /^[0-9a-f]{64}$/;
const WITNESS = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const FIELDS = ['version','scope','witness_id','issued_at','entry_count','root_sha256','publication_authorized'];
const exactKeys = (object, keys) => object && Object.getPrototypeOf(object) === Object.prototype &&
  Object.keys(object).sort().join('|') === [...keys].sort().join('|');
const canonicalTime = value => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// A witness cannot truthfully issue a checkpoint before ANY observation in its
// signed chain, even if observations were appended out of chronological order.
const observationsNotInFuture = (chain, issuedAt) => Array.isArray(chain) &&
  chain.length > 0 && chain.every(row =>
    typeof row?.event?.observed_at === 'string' &&
    Number.isFinite(Date.parse(row.event.observed_at)) &&
    Date.parse(row.event.observed_at) <= Date.parse(issuedAt));

function validRequest(request) {
  return exactKeys(request,FIELDS) && request.version === VERSION && request.scope === SCOPE &&
    typeof request.witness_id === 'string' && WITNESS.test(request.witness_id) &&
    canonicalTime(request.issued_at) && Number.isSafeInteger(request.entry_count) && request.entry_count > 0 &&
    typeof request.root_sha256 === 'string' && SHA.test(request.root_sha256) &&
    request.publication_authorized === false;
}
function payload(request) {
  // Fixed-field order is part of the signed protocol; no arbitrary JSON is signed.
  return PREFIX + JSON.stringify(Object.fromEntries(FIELDS.map(field => [field,request[field]])));
}

/** Build a metadata-only request. A separate, trusted witness must sign its payload. */
export function createWitnessRequest(chain, {witnessId,issuedAt} = {}) {
  if (typeof witnessId !== 'string' || !WITNESS.test(witnessId) || !canonicalTime(issuedAt))
    throw Error('invalid_witness_request');
  const request = {version:VERSION,scope:SCOPE,witness_id:witnessId,issued_at:issuedAt,
    entry_count:chain.length,root_sha256:root(chain),publication_authorized:false};
  if (!validRequest(request) || !observationsNotInFuture(chain, issuedAt)) throw Error('invalid_witness_request');
  return {request,signing_payload:payload(request)};
}

/** Verify against a PUBLIC KEY pinned outside the ledger and its storage domain. */
export function verifyWitnessCheckpoint(chain, checkpoint, {pinnedPublicKey,expectedWitnessId} = {}) {
  try {
    if (!exactKeys(checkpoint,['request','signature_base64']) || !validRequest(checkpoint.request) ||
        checkpoint.request.witness_id !== expectedWitnessId ||
        !pinnedPublicKey || pinnedPublicKey.type !== 'public' || pinnedPublicKey.asymmetricKeyType !== 'ed25519') return false;
    const signature = checkpoint.signature_base64;
    if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false;
    const raw = Buffer.from(signature,'base64');
    if (raw.length !== 64 || raw.toString('base64') !== signature) return false;
    if (!observationsNotInFuture(chain, checkpoint.request.issued_at) ||
        chain.length !== checkpoint.request.entry_count ||
        !verifyChain(chain,checkpoint.request.root_sha256)) return false;
    return verifySignature(null,Buffer.from(payload(checkpoint.request),'utf8'),pinnedPublicKey,raw);
  } catch { return false; }
}

/** Fingerprint for out-of-band key pinning; NEVER trust a key from a checkpoint. */
export function publicKeyFingerprint(pinnedPublicKey) {
  if (!pinnedPublicKey || pinnedPublicKey.type !== 'public' || pinnedPublicKey.asymmetricKeyType !== 'ed25519')
    throw Error('invalid_pinned_witness_key');
  return digest(pinnedPublicKey.export({type:'spki',format:'der'}));
}
