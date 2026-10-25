/** NYXI Agent 3 — private-only digital swatch evidence binding.
 * Metadata consistency is NOT archived-byte verification, product authenticity,
 * physical shade calibration, reviewer approval, or publication authorization.
 */
import { types as utilTypes } from 'node:util';
import { approximatePrivateDigitalHexLab } from './private-digital-hex-lab-interval.mjs';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const fail = (ok, code) => { if (!ok) throw new TypeError(code); };
function record(value, fields) {
  fail(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    !utilTypes.isProxy(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'INVALID_RECORD');
  const keys = Reflect.ownKeys(value);
  fail(keys.length === fields.length && keys.every(key =>
    typeof key === 'string' && fields.includes(key) &&
    Object.getOwnPropertyDescriptor(value, key)?.enumerable === true &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')), 'INVALID_FIELDS');
}
function uuid(value) { fail(typeof value === 'string' && UUID.test(value), 'INVALID_UUID'); return value.toLowerCase(); }
function hash(value) { fail(typeof value === 'string' && SHA256.test(value), 'INVALID_SHA256'); return value.toLowerCase(); }

/** The input must be a PRIVATE, unreviewed digital swatch transcription. */
export function approximatePrivateSourceBoundShade(input) {
  record(input, ['source', 'snapshot', 'fragment', 'swatch']);
  record(input.source, ['id']);
  record(input.snapshot, ['id', 'source_id', 'sha256']);
  record(input.fragment, ['id', 'source_id', 'snapshot_id', 'content_sha256']);
  record(input.swatch, [
    'source_id', 'snapshot_id', 'fragment_id', 'fragment_sha256',
    'hex_srgb', 'assumed_channel_error_8bit', 'origin',
    'independently_reviewed', 'publication_allowed',
  ]);
  const source = uuid(input.source.id);
  const snapshot = uuid(input.snapshot.id);
  const fragment = uuid(input.fragment.id);
  hash(input.snapshot.sha256);
  const fragmentHash = hash(input.fragment.content_sha256);
  fail(uuid(input.snapshot.source_id) === source &&
    uuid(input.fragment.source_id) === source &&
    uuid(input.fragment.snapshot_id) === snapshot, 'EVIDENCE_ANCESTRY_MISMATCH');
  fail(uuid(input.swatch.source_id) === source &&
    uuid(input.swatch.snapshot_id) === snapshot &&
    uuid(input.swatch.fragment_id) === fragment, 'SWATCH_ANCESTRY_MISMATCH');
  fail(hash(input.swatch.fragment_sha256) === fragmentHash, 'FRAGMENT_HASH_MISMATCH');
  fail(input.swatch.origin === 'unreviewed_digital_swatch' &&
    input.swatch.independently_reviewed === false &&
    input.swatch.publication_allowed === false, 'UNREVIEWED_PRIVATE_ONLY');
  const color = approximatePrivateDigitalHexLab(input.swatch.hex_srgb, input.swatch.assumed_channel_error_8bit);
  return Object.freeze({
    schema_version: 'nyxi-private-source-bound-digital-swatch-v1',
    lab_d65_reference: color.lab_d65_reference,
    lab_d65_component_interval: color.lab_d65_component_interval,
    assumed_channel_error_8bit: color.assumed_channel_error_8bit,
    evidence_metadata_consistent: true,
    archived_bytes_verified: false,
    source_rights_verified: false,
    manufacturer_identity_verified: false,
    physical_shade_appearance_verified: false,
    uncertainty_empirically_calibrated: false,
    independently_reviewed: false,
    recommendation_authorized: false,
    publication_allowed: false,
    private_only: true,
  });
}
