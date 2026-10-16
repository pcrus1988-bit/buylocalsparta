import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeReferenceBasket} from './basket-optimizer.mjs';

const date='2026-10-15';
const products=[
  {source_product_id:'rice',snapshot_date:date,name:'Ρύζι 1 kg',brand:'R'},
  {source_product_id:'milk',snapshot_date:date,name:'Γάλα 1 L',brand:'M'},
  {source_product_id:'chopped-a',snapshot_date:date,name:'Ντομάτα ψιλοκομμένη 400 g',brand:'A',unit:'g',unit_quantity:400},
  {source_product_id:'chopped-b',snapshot_date:date,name:'Ντομάτα ψιλοκομμένη 500 g',brand:'B',unit:'g',unit_quantity:500},
  {source_product_id:'passata',snapshot_date:date,name:'Passata 500 g',brand:'C',unit:'g',unit_quantity:500}
];
const price=(id,retailerId,eur,more={})=>({
  source_product_id:id,snapshot_date:date,country:'GR',retailer_id:retailerId,
  retailer_name:retailerId,price_eur:eur,...more
});
const observations=[
  price('rice','alpha',2.40),price('rice','beta',1.80),price('rice','gamma',2.00),
  price('milk','alpha',1.00),price('milk','beta',1.60),
  price('chopped-a','alpha',0.90),price('chopped-a','beta',1.20),price('chopped-a','gamma',0.95),
  price('chopped-b','alpha',1.00),price('chopped-b','beta',0.95),price('chopped-b','gamma',1.10),
  price('passata','alpha',0.40)
];
const group={id:'chopped',status:'approved',basis:'kg',memberIds:['chopped-a','chopped-b']};
const lines=[
  {id:'a',kind:'exact',sourceProductId:'rice',packageCount:1},
  {id:'b',kind:'exact',sourceProductId:'milk',packageCount:2},
  {id:'c',kind:'group',groupId:'chopped',requiredBaseQuantity:0.8}
];
const run=(changes={})=>optimizeReferenceBasket({lines,products,observations,approvedGroups:[group],snapshotDate:date,...changes});

test('returns the cheapest complete one-store and two-store plans, not just the cheapest single item',()=>{
  const result=run();
  assert.equal(result.allItemsHavePrices,true);
  assert.equal(result.bestSingleStore.totalEur,6.2);
  assert.deepEqual(result.bestSingleStore.stores.map(s=>s.id),['alpha']);
  assert.equal(result.bestUpToTwoStores.totalEur,5.6);
  assert.equal(result.cheapestAcrossAnyStores.totalEur,5.6);
  assert.equal(result.cheapestWithinStoreLimit.storeCount,2);
  assert.equal(result.savingsVsCheapestCompleteSingleStoreEur,0.6);
  assert.equal(result.bestSingleStore.items.length,3);
});

test('all SKU prices are computed for the REQUIRED quantity, rounding up to whole packages',()=>{
  const result=run();
  const tomato=result.bestSingleStore.items.find(x=>x.lineId==='c');
  assert.equal(tomato.sourceProductId,'chopped-a');
  assert.equal(tomato.packages,2);
  assert.equal(tomato.requestedBaseQuantity,0.8);
  assert.equal(tomato.suppliedBaseQuantity,0.8);
  assert.equal(tomato.lineTotalEur,1.8);
  const variant=run({lines:[{id:'tomato',kind:'group',groupId:'chopped',requiredBaseQuantity:0.45}]});
  assert.equal(variant.cheapestAcrossAnyStores.items[0].sourceProductId,'chopped-b');
  assert.equal(variant.cheapestAcrossAnyStores.items[0].packages,1);
});

test('user can lock a chosen brand and choose a retailer without substitutions',()=>{
  const result=run({retailerIds:['beta'],lines:[
    {id:'tom',kind:'group',groupId:'chopped',requiredBaseQuantity:0.8,lockedProductId:'chopped-a'}
  ]});
  assert.equal(result.bestSingleStore.items[0].sourceProductId,'chopped-a');
  assert.equal(result.bestSingleStore.items[0].retailerId,'beta');
  assert.equal(result.bestSingleStore.items[0].lineTotalEur,2.4);
});

test('do not substitute unrelated passata even when much cheaper',()=>{
  const result=run({lines:[{id:'tom',kind:'group',groupId:'chopped',requiredBaseQuantity:0.8}]});
  assert.ok(result.bestPerLine[0].chosen.sourceProductId!=='passata');
  assert.throws(()=>run({lines:[{id:'bad',kind:'group',groupId:'chopped',requiredBaseQuantity:0.8,lockedProductId:'passata'}]}),/not in the approved group/);
  assert.throws(()=>run({approvedGroups:[{...group,status:'suggested'}]}),/approved/);
});

test('if no single supermarket covers all items, a multi-supermarket total can still be complete',()=>{
  const result=run({observations:[price('rice','alpha',2),price('milk','beta',1)],
    lines:[{id:'r',kind:'exact',sourceProductId:'rice',packageCount:1},{id:'m',kind:'exact',sourceProductId:'milk',packageCount:1}]});
  assert.equal(result.bestSingleStore,null);
  assert.equal(result.singleStoreCandidates.length,2);
  assert.ok(result.singleStoreCandidates.every(x=>x.totalEur===null && !x.complete && x.missingItems.length===1));
  assert.equal(result.cheapestAcrossAnyStores.totalEur,3);
  assert.equal(result.cheapestWithinStoreLimit.totalEur,3);
  assert.equal(result.savingsVsCheapestCompleteSingleStoreEur,null);
});

test('unavailable products NEVER count as zero-cost completed items',()=>{
  const result=run({lines:[...lines,{id:'missing',kind:'exact',sourceProductId:'unlisted',packageCount:1}]});
  assert.equal(result.allItemsHavePrices,false);
  assert.equal(result.bestSingleStore,null);
  assert.equal(result.cheapestAcrossAnyStores,null);
  assert.equal(result.cheapestWithinStoreLimit,null);
  assert.equal(result.missingItems[0].lineId,'missing');
  assert.equal(result.bestPerLine.find(x=>x.lineId==='missing').chosen,null);
});

test('a one-store limit is honored and cheapest unrestricted result remains visibly distinct',()=>{
  const result=run({storeLimit:1});
  assert.equal(result.cheapestWithinStoreLimit.totalEur,6.2);
  assert.equal(result.bestUpToTwoStores,null);
  assert.equal(result.cheapestAcrossAnyStores.totalEur,5.6);
});

test('three-store absolute minimum can differ from best two-store tradeoff',()=>{
  const goods=['one','two','three'].map(id=>({source_product_id:id,name:id,snapshot_date:date}));
  const observations=[
    price('one','a',1),price('one','b',5),price('one','c',5),
    price('two','a',5),price('two','b',1),price('two','c',5),
    price('three','a',5),price('three','b',5),price('three','c',1)
  ];
  const basket=goods.map(g=>({id:g.source_product_id,kind:'exact',sourceProductId:g.source_product_id,packageCount:1}));
  const result=run({products:goods,observations,lines:basket,storeLimit:2});
  assert.equal(result.bestSingleStore.totalEur,11);
  assert.equal(result.bestUpToTwoStores.totalEur,7);
  assert.equal(result.cheapestWithinStoreLimit.totalEur,7);
  assert.equal(result.cheapestAcrossAnyStores.totalEur,3);
  assert.equal(result.savingsVsCheapestCompleteSingleStoreEur,8);
});

test('rejects cross-country, stale and zero-price observations',()=>{
  const result=run({observations:[
    price('rice','alpha',2),
    price('rice','beta',0),
    price('rice','gamma',0.01,{country:'CY'}),
    price('rice','delta',0.01,{snapshot_date:'2026-10-14'})
  ],lines:[{id:'r',kind:'exact',sourceProductId:'rice',packageCount:1}]});
  assert.equal(result.cheapestAcrossAnyStores.totalEur,2);
  assert.deepEqual(result.includedRetailerIds,['alpha']);
});

test('rejects duplicate retailer-product prices, invalid lines and incompatible units',()=>{
  assert.throws(()=>run({observations:[...observations,price('rice','alpha',1.01)]}),/Duplicate/);
  assert.throws(()=>run({lines:[lines[0],lines[0]]}),/uniquely identified/);
  assert.throws(()=>run({lines:[{...lines[0],packageCount:0}]}),/packageCount/);
  assert.throws(()=>run({lines:[{...lines[2],requiredBaseQuantity:-1}]}),/base-unit/);
  const x=run({products:products.map(p=>p.source_product_id==='chopped-a'?{...p,unit:'l'}:p),
    lines:[{id:'tom',kind:'group',groupId:'chopped',requiredBaseQuantity:0.8}]});
  assert.ok(x.cheapestAcrossAnyStores);
  assert.equal(x.cheapestAcrossAnyStores.items[0].sourceProductId,'chopped-b');
});


test('retailer selections are hard locks per list line, including approved alternatives',()=>{
  const locked=run({lines:[
    {id:'rice',kind:'exact',sourceProductId:'rice',packageCount:1,lockedRetailerId:'alpha'},
    {id:'tom',kind:'group',groupId:'chopped',requiredBaseQuantity:0.8,lockedRetailerId:'beta'}
  ]});
  assert.equal(locked.cheapestAcrossAnyStores.items.find(i=>i.lineId==='rice').retailerId,'alpha');
  assert.equal(locked.cheapestAcrossAnyStores.items.find(i=>i.lineId==='tom').retailerId,'beta');
  assert.equal(locked.cheapestAcrossAnyStores.storeCount,2);
  assert.equal(locked.bestSingleStore,null);
  const onlyWrongRetailer=run({lines:[
    {id:'rice',kind:'exact',sourceProductId:'rice',packageCount:1,lockedRetailerId:'does-not-exist'}
  ]});
  assert.equal(onlyWrongRetailer.cheapestAcrossAnyStores,null);
  assert.equal(onlyWrongRetailer.missingItems[0].lineId,'rice');
  assert.throws(()=>run({lines:[
    {id:'rice',kind:'exact',sourceProductId:'rice',packageCount:1,lockedRetailerId:'INVALID SPACE'}
  ]}),/lockedRetailerId/);
});

test('five-store split respects the global retailer whitelist and beats a four-store cap',()=>{
 const ids=['a','b','c','d','e','excluded'];
 const goods=['one','two','three','four','five'].map(x=>({source_product_id:x,name:x,snapshot_date:date}));
 const obs=goods.flatMap((g,i)=>ids.map((id,j)=>price(g.source_product_id,id,id==='excluded'?0.01:i===j?1:10)));
 const b=goods.map(p=>({id:p.source_product_id,kind:'exact',sourceProductId:p.source_product_id,packageCount:1}));
 const five=run({products:goods,observations:obs,lines:b,storeLimit:5,retailerIds:ids.slice(0,5)});
 assert.equal(five.cheapestWithinStoreLimit.storeCount,5);
 assert.equal(five.cheapestWithinStoreLimit.totalEur,5);
 assert.deepEqual(five.includedRetailerIds,['a','b','c','d','e']);
 const four=run({products:goods,observations:obs,lines:b,storeLimit:4,retailerIds:ids.slice(0,5)});
 assert.equal(four.cheapestWithinStoreLimit.totalEur,14);
 const filtered=run({products:goods,observations:obs,lines:b,storeLimit:5,retailerIds:['a','b','c']});
 assert.ok(filtered.cheapestWithinStoreLimit.totalEur>five.cheapestWithinStoreLimit.totalEur);
 assert.throws(()=>run({storeLimit:6}),/1–5/);
});
