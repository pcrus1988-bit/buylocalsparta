import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ResendEmailProvider, ResendWebhookVerifier, renderKontaMoyEmail, signedKontaMoyText } from "../src/index.ts";
import type { Notification } from "@buy-local-sparta/core";

const notification:Notification={id:"ntf-1",userId:"user-1",channel:"email",purpose:"transactional",eventType:"order.confirmed",templateVersion:"v1",locale:"el",title:"Η παραγγελία σου",body:"Επιβεβαιώθηκε",payload:{orderId:"ord-1"},status:"queued",deliveryAttempts:0,createdAt:1};

test("sends transactional email with branded html, signed fallback and provider idempotency",async()=>{
  let request:{url:string;init?:RequestInit}|undefined;
  const provider=new ResendEmailProvider({apiKey:"re_test",from:"Buy Local Sparta <hello@example.gr>",baseUrl:"https://api.resend.test",timeoutMs:1000},async(url,init)=>{request={url:String(url),init};return new Response(JSON.stringify({id:"email-123"}),{status:200,headers:{"content-type":"application/json"}});});
  const result=await provider.send({notification,destination:"customer@example.com",idempotencyKey:"ntf-1"});
  assert.equal(result.providerMessageId,"email-123");
  assert.equal((request?.init?.headers as Record<string,string>)["idempotency-key"],"ntf-1");
  const body=JSON.parse(String(request?.init?.body));
  assert.equal(body.to[0],"customer@example.com");
  assert.match(body.text,/SP BUSINESS LAB – ΠΟΛΙΑΚΟΦ ΣΤΑΝΙΣΛΑΒ/);
  assert.match(body.text,/ΓΕΜΗ 193836403000/);
  assert.match(body.text,/στηρίζεις τις τοπικές επιχειρήσεις/);
  assert.match(body.html,/KONTA MOY · BUY LOCAL SPARTA/);
  assert.match(body.html,/Προβολή παραγγελίας/);
  assert.match(body.html,/στηρίζεις τις τοπικές επιχειρήσεις/);
});

test("renderer escapes content, keeps one legal signature and omits customer thank-you for vendors",()=>{
  const customer={subject:"Δοκιμή",text:"Γεια σου\n\n<script>alert(1)</script>\n\nKONTA MOY · Buy Local Sparta",eventType:"order.payment_confirmed",locale:"el",payload:{orderId:"ord-1"}};
  const html=renderKontaMoyEmail(customer,{publicBaseUrl:"https://kontamou.site"});
  const text=signedKontaMoyText(customer,{publicBaseUrl:"https://kontamou.site"});
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.equal((text.match(/SP BUSINESS LAB – ΠΟΛΙΑΚΟΦ ΣΤΑΝΙΣΛΑΒ/g)||[]).length,1);
  assert.equal((text.match(/KONTA MOY · Buy Local Sparta/g)||[]).length,1);
  assert.match(text,/Σε ευχαριστούμε που, χρησιμοποιώντας το KONTA MOY, στηρίζεις τις τοπικές επιχειρήσεις\. ❤️/);
  const vendor=signedKontaMoyText({subject:"SLA",text:"Απαιτείται ενέργεια",eventType:"vendor.sla_breached",payload:{orderId:"ord-1"}},{publicBaseUrl:"https://kontamou.site"});
  assert.doesNotMatch(vendor,/στηρίζεις τις τοπικές επιχειρήσεις/);
  assert.match(vendor,/Άνοιγμα Vendor Daily: https:\/\/kontamou\.site\/daily/);
});

test("verifies signed Resend/Svix webhook payload and timestamp",()=>{
  const secretBytes=Buffer.from("super-secret-key-material");const secret=`whsec_${secretBytes.toString("base64")}`;const payload=JSON.stringify({type:"email.delivered",created_at:"2026-08-17T08:00:00.000Z",data:{email_id:"email-123"}});const id="evt-1",timestamp=String(Math.floor(Date.parse("2026-08-17T08:00:00Z")/1000));const signature=`v1,${createHmac("sha256",secretBytes).update(`${id}.${timestamp}.${payload}`).digest("base64")}`;
  const event=new ResendWebhookVerifier(secret).verify({payload,id,timestamp,signature,now:Date.parse("2026-08-17T08:00:30Z")});
  assert.equal(event.type,"email.delivered");assert.equal(event.emailId,"email-123");assert.equal(event.id,"evt-1");
  assert.throws(()=>new ResendWebhookVerifier(secret).verify({payload,id,timestamp,signature:"v1,bad",now:Date.parse("2026-08-17T08:00:30Z")}));
});

test("Resend readiness checks the configured From domain without sending email",async()=>{
  const calls:string[]=[];
  const provider=new ResendEmailProvider({apiKey:"re_test",from:"Buy Local Sparta <orders@notify.example.gr>",baseUrl:"https://api.resend.test",timeoutMs:1000},async(url)=>{calls.push(String(url));return new Response(JSON.stringify({object:"list",data:[{name:"example.gr",status:"verified",capabilities:{sending:"enabled",receiving:"disabled"}}]}),{status:200,headers:{"content-type":"application/json"}});});
  const result=await provider.readiness();
  assert.equal(result.ok,true);assert.equal(result.fromDomain,"notify.example.gr");assert.deepEqual(calls,["https://api.resend.test/domains?limit=100"]);
});
