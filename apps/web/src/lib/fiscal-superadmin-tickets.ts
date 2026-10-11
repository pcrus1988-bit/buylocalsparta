/** Signed single-use FISCAL admin assertions; cryptography is kept independently testable. */
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
const safeEqual=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const ticketTtlMs=60*1000;
function secret():Buffer {
  const value=process.env.FISCAL_SUPERADMIN_SSO_SECRET?.trim();
  if(!value||value.length<48)throw new Error("FISCAL_SSO_SECRET_REQUIRED");
  return Buffer.from(value,"utf8");
}
function target():URL {
  const configured=process.env.FISCAL_SERVICE_BASE_URL?.trim();
  if(!configured)throw new Error("FISCAL_SERVICE_BASE_URL_REQUIRED");
  const url=new URL(configured);
  if(url.protocol!=="https:"||url.username||url.password||url.hash||url.search||url.pathname!=="/")
    throw new Error("FISCAL_SSO_TARGET_MUST_BE_HTTPS_ORIGIN");
  return url;
}
type Ticket=Readonly<{v:1;aud:string;iss:string;userId:string;email:string;iat:number;exp:number;jti:string;scope:"fiscal:superadmin"}>;
const sign=(encoded:string)=>createHmac("sha256",secret()).update("km-fiscal-sso-v1:"+encoded).digest("base64url");

export function issueFiscalSsoTicket(input:{userId:string;email:string}):{ticket:string;targetUrl:string} {
  const now=Date.now(),destination=target();
  const ticket:Ticket={
    v:1, aud:destination.origin,iss:"konta-moy-marketplace",
    userId:input.userId,email:input.email,iat:now,exp:now+ticketTtlMs,
    jti:randomBytes(32).toString("base64url"),scope:"fiscal:superadmin"
  };
  if(!/^[A-Za-z0-9_-]{5,160}$/.test(ticket.userId)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ticket.email))
    throw new Error("FISCAL_SSO_IDENTITY_INVALID");
  const encoded=Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return {ticket:encoded+"."+sign(encoded),targetUrl:new URL("/timologio-admin/sso/callback",destination).toString()};
}
export function parseFiscalSsoTicket(source:string,requestOrigin:string):Ticket {
  if(typeof source!=="string"||source.length>2500)throw new Error("FISCAL_SSO_TICKET_INVALID");
  const [encoded,supplied,...extra]=source.split(".");
  if(!encoded||!supplied||extra.length||!safeEqual(sign(encoded),supplied))
    throw new Error("FISCAL_SSO_SIGNATURE_INVALID");
  let token:Ticket;
  try{token=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as Ticket;}
  catch{throw new Error("FISCAL_SSO_TICKET_INVALID");}
  const now=Date.now();
  if(token.v!==1||token.scope!=="fiscal:superadmin"||token.iss!=="konta-moy-marketplace"||
     token.aud!==target().origin||token.aud!==requestOrigin||
     !Number.isSafeInteger(token.iat)||!Number.isSafeInteger(token.exp)||
     token.iat>now+5000||token.exp<=now||token.exp-token.iat>ticketTtlMs||
     !/^[A-Za-z0-9_-]{43}$/.test(token.jti)||
     !/^[A-Za-z0-9_-]{5,160}$/.test(token.userId)||
     typeof token.email!=="string"||token.email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(token.email))
    throw new Error("FISCAL_SSO_TICKET_EXPIRED_OR_WRONG_AUDIENCE");
  return token;
}
