import test from "node:test";
import assert from "node:assert/strict";
import { AadeMyDataClient, myDataConfigFromEnv, parseTransmissionResponse } from "../src/index.ts";

const cfg={environment:"production" as const,baseUrl:"https://mydatapi.aade.gr/myDATA",userId:"erp-user",subscriptionKey:"secret",requestTimeoutMs:1000,specVersion:"2.0.1"};

test("AADE client sends ERP identification headers and XML",async()=>{let request:Request|undefined;const client=new AadeMyDataClient(cfg,async(input,init)=>{request=new Request(input,init);return new Response(`<ResponseDoc><response><index>1</index><statusCode>Success</statusCode><invoiceUid>uid-1</invoiceUid><invoiceMark>1234567890123</invoiceMark><qrUrl>https://qr.example/x</qrUrl></response></ResponseDoc>`,{status:200});});const r=await client.sendInvoices(`<InvoicesDoc><invoice/></InvoicesDoc>`);assert.equal(request?.headers.get("aade-user-id"),"erp-user");assert.equal(request?.headers.get("ocp-apim-subscription-key"),"secret");assert.equal(request?.headers.get("content-type"),"application/xml; charset=utf-8");assert.equal(r.ok,true);assert.equal(r.items[0]?.invoiceMark,"1234567890123");assert.equal(r.items[0]?.qrUrl,"https://qr.example/x");});

test("AADE parser preserves structured rejection errors",()=>{const r=parseTransmissionResponse(`<ResponseDoc><response><index>1</index><statusCode>ValidationError</statusCode><errors><error><code>101</code><message>Invalid invoice</message></error></errors></response></ResponseDoc>`);assert.equal(r.ok,false);assert.deepEqual(r.items[0]?.errors,[{code:"101",message:"Invalid invoice"}]);});

test("test environment requires explicit AADE base URL",()=>{assert.throws(()=>myDataConfigFromEnv({AADE_MYDATA_ENVIRONMENT:"test",AADE_MYDATA_USER_ID:"u",AADE_MYDATA_SUBSCRIPTION_KEY:"k"} as NodeJS.ProcessEnv),/BASE_URL/);});

test("CancelInvoice sends MARK in query",async()=>{let url="";const client=new AadeMyDataClient(cfg,async(input)=>{url=String(input);return new Response(`<ResponseDoc><response><statusCode>Success</statusCode><cancellationMark>987654</cancellationMark></response></ResponseDoc>`,{status:200});});const r=await client.cancelInvoice("123456");assert.match(url,/CancelInvoice\?mark=123456/);assert.equal(r.items[0]?.cancellationMark,"987654");});

test("RequestMyIncome uses AADE required date range without creating fiscal data",async()=>{let request:Request|undefined;const client=new AadeMyDataClient(cfg,async(input,init)=>{request=new Request(input,init);return new Response(`<RequestedBookInfo/>`,{status:200});});await client.requestMyIncome({dateFrom:"19/08/2026",dateTo:"19/08/2026"});assert.equal(request?.method,"GET");assert.match(request?.url??"",/RequestMyIncome\?dateFrom=19%2F08%2F2026&dateTo=19%2F08%2F2026/);});

test("RequestMyIncome rejects wrong or impossible date formats before network I/O",async()=>{let calls=0;const client=new AadeMyDataClient(cfg,async()=>{calls+=1;return new Response(`<RequestedBookInfo/>`,{status:200});});await assert.rejects(()=>client.requestMyIncome({dateFrom:"2026-08-19",dateTo:"19/08/2026"}),/dd\/MM\/yyyy/);await assert.rejects(()=>client.requestMyIncome({dateFrom:"31/02/2026",dateTo:"31/02/2026"}),/valid calendar date/);assert.equal(calls,0);});

test("RequestTransmittedDocs requires and validates the mandatory AADE MARK",async()=>{let url="";const client=new AadeMyDataClient(cfg,async(input)=>{url=String(input);return new Response(`<RequestedDoc/>`,{status:200});});await client.requestTransmittedDocs({mark:"123456"});assert.match(url,/RequestTransmittedDocs\?mark=123456/);await assert.rejects(()=>client.requestTransmittedDocs({mark:"not-a-mark"}),/AADE MARK must be numeric/);});

test("AADE HTTP error summaries redact the subscription key if an upstream response echoes it",async()=>{const client=new AadeMyDataClient(cfg,async()=>new Response(`<error>credential secret rejected</error>`,{status:401}));await assert.rejects(()=>client.requestMyIncome({dateFrom:"19/08/2026",dateTo:"19/08/2026"}),(error:unknown)=>error instanceof Error&&error.message.includes("[REDACTED]")&&!error.message.includes("secret"));});
