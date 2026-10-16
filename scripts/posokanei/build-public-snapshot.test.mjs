import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('publication is rights-gated; audited local snapshot can be prepared without images or checkout',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'posokanei-public-'));
  try{
    const stage=join(dir,'stage');await mkdir(stage);
    const products=[
      {source_product_id:'p1',snapshot_date:'2026-10-16',name:'Ντομάτα Α',unit:'g',unit_quantity:400},
      {source_product_id:'p2',snapshot_date:'2026-10-16',name:'Ντομάτα Β',unit:'kg',unit_quantity:1}
    ];
    const prices=[
      {source_product_id:'p1',snapshot_date:'2026-10-16',country:'GR',retailer_id:'r1',price_eur:1.5},
      {source_product_id:'p2',snapshot_date:'2026-10-16',country:'GR',retailer_id:'r2',price_eur:0}
    ];
    const manifest={source:'posokanei.gov.gr',permissions:'RESEARCH_ONLY_RIGHTS_UNVERIFIED',
      snapshot_date:'2026-10-16',source_total:2,source_collected:2,reference_price_observations:2,
      snapshot_sha256:'a'.repeat(64),countries:['GR']};
    await writeFile(join(stage,'manifest.json'),JSON.stringify(manifest));
    await writeFile(join(stage,'reference-products.jsonl'),products.map(JSON.stringify).join('\n')+'\n');
    await writeFile(join(stage,'reference-prices.jsonl'),prices.map(JSON.stringify).join('\n')+'\n');
    const groups=join(dir,'groups.json'),out=join(dir,'public.json');
    await writeFile(groups,JSON.stringify([{id:'tomato',label:'Ντομάτες',status:'approved',basis:'kg',
      reviewer:'human-reviewer',reviewed_at:'2026-10-16',memberIds:['p1','p2']}]));
    const base=['scripts/posokanei/build-public-snapshot.mjs','--staging',stage,'--groups',groups,'--out',out];
    const denied=spawnSync(process.execPath,base,{encoding:'utf8'});
    assert.notEqual(denied.status,0);
    const approved=spawnSync(process.execPath,[...base,'--rights-verified','--permission-ref','APPROVED_2026_10_16'],{encoding:'utf8'});
    assert.equal(approved.status,0,approved.stderr);
    const json=JSON.parse(await readFile(out,'utf8'));
    assert.equal(json.products.length,2);
    assert.equal(json.observations.length,1);
    assert.equal(json.approvedGroups.length,1);
    assert.equal(JSON.stringify(json).includes('image_url'),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
