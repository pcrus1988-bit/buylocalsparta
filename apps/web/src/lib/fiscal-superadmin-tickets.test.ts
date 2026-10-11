import assert from "node:assert/strict";
import {test} from "node:test";
import {issueFiscalSsoTicket,parseFiscalSsoTicket} from "./fiscal-superadmin-tickets.ts";

const previousOrigin=process.env.FISCAL_SERVICE_BASE_URL;
const previousSecret=process.env.FISCAL_SUPERADMIN_SSO_SECRET;
const origin="https://fiscal.kontamou.site";
const secret="CI-ONLY-NOT-A-PRODUCTION-SIGNING-SECRET-0123456789abcdef0123456789abcdef";
const identity={userId:"super_admin_ci_12345",email:"synthetic-super-admin@example.test"};
function setup(){
 process.env.FISCAL_SERVICE_BASE_URL=origin+"/";
 process.env.FISCAL_SUPERADMIN_SSO_SECRET=secret;
}
function restore(){
 if(previousOrigin===undefined)delete process.env.FISCAL_SERVICE_BASE_URL;
 else process.env.FISCAL_SERVICE_BASE_URL=previousOrigin;
 if(previousSecret===undefined)delete process.env.FISCAL_SUPERADMIN_SSO_SECRET;
 else process.env.FISCAL_SUPERADMIN_SSO_SECRET=previousSecret;
}
test("one-minute, signed FISCAL admin ticket with exact first-party audience",t=>{
 setup();try{
  const issued=issueFiscalSsoTicket(identity);
  assert.equal(issued.targetUrl,origin+"/timologio-admin/sso/callback");
  assert.match(issued.ticket,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  const parsed=parseFiscalSsoTicket(issued.ticket,origin);
  assert.equal(parsed.userId,identity.userId);
  assert.equal(parsed.email,identity.email);
  assert.equal(parsed.aud,origin);
  assert.equal(parsed.scope,"fiscal:superadmin");
  assert.equal(parsed.exp-parsed.iat,60_000);
  assert.notEqual(issueFiscalSsoTicket(identity).ticket,issued.ticket,"Every handoff needs a unique JTI");
 }finally{restore();}
});
test("falsified assertion is rejected before identity parsing",()=>{
 setup();try{
  const signed=issueFiscalSsoTicket(identity).ticket;
  const [payload,mac]=signed.split(".");
  const modified=(payload[0]==="A"?"B":"A")+payload.slice(1);
  assert.throws(()=>parseFiscalSsoTicket(modified+"."+mac,origin),/FISCAL_SSO_SIGNATURE_INVALID/);
  assert.throws(()=>parseFiscalSsoTicket("invalid.ticket",origin),/FISCAL_SSO_SIGNATURE_INVALID/);
 }finally{restore();}
});
test("browser callback origin and configured audience must exactly agree",()=>{
 setup();try{
  const signed=issueFiscalSsoTicket(identity).ticket;
  assert.throws(()=>parseFiscalSsoTicket(signed,"https://evil.example"),/FISCAL_SSO_TICKET_EXPIRED_OR_WRONG_AUDIENCE/);
  assert.throws(()=>parseFiscalSsoTicket(signed,"https://konta-moy-fiscal.vercel.app"),/FISCAL_SSO_TICKET_EXPIRED_OR_WRONG_AUDIENCE/);
  process.env.FISCAL_SERVICE_BASE_URL="https://other.kontamou.site/";
  assert.throws(()=>parseFiscalSsoTicket(signed,origin),/FISCAL_SSO_TICKET_EXPIRED_OR_WRONG_AUDIENCE/);
 }finally{restore();}
});
test("expired and future-dated tickets are rejected",t=>{
 setup();try{
  const at=1_800_000_000_000;
  t.mock.method(Date,"now",()=>at);
  const signed=issueFiscalSsoTicket(identity).ticket;
  t.mock.restoreAll();
  t.mock.method(Date,"now",()=>at+60_001);
  assert.throws(()=>parseFiscalSsoTicket(signed,origin),/FISCAL_SSO_TICKET_EXPIRED_OR_WRONG_AUDIENCE/);
  t.mock.restoreAll();
  t.mock.method(Date,"now",()=>at-6_001);
  assert.throws(()=>parseFiscalSsoTicket(signed,origin),/FISCAL_SSO_TICKET_EXPIRED_OR_WRONG_AUDIENCE/);
 }finally{restore();}
});
test("insufficient SSO secret and malformed marketplace identities fail closed",()=>{
 setup();try{
  assert.throws(()=>issueFiscalSsoTicket({userId:"x",email:"admin@example.test"}),/FISCAL_SSO_IDENTITY_INVALID/);
  assert.throws(()=>issueFiscalSsoTicket({userId:"valid_admin_123",email:"no-at-sign"}),/FISCAL_SSO_IDENTITY_INVALID/);
  process.env.FISCAL_SUPERADMIN_SSO_SECRET="not-long-enough";
  assert.throws(()=>issueFiscalSsoTicket(identity),/FISCAL_SSO_SECRET_REQUIRED/);
 }finally{restore();}
});
