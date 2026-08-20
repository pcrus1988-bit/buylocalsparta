import test from "node:test";
import assert from "node:assert/strict";
import { AadeMyDataClient, MyDataPreflightError } from "../src/public.ts";

const cfg={environment:"production" as const,baseUrl:"https://mydatapi.aade.gr/myDATA",userId:"erp-user",subscriptionKey:"secret",requestTimeoutMs:1000,specVersion:"2.0.2"};

const validXml=`<InvoicesDoc><invoice><invoiceHeader><series>KMR26</series><aa>1</aa><issueDate>2026-08-20</issueDate><invoiceType>11.1</invoiceType></invoiceHeader><paymentMethods><paymentMethodDetails><type>7</type><amount>1.00</amount></paymentMethodDetails></paymentMethods><invoiceDetails><lineNumber>1</lineNumber><netValue>0.81</netValue><vatCategory>1</vatCategory><vatAmount>0.19</vatAmount></invoiceDetails><invoiceSummary><totalNetValue>0.81</totalNetValue><totalVatAmount>0.19</totalVatAmount><totalGrossValue>1.00</totalGrossValue></invoiceSummary></invoice></InvoicesDoc>`;

test("package entrypoint blocks invalid invoice XML before network transmission",async()=>{
  let calls=0;
  const client=new AadeMyDataClient(cfg,async()=>{calls+=1;return new Response(`<ResponseDoc/>`,{status:200});});
  await assert.rejects(client.sendInvoices(`<InvoicesDoc><invoice/></InvoicesDoc>`),MyDataPreflightError);
  assert.equal(calls,0);
});

test("package entrypoint transmits XML after successful preflight",async()=>{
  let calls=0;
  const client=new AadeMyDataClient(cfg,async()=>{calls+=1;return new Response(`<ResponseDoc><response><statusCode>Success</statusCode><invoiceMark>123</invoiceMark></response></ResponseDoc>`,{status:200});});
  const result=await client.sendInvoices(validXml);
  assert.equal(calls,1);
  assert.equal(result.ok,true);
  assert.equal(result.items[0]?.invoiceMark,"123");
});
