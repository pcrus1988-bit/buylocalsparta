import test from "node:test";
import assert from "node:assert/strict";
import { AadeMyDataClient, myDataConfigFromEnv, parseTransmissionResponse } from "../src/index.ts";

const cfg={environment:"production" as const,baseUrl:"https://mydatapi.aade.gr/myDATA",userId:"erp-user",subscriptionKey:"secret",requestTimeoutMs:1000,specVersion:"2.0.2"};

test("AADE client sends ERP identification headers and XML",async()=>{let request:Request|undefined;const client=new AadeMyDataClient(cfg,async(input,init)=>{request=new Request(input,init);return new Response(`<ResponseDoc><response><index>1</index><statusCode>Success</statusCode><invoiceUid>uid-1</invoiceUid><invoiceMark>1234567890123</invoiceMark><qrUrl>https://qr.example/x</qrUrl></response></ResponseDoc>`,{status:200});});const r=await client.sendInvoices(`<InvoicesDoc><invoice/></InvoicesDoc>`);assert.equal(request?.headers.get("aade-user-id"),"erp-user");assert.equal(request?.headers.get("ocp-apim-subscription-key"),"secret");assert.equal(request?.headers.get("content-type"),"application/xml; charset=utf-8");assert.equal(r.ok,true);assert.equal(r.items[0]?.invoiceMark,"1234567890123");assert.equal(r.items[0]?.qrUrl,"https://qr.example/x");});

test("AADE parser preserves structured rejection errors",()=>{const r=parseTransmissionResponse(`<ResponseDoc><response><index>1</index><statusCode>ValidationError</statusCode><errors><error><code>101</code><message>Invalid invoice</message></error></errors></response></ResponseDoc>`);assert.equal(r.ok,false);assert.deepEqual(r.items[0]?.errors,[{code:"101",message:"Invalid invoice"}]);});

test("production configuration defaults to AADE v2.0.2 endpoint",()=>{const config=myDataConfigFromEnv({AADE_MYDATA_ENVIRONMENT:"production",AADE_MYDATA_USER_ID:"u",AADE_MYDATA_SUBSCRIPTION_KEY:"k"} as NodeJS.ProcessEnv);assert.equal(config.baseUrl,"https://mydatapi.aade.gr/myDATA");assert.equal(config.specVersion,"2.0.2");});

test("test configuration defaults to current AADE development endpoint",()=>{const config=myDataConfigFromEnv({AADE_MYDATA_ENVIRONMENT:"test",AADE_MYDATA_USER_ID:"u",AADE_MYDATA_SUBSCRIPTION_KEY:"k"} as NodeJS.ProcessEnv);assert.equal(config.baseUrl,"https://mydataapidev.aade.gr");assert.equal(config.specVersion,"2.0.2");});

test("RequestTransmittedDocs requires MARK cursor and AADE date format",async()=>{let url="";const client=new AadeMyDataClient(cfg,async(input)=>{url=String(input);return new Response(`<RequestedDoc/>`,{status:200});});await client.requestTransmittedDocs({mark:"0",dateFrom:"19/08/2026",dateTo:"19/08/2026"});assert.match(url,/RequestTransmittedDocs\?mark=0/);assert.match(url,/dateFrom=19%2F08%2F2026/);assert.throws(()=>client.requestTransmittedDocs({mark:"x"}),/MARK cursor/);assert.throws(()=>client.requestTransmittedDocs({mark:"0",dateFrom:"2026-08-19"}),/dd\/MM\/yyyy/);});

test("CancelInvoice sends MARK in query",async()=>{let url="";const client=new AadeMyDataClient(cfg,async(input)=>{url=String(input);return new Response(`<ResponseDoc><response><statusCode>Success</statusCode><cancellationMark>987654</cancellationMark></response></ResponseDoc>`,{status:200});});const r=await client.cancelInvoice("123456");assert.match(url,/CancelInvoice\?mark=123456/);assert.equal(r.items[0]?.cancellationMark,"987654");});
