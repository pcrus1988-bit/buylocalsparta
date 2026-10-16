import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('CLI reads staged private archive and produces a complete basket comparison without network',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'posokanei-basket-test-'));
  try {
    const staging=join(dir,'staging');
    await mkdir(staging);
    const productRows=[
      {source_product_id:'a',name:'Ρύζι',snapshot_date:'2026-10-15'},
      {source_product_id:'b',name:'Γάλα',snapshot_date:'2026-10-15'}
    ];
    const priceRows=[
      {source_product_id:'a',snapshot_date:'2026-10-15',country:'GR',retailer_id:'alpha',price_eur:2},
      {source_product_id:'a',snapshot_date:'2026-10-15',country:'GR',retailer_id:'beta',price_eur:1},
      {source_product_id:'b',snapshot_date:'2026-10-15',country:'GR',retailer_id:'alpha',price_eur:1},
      {source_product_id:'b',snapshot_date:'2026-10-15',country:'GR',retailer_id:'beta',price_eur:2}
    ];
    const manifest={source:'posokanei.gov.gr',permissions:'RESEARCH_ONLY_RIGHTS_UNVERIFIED',
      source_total:2,source_collected:2,reference_products:2,
      reference_price_observations:4,snapshot_date:'2026-10-15'};
    await Promise.all([
      writeFile(join(staging,'manifest.json'),JSON.stringify(manifest)),
      writeFile(join(staging,'reference-products.jsonl'),productRows.map(x=>JSON.stringify(x)).join('\n')+'\n'),
      writeFile(join(staging,'reference-prices.jsonl'),priceRows.map(x=>JSON.stringify(x)).join('\n')+'\n')
    ]);
    const listFile=join(dir,'list.json');
    await writeFile(listFile,JSON.stringify({lines:[
      {id:'a',kind:'exact',sourceProductId:'a',packageCount:1},
      {id:'b',kind:'exact',sourceProductId:'b',packageCount:1}
    ]}));
    const run=()=>spawnSync(process.execPath,[new URL('./optimize-basket.mjs',import.meta.url).pathname,
      '--staging',staging,'--list',listFile],{encoding:'utf8'});
    const output=run();
    assert.equal(output.status,0,output.stderr);
    const report=JSON.parse(output.stdout);
    assert.equal(report.status,'PRIVATE_RESEARCH_EVALUATION_ONLY');
    assert.equal(report.cheapestAcrossAnyStores.totalEur,2);
    assert.equal(report.bestSingleStore.totalEur,3);
    assert.equal(report.savingsVsCheapestCompleteSingleStoreEur,1);

    // A staged file is *not* considered safe when its manifest fails provenance gate.
    await writeFile(join(staging,'manifest.json'),JSON.stringify({...manifest,permissions:'PUBLIC_OK'}));
    const denied=run();
    assert.notEqual(denied.status,0);
    assert.match(denied.stderr,/private evaluation/);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});
