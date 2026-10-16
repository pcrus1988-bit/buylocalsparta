import assert from 'node:assert/strict';
import test from 'node:test';
import {transformSnapshot,sha256,asJsonl} from './snapshot-adapter.mjs';
const fixture=()=>({
  date:'2026-10-15',fetched_at:'2026-10-15T12:00:00Z',total:2,collected:2,
  products:[
    {id:'p-one',name:'Γάλα 1 L',brand:'EXAMPLE',category:'Dairy',unit:'L',unit_quantity:1,
      retailer_prices:[
        {retailer:'mymarket',retailer_display_name:'My Market',country:'GR',price:1.99,price_normalized:1.99,last_updated:'2026-10-15T00:00:00'},
        {retailer:'alphamega',country:'CY',price:2.4}
      ]},
    {id:'p-two',name:'Ψωμί',retailer_prices:[]}
  ]
});
test('isolates Greek reference prices, without vendor stock',()=>{
  const result=transformSnapshot(fixture());
  assert.equal(result.references.length,2);
  assert.equal(result.prices.length,1);
  assert.equal(result.prices[0].price_eur,1.99);
  assert.equal(result.prices[0].retailer_id,'mymarket');
  assert.equal(result.manifest.permissions,'RESEARCH_ONLY_RIGHTS_UNVERIFIED');
  assert.ok(!('vendor_id' in result.prices[0]));
});
test('rejects incomplete product snapshots',()=>{
  const a=fixture();a.collected=1;
  assert.throws(()=>transformSnapshot(a),/incomplete/);
  const b=fixture();b.products.pop();
  assert.throws(()=>transformSnapshot(b),/mismatch/);
});
test('rejects ambiguous product/retailer identity',()=>{
  const a=fixture();a.products[1].id='p-one';
  assert.throws(()=>transformSnapshot(a),/duplicate product/);
  const b=fixture();b.products[0].retailer_prices.push({retailer:'mymarket',country:'GR',price:1.3});
  assert.throws(()=>transformSnapshot(b),/duplicate retailer/);
});
test('ignores invalid prices while surfacing warnings',()=>{
  const a=fixture();a.products[0].retailer_prices[0].price=-2;
  const output=transformSnapshot(a);
  assert.equal(output.prices.length,0);
  assert.equal(output.manifest.warnings.invalid_price_rows,1);
  assert.ok(asJsonl(output.references).endsWith('\n'));
  assert.match(sha256('test'),/^[a-f0-9]{64}$/);
});