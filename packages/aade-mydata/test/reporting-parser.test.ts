import test from "node:test";
import assert from "node:assert/strict";
import { AadeMyDataClient, parseE3InfoResponse, parseVatInfoResponse } from "../src/public.ts";

const cfg={environment:"production" as const,baseUrl:"https://mydatapi.aade.gr/myDATA",userId:"erp-user",subscriptionKey:"secret",requestTimeoutMs:1000,specVersion:"2.0.2"};

const vatXml=`<RequestedVatInfo xmlns="https://www.aade.gr/myDATA/vatInfo/v1.0"><continuationToken><nextPartitionKey>p2</nextPartitionKey><nextRowKey>r2</nextRowKey></continuationToken><VatInfo><Mark>123</Mark><IsCancelled>false</IsCancelled><IssueDate>2026-08-20</IssueDate><Vat301>10.25</Vat301><Vat361>2.46</Vat361><FutureVatField>1.11</FutureVatField></VatInfo><VatInfo><Mark>124</Mark><IsCancelled>true</IsCancelled><IssueDate>2026-08-20</IssueDate><Vat301>5.00</Vat301></VatInfo></RequestedVatInfo>`;
const e3Xml=`<RequestedE3Info xmlns="https://www.aade.gr/myDATA/e3Info/v1.0"><continuationToken><nextPartitionKey>ep</nextPartitionKey><nextRowKey>er</nextRowKey></continuationToken><E3Info><V_Afm>123456789</V_Afm><V_Mark>987</V_Mark><IssueDate>2026-08-20</IssueDate><V_Class_Category>category1_1</V_Class_Category><V_Class_Type>E3_561_003</V_Class_Type><V_Class_Value>81.50</V_Class_Value><FutureE3Field>x</FutureE3Field></E3Info></RequestedE3Info>`;

test("VAT parser preserves known, numeric and future AADE fields",()=>{
  const parsed=parseVatInfoResponse(vatXml);
  assert.equal(parsed.records.length,2);
  assert.deepEqual(parsed.continuation,{nextPartitionKey:"p2",nextRowKey:"r2"});
  assert.equal(parsed.records[0]?.mark,"123");
  assert.equal(parsed.records[0]?.cancelled,false);
  assert.equal(parsed.records[0]?.amounts.Vat301,10.25);
  assert.equal(parsed.records[0]?.amounts.Vat361,2.46);
  assert.equal(parsed.records[0]?.amounts.FutureVatField,1.11);
  assert.equal(parsed.records[1]?.cancelled,true);
});

test("E3 parser exposes classification identity and preserves future fields",()=>{
  const parsed=parseE3InfoResponse(e3Xml);
  assert.equal(parsed.records.length,1);
  assert.deepEqual(parsed.continuation,{nextPartitionKey:"ep",nextRowKey:"er"});
  assert.deepEqual({
    vatNumber:parsed.records[0]?.vatNumber,
    mark:parsed.records[0]?.mark,
    issueDate:parsed.records[0]?.issueDate,
    category:parsed.records[0]?.classificationCategory,
    type:parsed.records[0]?.classificationType,
    value:parsed.records[0]?.classificationValue
  },{vatNumber:"123456789",mark:"987",issueDate:"2026-08-20",category:"category1_1",type:"E3_561_003",value:81.5});
  assert.equal(parsed.records[0]?.fields.FutureE3Field,"x");
});

test("typed client reporting helpers parse responses without a second network call",async()=>{
  let calls=0;
  const client=new AadeMyDataClient(cfg,async input=>{calls+=1;const url=String(input);return new Response(url.includes("RequestVatInfo")?vatXml:e3Xml,{status:200});});
  const vat=await client.requestVatInfoParsed({dateFrom:"20/08/2026",dateTo:"20/08/2026"});
  const e3=await client.requestE3InfoParsed({dateFrom:"20/08/2026",dateTo:"20/08/2026"});
  assert.equal(calls,2);
  assert.equal(vat.records[0]?.mark,"123");
  assert.equal(e3.records[0]?.classificationType,"E3_561_003");
});

test("reporting parsers tolerate missing continuation tokens and empty result sets",()=>{
  assert.deepEqual(parseVatInfoResponse(`<RequestedVatInfo/>`).records,[]);
  assert.equal(parseVatInfoResponse(`<RequestedVatInfo/>`).continuation,undefined);
  assert.deepEqual(parseE3InfoResponse(`<RequestedE3Info/>`).records,[]);
});
