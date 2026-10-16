import test from 'node:test';
import assert from 'node:assert/strict';
import {packageQuantity,exactProductOffers,compareApprovedAlternatives} from './comparison-engine.mjs';
const date='2026-10-15';
const products=[
  {source_product_id:'tomato-a',name:'Ντομάτα ψιλοκομμένη Α 400 g',brand:'A',unit:'g',unit_quantity:400},
  {source_product_id:'tomato-b',name:'Ντομάτα ψιλοκομμένη Β 500 g',brand:'B',unit:'g',unit_quantity:500},
  {source_product_id:'tomato-passata',name:'Passata 500 g',brand:'C',unit:'g',unit_quantity:500},
  {source_product_id:'tomato-no-unit',name:'Ντομάτα ψιλοκομμένη Χ',brand:'X'}
];
const price=(id,retailer,value,extras={})=>({source_product_id:id,snapshot_date:date,country:'GR',retailer_id:retailer,retailer_name:retailer,price_eur:value,...extras});
const observations=[
  price('tomato-a','market-x',1.2),price('tomato-a','market-y',0.96),
  price('tomato-b','market-x',1.0),price('tomato-b','market-y',1.1),
  price('tomato-passata','market-x',0.50),price('tomato-no-unit','market-x',0.79),
  {...price('tomato-a','market-z',0.25),snapshot_date:'2026-10-14'},
  {...price('tomato-a','cy-market',0.1),country:'CY'}
];
const group={id:'chopped-tomatoes',status:'approved',basis:'kg',memberIds:['tomato-a','tomato-b']};

test('exact item: cheapest retailer; ignore earlier dates and other countries',()=>{
  const x=exactProductOffers('tomato-a',observations,{snapshotDate:date});
  assert.equal(x.offers.length,2);
  assert.equal(x.cheapest.retailerId,'market-y');
  assert.equal(x.potentialSavingsEur,0.24);
  assert.equal(x.offers[0].isCheapest,true);
});
test('retailer filter lets customer select a preferred supermarket',()=>{
  const x=exactProductOffers('tomato-a',observations,{snapshotDate:date,retailerIds:['market-x']});
  assert.equal(x.cheapest.retailerId,'market-x');
  assert.equal(x.offers.length,1);
});
test('unit-value comparison differs from cheapest package price',()=>{
  const x=compareApprovedAlternatives({approvedGroup:group,products,observations,snapshotDate:date});
  assert.equal(x.recommended.sourceProductId,'tomato-b');
  assert.equal(x.recommended.bestUnitPriceEur,2); // €1 / 500 g
  assert.equal(x.alternatives[1].bestUnitPriceEur,2.4); // €0.96 / 400 g
  const pack=compareApprovedAlternatives({approvedGroup:group,products,observations,snapshotDate:date,ranking:'package'});
  assert.equal(pack.recommended.sourceProductId,'tomato-a');
});
test('unapproved groups and unrelated passata cannot be recommended',()=>{
  assert.throws(()=>compareApprovedAlternatives({approvedGroup:{...group,status:'suggested'},products,observations,snapshotDate:date}),/approved/);
  const x=compareApprovedAlternatives({approvedGroup:group,products,observations,snapshotDate:date});
  assert.ok(!x.alternatives.some(p=>p.sourceProductId==='tomato-passata'));
});
test('unknown units remain visible but are never recommended by €/kg',()=>{
  const x=compareApprovedAlternatives({approvedGroup:{...group,memberIds:[...group.memberIds,'tomato-no-unit']},products,observations,snapshotDate:date});
  assert.equal(x.alternatives.length,3);
  assert.equal(x.alternatives.find(p=>p.sourceProductId==='tomato-no-unit').bestUnitPriceEur,null);
  assert.equal(x.recommended.sourceProductId,'tomato-b');
});
test('zero/negative prices are invalid and duplicates cause failure',()=>{
  const x=exactProductOffers('tomato-a',[...observations,price('tomato-a','broken',0),price('tomato-a','negative',-1)],{snapshotDate:date});
  assert.equal(x.offers.length,2);
  assert.throws(()=>exactProductOffers('tomato-a',[...observations,price('tomato-a','market-y',0.88)],{snapshotDate:date}),/Duplicate/);
});
test('quantity normalization supports gram-kilogram, ml-litre, rejects unknown',()=>{
  assert.deepEqual(packageQuantity({unit:'g',unit_quantity:400}),{unit:'kg',amount:0.4});
  assert.deepEqual(packageQuantity({unit:'ml',unit_quantity:750}),{unit:'l',amount:0.75});
  assert.equal(packageQuantity({unit:'g',unit_quantity:0}),null);
});
