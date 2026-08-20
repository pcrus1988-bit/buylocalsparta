import test from "node:test";
import assert from "node:assert/strict";
import { AadeMyDataClient, PaymentMethodsPreflightError } from "../src/public.ts";

const cfg={environment:"production" as const,baseUrl:"https://mydatapi.aade.gr/myDATA",userId:"erp-user",subscriptionKey:"secret",requestTimeoutMs:1000,specVersion:"2.0.2"};

const paymentXml=`<PaymentMethodsDoc xmlns="https://www.aade.gr/myDATA/paymentMethod/v1.0" xmlns:inv="http://www.aade.gr/myDATA/invoice/v1.0"><paymentMethods><invoiceMark>123456789</invoiceMark><inv:paymentMethodDetails><inv:type>7</inv:type><inv:amount>1.00</inv:amount></inv:paymentMethodDetails></paymentMethods></PaymentMethodsDoc>`;

test("SendPaymentsMethod validates payload and sends it to the official endpoint",async()=>{
  let request:Request|undefined;
  const client=new AadeMyDataClient(cfg,async(input,init)=>{request=new Request(input,init);return new Response(`<ResponseDoc><response><statusCode>Success</statusCode><invoiceMark>123456789</invoiceMark></response></ResponseDoc>`,{status:200});});
  const result=await client.sendPaymentsMethod(paymentXml);
  assert.equal(result.ok,true);
  assert.match(String(request?.url),/\/SendPaymentsMethod$/);
  assert.equal(request?.headers.get("aade-user-id"),"erp-user");
  assert.equal(request?.headers.get("content-type"),"application/xml; charset=utf-8");
});

test("SendPaymentsMethod blocks payloads without POS before network transmission",async()=>{
  let calls=0;
  const client=new AadeMyDataClient(cfg,async()=>{calls+=1;return new Response(`<ResponseDoc/>`,{status:200});});
  const invalid=paymentXml.replace("<inv:type>7</inv:type>","<inv:type>6</inv:type>");
  await assert.rejects(client.sendPaymentsMethod(invalid),PaymentMethodsPreflightError);
  assert.equal(calls,0);
});

test("RequestVatInfo and RequestE3Info encode AADE 2.0.2 reporting parameters",async()=>{
  const urls:string[]=[];
  const client=new AadeMyDataClient(cfg,async(input)=>{urls.push(String(input));return new Response(`<RequestedInfo/>`,{status:200});});
  await client.requestVatInfo({dateFrom:"01/08/2026",dateTo:"20/08/2026",entityVatNumber:"123456789",groupedPerDay:true});
  await client.requestE3Info({dateFrom:"01/08/2026",dateTo:"20/08/2026",groupedPerDay:false,nextPartitionKey:"p",nextRowKey:"r"});
  assert.match(urls[0]??"",/RequestVatInfo\?/);
  assert.match(urls[0]??"",/dateFrom=01%2F08%2F2026/);
  assert.match(urls[0]??"",/GroupedPerDay=true/);
  assert.match(urls[1]??"",/RequestE3Info\?/);
  assert.match(urls[1]??"",/GroupedPerDay=false/);
  assert.match(urls[1]??"",/nextPartitionKey=p/);
});

test("reporting endpoints reject impossible or reversed date ranges",async()=>{
  const client=new AadeMyDataClient(cfg,async()=>new Response(`<RequestedInfo/>`,{status:200}));
  await assert.rejects(client.requestVatInfo({dateFrom:"30/02/2026",dateTo:"01/03/2026"}),/real calendar date/);
  await assert.rejects(client.requestE3Info({dateFrom:"20/08/2026",dateTo:"01/08/2026"}),/on or before/);
});

test("extended endpoint errors redact AADE credentials",async()=>{
  const client=new AadeMyDataClient(cfg,async()=>new Response(`aade-user-id=erp-user Ocp-Apim-Subscription-Key=secret`,{status:500}));
  await assert.rejects(client.requestVatInfo({dateFrom:"01/08/2026",dateTo:"20/08/2026"}),error=>{
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message,/erp-user|secret/);
    assert.match(error.message,/REDACTED/);
    return true;
  });
});
