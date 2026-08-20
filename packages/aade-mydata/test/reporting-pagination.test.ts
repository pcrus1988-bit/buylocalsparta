import assert from "node:assert/strict";
import test from "node:test";
import { AadeMyDataClient } from "../src/public.ts";

const cfg={environment:"production" as const,baseUrl:"https://mydatapi.aade.gr/myDATA",userId:"erp-user",subscriptionKey:"secret",requestTimeoutMs:1000,specVersion:"2.0.2"};

function vatPage(mark:string,continuation?:{partition:string;row:string}){
  return `<RequestedVatInfo><VatInfo><Mark>${mark}</Mark><IsCancelled>false</IsCancelled><IssueDate>2026-08-20</IssueDate><VatAmount>1.00</VatAmount></VatInfo>${continuation?`<continuationToken><nextPartitionKey>${continuation.partition}</nextPartitionKey><nextRowKey>${continuation.row}</nextRowKey></continuationToken>`:""}</RequestedVatInfo>`;
}

function e3Page(mark:string,continuation?:{partition:string;row:string}){
  return `<RequestedE3Info><E3Info><V_Afm>123456789</V_Afm><V_Mark>${mark}</V_Mark><IssueDate>2026-08-20</IssueDate><V_Class_Category>category1_1</V_Class_Category><V_Class_Type>E3_561_003</V_Class_Type><V_Class_Value>1.00</V_Class_Value></E3Info>${continuation?`<continuationToken><nextPartitionKey>${continuation.partition}</nextPartitionKey><nextRowKey>${continuation.row}</nextRowKey></continuationToken>`:""}</RequestedE3Info>`;
}

test("RequestVatInfoAll follows AADE continuation tokens until complete",async()=>{
  const urls:string[]=[];
  const client=new AadeMyDataClient(cfg,async input=>{
    const url=String(input);urls.push(url);
    return new Response(url.includes("nextPartitionKey=p1")?vatPage("2"):vatPage("1",{partition:"p1",row:"r1"}),{status:200});
  });
  const result=await client.requestVatInfoAll({dateFrom:"01/08/2026",dateTo:"20/08/2026"});
  assert.equal(result.complete,true);
  assert.equal(result.pages,2);
  assert.deepEqual(result.records.map(record=>record.mark),["1","2"]);
  assert.match(urls[1]??"",/nextPartitionKey=p1/);
  assert.match(urls[1]??"",/nextRowKey=r1/);
});

test("RequestE3InfoAll returns incomplete rather than pretending a capped collection is complete",async()=>{
  const client=new AadeMyDataClient(cfg,async()=>new Response(e3Page("1",{partition:"p1",row:"r1"}),{status:200}));
  const result=await client.requestE3InfoAll({dateFrom:"01/08/2026",dateTo:"20/08/2026"},{maxPages:1});
  assert.equal(result.complete,false);
  assert.equal(result.pages,1);
  assert.equal(result.records.length,1);
  assert.equal(result.continuation?.nextPartitionKey,"p1");
});

test("reporting collectors stop on repeated continuation tokens",async()=>{
  const client=new AadeMyDataClient(cfg,async()=>new Response(vatPage("1",{partition:"same",row:"same"}),{status:200}));
  await assert.rejects(
    client.requestVatInfoAll({dateFrom:"01/08/2026",dateTo:"20/08/2026"},{maxPages:3}),
    /repeated a continuation token/
  );
});

test("reporting page cap is bounded",async()=>{
  const client=new AadeMyDataClient(cfg,async()=>new Response(`<RequestedInfo/>`,{status:200}));
  await assert.rejects(client.requestVatInfoAll({dateFrom:"01/08/2026",dateTo:"20/08/2026"},{maxPages:0}),/between 1 and 100/);
  await assert.rejects(client.requestE3InfoAll({dateFrom:"01/08/2026",dateTo:"20/08/2026"},{maxPages:101}),/between 1 and 100/);
});
