import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';
const KINDS = new Set(['manufacturer', 'brand', 'family', 'product', 'shade', 'inci']);
const INPUT_FIELDS = new Set(['kind','source_id','parent_key','label','external_namespace','external_id','code']);
const PARENT = { brand:'manufacturer', family:'brand', product:'family', shade:'product' };
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const KEY = /^nyxi:v[12]:(manufacturer|brand|family|product|shade|inci):[a-f\d]{64}$/;
const V2_PARENT_KEY = /^nyxi:v2:(manufacturer|brand|family|product|shade|inci):[a-f\d]{64}$/;
const normalize = (value, field) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || /[\x00-\x1f\x7f\p{Cf}\uD800-\uDFFF]/u.test(value)) throw new TypeError(`INVALID_${field.toUpperCase()}`);
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function sourceScopedCandidate(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || utilTypes.isProxy(input)) throw new TypeError('INVALID_CANDIDATE_INPUT_OBJECT');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('INVALID_CANDIDATE_INPUT_OBJECT');
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.some(key => ['review_status','publication_allowed','verified','approved'].includes(key))) throw new TypeError('REVIEW_OR_APPROVAL_INPUT_FORBIDDEN');
  if (ownKeys.some(key => typeof key !== 'string' || !INPUT_FIELDS.has(key))) throw new TypeError('UNEXPECTED_CANDIDATE_INPUT_FIELD');
  if (ownKeys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value'))) throw new TypeError('ACCESSOR_CANDIDATE_INPUT_FORBIDDEN');
  if (ownKeys.some(key => Object.getOwnPropertyDescriptor(input, key).enumerable !== true)) throw new TypeError('HIDDEN_CANDIDATE_INPUT_FIELD');
  if (!KINDS.has(input.kind)) throw new TypeError('INVALID_KIND');
  if (typeof input.source_id !== 'string' || !UUID.test(input.source_id)) throw new TypeError('SOURCE_REQUIRED');
  const kind = input.kind;
  const parent = input.parent_key;
  if (PARENT[kind]) {
    if (typeof parent !== 'string' || !V2_PARENT_KEY.test(parent) || parent.split(':')[2] !== PARENT[kind]) throw new TypeError('INVALID_PARENT');
  } else if (parent !== undefined) throw new TypeError('UNEXPECTED_PARENT');
  const hasExternal = input.external_namespace !== undefined || input.external_id !== undefined;
  const external = hasExternal ? [normalize(input.external_namespace, 'external_namespace'), normalize(input.external_id, 'external_id')] : null;
  const label = normalize(input.label, 'label');
  const code = input.code === undefined ? null : normalize(input.code, 'code');
  if (kind === 'shade' && code === null) throw new TypeError('SHADE_CODE_REQUIRED');
  if (kind === 'inci' && (code !== null || external !== null)) throw new TypeError('INCI_NAME_ONLY');
  const discriminator = external ? ['external_claim', ...external, code] : ['provisional', code, label];
  const tuple = [kind, input.source_id.toLowerCase(), parent ?? null, discriminator];
  return Object.freeze({
    candidate_key: `nyxi:v2:${kind}:${digest(tuple)}`, kind, source_id: input.source_id.toLowerCase(),
    parent_key: parent ?? null, display_label: input.label.normalize('NFC').trim(),
    identity_status: 'source_scoped_candidate', reconciliation_required: true,
    independently_reviewed: false, publication_allowed: false,
  });
}
export function requireDistinctCandidateKeys(keys) {
  if (!Array.isArray(keys) || utilTypes.isProxy(keys) || Object.getPrototypeOf(keys) !== Array.prototype ||
      keys.length < 1 || keys.length > 1000) throw new TypeError('INVALID_KEYS');
  const ownKeys = Reflect.ownKeys(keys);
  if (ownKeys.length !== keys.length + 1 || !ownKeys.includes('length')) throw new TypeError('INVALID_KEYS');
  for (let i = 0; i < keys.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(keys, String(i));
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) throw new TypeError('INVALID_KEYS');
  }
  const seen = new Set();
  for (const key of keys) { if (typeof key !== 'string' || !KEY.test(key)) throw new TypeError('INVALID_KEY'); if (seen.has(key)) throw new TypeError('DUPLICATE_KEY'); seen.add(key); }
  return Object.freeze({ count: seen.size, auto_merge_allowed: false, publication_allowed: false });
}
