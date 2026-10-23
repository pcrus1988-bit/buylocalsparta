import { publicKeyFingerprint, verifyWitnessCheckpoint } from './witness-checkpoint.mjs';

const SHA = /^[0-9a-f]{64}$/;
const FIELDS = ['entry_count', 'root_sha256', 'issued_at', 'witness_id', 'public_key_fingerprint'];
const canonicalTime = value => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const exactKeys = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');

/**
 * Verify an append-only successor against a PREVIOUSLY and INDEPENDENTLY
 * pinned witness anchor. The caller must obtain previousAnchor from a
 * separately controlled, authenticated witness store (never from the
 * checkpoint, source document, repository branch, or private database).
 *
 * This checks continuity, NOT independent storage immutability, key custody,
 * legal publication rights, or permission to publish.
 */
export function verifyWitnessContinuation(chain, checkpoint, {
  pinnedPublicKey, expectedWitnessId, previousAnchor
} = {}) {
  try {
    if (!Array.isArray(chain) || !exactKeys(previousAnchor, FIELDS) ||
        !Number.isSafeInteger(previousAnchor.entry_count) ||
        previousAnchor.entry_count < 1 || previousAnchor.entry_count >= chain.length ||
        typeof previousAnchor.root_sha256 !== 'string' || !SHA.test(previousAnchor.root_sha256) ||
        typeof previousAnchor.public_key_fingerprint !== 'string' ||
        !SHA.test(previousAnchor.public_key_fingerprint) ||
        !canonicalTime(previousAnchor.issued_at) ||
        previousAnchor.witness_id !== expectedWitnessId ||
        previousAnchor.public_key_fingerprint !== publicKeyFingerprint(pinnedPublicKey))
      return false;

    if (!verifyWitnessCheckpoint(chain, checkpoint, { pinnedPublicKey, expectedWitnessId }))
      return false;

    const request = checkpoint.request;
    return request.entry_count === chain.length &&
      chain[previousAnchor.entry_count - 1]?.entry_hash === previousAnchor.root_sha256 &&
      Date.parse(request.issued_at) > Date.parse(previousAnchor.issued_at);
  } catch { return false; }
}

/** Metadata-only candidate anchor; store externally only AFTER independent verification. */
export function checkpointAnchor(checkpoint, pinnedPublicKey, expectedWitnessId) {
  if (!checkpoint || checkpoint.request?.witness_id !== expectedWitnessId ||
      !pinnedPublicKey || pinnedPublicKey.type !== 'public' ||
      pinnedPublicKey.asymmetricKeyType !== 'ed25519')
    throw Error('invalid_checkpoint_anchor');
  const request = checkpoint.request;
  if (!Number.isSafeInteger(request.entry_count) || request.entry_count < 1 ||
      typeof request.root_sha256 !== 'string' || !SHA.test(request.root_sha256) ||
      !canonicalTime(request.issued_at) || request.publication_authorized !== false)
    throw Error('invalid_checkpoint_anchor');
  // This is a candidate only; a separate verifier MUST verify the signature
  // against the exact chain before pinning it in independent storage.
  return Object.freeze({
    entry_count: request.entry_count,
    root_sha256: request.root_sha256,
    issued_at: request.issued_at,
    witness_id: request.witness_id,
    public_key_fingerprint: publicKeyFingerprint(pinnedPublicKey)
  });
}
