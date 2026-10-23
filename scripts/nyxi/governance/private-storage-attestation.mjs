import { observe, append } from './attestation-ledger.mjs';

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const HARD_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Agent 2 private Storage-byte verification bridge. This is deliberately
 * dependency-injected: the caller must supply a server-side, authorized
 * Supabase Storage client. Never invoke this from a browser/public route.
 *
 * No content, private Storage path or credentials enter the returned ledger.
 * This is not an immutable sink, a witness, or publication-rights clearance.
 */
export async function appendPrivateStorageAttestation({
  chain, source, approval, snapshot, storage, observedAt,
  maxBytes = DEFAULT_MAX_BYTES
} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > HARD_MAX_BYTES)
    throw Error('invalid_archive_size_limit');

  // Validate authorization, exact private path and existing chain BEFORE
  // making any network request to the private Storage object.
  const catalog = observe({ source, approval, snapshot, observedAt });
  append(chain, catalog);
  if (snapshot.byte_length > maxBytes) throw Error('archive_exceeds_size_limit');
  if (!storage || typeof storage.from !== 'function')
    throw Error('authorized_private_storage_reader_required');

  let response;
  try {
    const bucket = storage.from(snapshot.storage_bucket);
    if (!bucket || typeof bucket.download !== 'function')
      throw Error('invalid_reader');
    response = await bucket.download(snapshot.storage_path);
  } catch {
    throw Error('private_archive_download_failed');
  }
  const blob = response?.data;
  if (response?.error || !blob || typeof blob.arrayBuffer !== 'function' ||
      !Number.isSafeInteger(blob.size) || blob.size !== snapshot.byte_length)
    throw Error('private_archive_unavailable_or_size_mismatch');

  let originalBytes;
  try {
    originalBytes = new Uint8Array(await blob.arrayBuffer());
  } catch {
    throw Error('private_archive_read_failed');
  }
  try {
    if (originalBytes.byteLength !== snapshot.byte_length)
      throw Error('private_archive_unavailable_or_size_mismatch');
    const event = observe({ source, approval, snapshot, originalBytes, observedAt });
    return { chain: append(chain, event), event };
  } finally {
    // Best-effort erase our in-memory copy, not a claim of secure memory.
    originalBytes.fill(0);
  }
}
