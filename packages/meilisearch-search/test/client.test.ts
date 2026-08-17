import test from "node:test";
import assert from "node:assert/strict";
import { MeilisearchClient } from "../src/index.ts";

function response(status:number, body:unknown){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});}

test("configures index, waits tasks and indexes canonical documents", async()=>{
  const calls:Array<{url:string;init?:RequestInit}>=[];
  const queue=[response(404,{}),response(202,{taskUid:1,status:"enqueued"}),response(200,{uid:1,status:"succeeded"}),response(202,{taskUid:2,status:"enqueued"}),response(200,{uid:2,status:"succeeded"}),response(202,{taskUid:3,status:"enqueued"}),response(200,{uid:3,status:"succeeded"})];
  const fetchMock:typeof fetch=async(url,init)=>{calls.push({url:String(url),init});const next=queue.shift();if(!next)throw new Error("unexpected request");return next;};
  const client=new MeilisearchClient({host:"https://search.test",indexUid:"products",adminApiKey:"secret",searchApiKey:"search",timeoutMs:1000,taskTimeoutMs:1000,taskPollMs:1},fetchMock);
  await client.configureIndex();
  await client.upsert({id:"cv-1",type:"product",marketId:"sparta",title:"Παπούτσι",titleEl:"Παπούτσι",titleEn:"Shoe",available:true,priceMinor:9900,categoryCodes:["fashion"],attributes:{colour:"red|burgundy"}});
  assert.equal(calls[0].url,"https://search.test/indexes/products");
  const indexed=JSON.parse(String(calls[5].init?.body));
  assert.deepEqual(indexed[0].attributePairs,["colour:red","colour:burgundy"]);
  assert.match(String((calls[5].init?.headers as Record<string,string>).authorization),/Bearer secret/);
});

test("builds safe filters and maps search hits",async()=>{
  let captured:Record<string,unknown>|undefined;
  const fetchMock:typeof fetch=async(_url,init)=>{captured=JSON.parse(String(init?.body));return response(200,{hits:[{id:"cv-1",type:"product",marketId:"sparta",title:"Lamp",available:true,priceMinor:1200,categoryCodes:["home"],attributes:{colour:"red"}}]});};
  const client=new MeilisearchClient({host:"https://search.test",indexUid:"products",adminApiKey:"admin",searchApiKey:"search",timeoutMs:1000,taskTimeoutMs:1000,taskPollMs:1},fetchMock);
  const hits=await client.search({marketId:"sparta",q:"lamp",availability:"in_stock",categoryCode:"home",attributeFilters:{colour:["red","blue"]},minPriceMinor:100,sort:"price-asc"});
  assert.equal(hits.length,1);assert.equal(hits[0].document.id,"cv-1");
  assert.equal(captured?.sort instanceof Array,true);
  assert.match(String(captured?.filter),/marketId = "sparta"/);
  assert.match(String(captured?.filter),/attributePairs = "colour:red"/);
});
