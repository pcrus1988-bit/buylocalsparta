import {createHash} from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
function instant(value) {
  if (typeof value !== 'string') return NaN;
  const m = ISO.exec(value);
  if (!m) return NaN;
  const [y, mo, d, h, mi, s] = m.slice(1,7).map(Number);
  const leap = y%4===0 && (y%100!==0 || y%400===0);
  const days = [31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if (y<1 || mo<1 || mo>12 || d<1 || d>days[mo-1] || h>23 || mi>59 || s>59) return NaN;
  const zone = m[7];
  if (zone!=='Z') {
    const oh=Number(zone.slice(1,3)), om=Number(zone.slice(4,6));
    if (oh>14 || om>59 || (oh===14 && om!==0)) return NaN;
  }
  return Date.parse(value);
}
function urlHost(value) {
  try {
    const u = new URL(value);
    return u.protocol==='https:' && !u.username && !u.password && !u.search && !u.hash && u.toString()===value ? u.hostname : null;
  } catch { return null; }
}

// Advisory ONLY. Supplied reviewer IDs are NOT authenticated identities.
// A human must independently authorize any acquisition or publication.
export function policyEvidencePreflight({source, snapshot, evidence, policyBytes}={}) {
  const problems=[];
  const hold=(ok,code)=>{if(!ok)problems.push(code);};
  const src=source && typeof source==='object' ? source : {};
  const snap=snapshot && typeof snapshot==='object' ? snapshot : {};
  const e=evidence && typeof evidence==='object' ? evidence : {};
  const host=urlHost(src.canonical_url), policyHost=urlHost(e.policy_url);
  hold(Boolean(host && policyHost && host===policyHost && e.final_url===e.policy_url),'POLICY_URL_SCOPE');
  hold(e.source_id===src.id && e.snapshot_id===snap.id && snap.source_id===src.id,'EXACT_SNAPSHOT_BINDING');
  hold(e.scope==='original_first_party_html_only' && e.revoked_at==null,'RIGHTS_SCOPE');
  hold(e.http_status===200 && e.mime_type==='text/html' && e.no_link_following===true,'POLICY_RESPONSE_SCOPE');
  const captured=instant(e.captured_at), fetched=instant(snap.fetched_at);
  hold(Number.isFinite(captured) && Number.isFinite(fetched) && captured<=fetched,'HISTORICAL_POLICY_NOT_PROVEN');
  const digest=policyBytes instanceof Uint8Array ? createHash('sha256').update(policyBytes).digest('hex') : null;
  hold(SHA256.test(e.sha256??'') && digest===e.sha256 && policyBytes?.length>0,'POLICY_BYTES_NOT_VERIFIED');
  hold(typeof e.collector_user_id==='string' && typeof e.reviewer_user_id==='string' &&
    e.collector_user_id.length>0 && e.reviewer_user_id.length>0 &&
    e.collector_user_id!==e.reviewer_user_id,'REVIEWER_SEPARATION_UNPROVEN');
  return Object.freeze({state:problems.length?'HOLD':'READY_FOR_AUTHENTICATED_HUMAN_REVIEW',
    blockers:Object.freeze([...new Set(problems)].sort()),
    acquisition_authorized:false,publication_authorized:false,mirror_authorized:false});
}
