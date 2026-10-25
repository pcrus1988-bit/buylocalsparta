import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPrivateInciLabelEvidence as audit} from './private-inci-label-evidence-audit.mjs';
const u=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),h=n=>String(n).repeat(64),k=(kind,n)=>'nyxi:v2:'+kind+':'+h(n);
function fixture(){const source=u(1),product=k('product','a'),ingredient=k('inci','b');const identity=candidate_key=>({candidate_key,source_id:source,identity_status:'source_scoped_candidate',independently_reviewed:false,publication_allowed:false});const s={id:u(2),source_id:source,sha256:h('c')},f={id:u(3),source_id:source,snapshot_id:s.id,content_sha256:h('d')},m={product_candidate_key:product,ingredient_candidate_key:ingredient,source_id:source,snapshot_id:s.id,fragment_id:f.id,fragment_sha256:f.content_sha256,position:1,assertion_type:'unreviewed_label_transcription'};return [[identity(product)],[identity(ingredient)],[s],[f],[m]]}
test('private aggregate with no approval, names or IDs',()=>{const r=audit(...fixture());assert.equal(r.mention_count,1);assert.equal(r.publication_allowed,false);assert.equal(r.product_formula_verified,false);assert.equal(r.archived_bytes_verified,false);assert.equal(Object.isFrozen(r),true);assert.equal(JSON.stringify(r).includes('nyxi:v2'),false)});
const cases=[
['forged product approval',f=>f[0][0].publication_allowed=true],
['forged ingredient review',f=>f[1][0].independently_reviewed=true],
['extra product field',f=>f[0][0].approved=true],
['extra mention field',f=>f[4][0].compliance=true],
['cross-source product',f=>f[0][0].source_id=u(4)],
['cross-source ingredient',f=>f[1][0].source_id=u(4)],
['cross-source snapshot',f=>f[2][0].source_id=u(4)],
['cross-source fragment',f=>f[3][0].source_id=u(4)],
['wrong snapshot reference',f=>f[4][0].snapshot_id=u(4)],
['wrong fragment reference',f=>f[4][0].fragment_id=u(4)],
['wrong fragment digest',f=>f[4][0].fragment_sha256=h('e')],
['invalid snapshot digest',f=>f[2][0].sha256='not-sha'],
['invalid product key kind',f=>f[0][0].candidate_key=k('brand','a')],
['invalid ingredient key kind',f=>f[1][0].candidate_key=k('product','b')],
['position zero',f=>f[4][0].position=0],
['position float',f=>f[4][0].position=1.2],
['position too large',f=>f[4][0].position=1001],
['forged assertion type',f=>f[4][0].assertion_type='verified_safe'],
['duplicate product',f=>f[0].push({...f[0][0]})],
['duplicate ingredient',f=>f[1].push({...f[1][0]})],
['duplicate snapshot',f=>f[2].push({...f[2][0]})],
['duplicate fragment',f=>f[3].push({...f[3][0]})],
['duplicate position',f=>f[4].push({...f[4][0]})],
['accessor mention',f=>Object.defineProperty(f[4][0],'position',{get(){throw Error('getter executed')},enumerable:true})],
['hidden mention metadata',f=>Object.defineProperty(f[4][0],'hidden',{value:'approval',enumerable:false})],
['symbol injection',f=>f[4][0][Symbol('approved')]=true],
['proxy mention',f=>f[4][0]=new Proxy(f[4][0],{})],
['sparse mentions',f=>{f[4].length=2}],
['empty products',f=>f[0]=[]],
['empty mentions',f=>f[4]=[]]
];
for(const [name,change] of cases)test('rejects '+name,()=>{const f=structuredClone(fixture());change(f);assert.throws(()=>audit(...f))});
test('cross-snapshot candidate disagreement, not verified formula drift',()=>{const f=fixture(),s={id:u(5),source_id:u(1),sha256:h('e')},fr={id:u(6),source_id:u(1),snapshot_id:s.id,content_sha256:h('f')},i={...f[1][0],candidate_key:k('inci','e')};f[2].push(s);f[3].push(fr);f[1].push(i);f[4].push({...f[4][0],ingredient_candidate_key:i.candidate_key,snapshot_id:s.id,fragment_id:fr.id,fragment_sha256:fr.content_sha256});const r=audit(...f);assert.equal(r.cross_snapshot_position_disagreement_count,1);assert.equal(r.product_formula_verified,false)});
test('same candidate across snapshots does not count as disagreement',()=>{const f=fixture(),s={id:u(5),source_id:u(1),sha256:h('e')},fr={id:u(6),source_id:u(1),snapshot_id:s.id,content_sha256:h('f')};f[2].push(s);f[3].push(fr);f[4].push({...f[4][0],snapshot_id:s.id,fragment_id:fr.id,fragment_sha256:fr.content_sha256});assert.equal(audit(...f).cross_snapshot_position_disagreement_count,0)});
