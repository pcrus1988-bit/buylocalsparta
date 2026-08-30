import { createHmac, timingSafeEqual } from "node:crypto";
import type { NotificationProvider, Notification } from "@buy-local-sparta/core";

export type ResendConfig = Readonly<{
  apiKey: string;
  from: string;
  replyTo?: string;
  baseUrl: string;
  timeoutMs: number;
  webhookSecret?: string;
}>;

export type KontaMoyEmailInput = Readonly<{
  subject: string;
  text: string;
  eventType: string;
  locale?: string;
  payload?: Readonly<Record<string, unknown>>;
}>;

export const KONTA_MOY_EMAIL_COMPANY = Object.freeze({
  brand: "KONTA MOY",
  descriptor: "Buy Local Sparta",
  legalName: "SP BUSINESS LAB – ΠΟΛΙΑΚΟΦ ΣΤΑΝΙΣΛΑΒ",
  taxNumber: "182294894",
  gemiNumber: "193836403000",
  gemiStatus: "Ενεργή",
  gemiAuthority: "ΕΠΑΓΓΕΛΜΑΤΙΚΟ ΕΠΙΜΕΛΗΤΗΡΙΟ ΑΘΗΝΑΣ",
  address: "Αστυπαλαίας 32, 11256 Αθήνα",
  email: "info@kontamou.site",
  phone: "6936999686",
  website: "https://kontamou.site",
  representative: "Πολιάκοφ Στανισλάβ"
});

const CUSTOMER_LOCAL_SUPPORT_LINE = "Σε ευχαριστούμε που, χρησιμοποιώντας το KONTA MOY, στηρίζεις τις τοπικές επιχειρήσεις. ❤️";

export class ResendEmailProvider implements NotificationProvider {
  readonly channel = "email" as const;
  readonly name = "resend";
  readonly #config: ResendConfig;
  readonly #fetch: typeof fetch;
  constructor(config: ResendConfig, fetchImpl: typeof fetch = fetch) { this.#config=config;this.#fetch=fetchImpl; }

  async readiness(): Promise<{ ok: boolean; fromDomain: string; domainStatus?: string; sending?: string; message: string }> {
    const fromDomain=extractFromDomain(this.#config.from);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.#config.timeoutMs);
    try{
      const response=await this.#fetch(`${this.#config.baseUrl.replace(/\/$/,"")}/domains?limit=100`,{headers:{authorization:`Bearer ${this.#config.apiKey}`},signal:controller.signal});
      const payload=await response.json().catch(()=>({})) as {data?:unknown;message?:unknown};
      if(!response.ok) return{ok:false,fromDomain,message:`Resend domain check failed (${response.status}): ${typeof payload.message==="string"?payload.message:"unexpected response"}`};
      const domains=Array.isArray(payload.data)?payload.data:[];
      const match=domains.find((entry)=>{if(!entry||typeof entry!=="object")return false;const name=(entry as {name?:unknown}).name;return typeof name==="string"&&(fromDomain===name.toLowerCase()||fromDomain.endsWith(`.${name.toLowerCase()}`));}) as {status?:unknown;capabilities?:unknown}|undefined;
      if(!match)return{ok:false,fromDomain,message:`Resend sending domain ${fromDomain} is not present in this account`};
      const domainStatus=typeof match.status==="string"?match.status:undefined;
      const capabilities=match.capabilities&&typeof match.capabilities==="object"?match.capabilities as {sending?:unknown}:{};
      const sending=typeof capabilities.sending==="string"?capabilities.sending:undefined;
      const ok=(domainStatus==="verified"||domainStatus==="partially_verified"||domainStatus==="partially_failed")&&sending==="enabled";
      return{ok,fromDomain,domainStatus,sending,message:ok?"Resend sending domain is verified and enabled":`Resend domain is not ready (status=${domainStatus??"unknown"}, sending=${sending??"unknown"})`};
    }finally{clearTimeout(timer);}
  }

  async send(input: { notification: Notification; destination: string; idempotencyKey: string }): Promise<{ providerMessageId: string }> {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.#config.timeoutMs);
    try{
      const emailInput: KontaMoyEmailInput = {
        subject: input.notification.title,
        text: input.notification.body,
        eventType: input.notification.eventType,
        locale: input.notification.locale,
        payload: input.notification.payload
      };
      const publicBaseUrl=publicBaseUrlFromEnv();
      const response=await this.#fetch(`${this.#config.baseUrl.replace(/\/$/,"")}/emails`,{method:"POST",headers:{authorization:`Bearer ${this.#config.apiKey}`,"content-type":"application/json","idempotency-key":input.idempotencyKey},body:JSON.stringify({from:this.#config.from,to:[input.destination],subject:input.notification.title,text:signedKontaMoyText(emailInput,{publicBaseUrl}),html:renderKontaMoyEmail(emailInput,{publicBaseUrl}),...(this.#config.replyTo?{reply_to:this.#config.replyTo}:{})}),signal:controller.signal});
      const body=await response.json().catch(()=>({})) as {id?:unknown;message?:unknown};
      if(!response.ok||typeof body.id!=="string")throw new Error(`Resend send failed (${response.status}): ${typeof body.message==="string"?body.message:"unexpected response"}`);
      return{providerMessageId:body.id};
    }finally{clearTimeout(timer);}
  }
}

export function renderKontaMoyEmail(input: KontaMoyEmailInput, config: { publicBaseUrl?: string } = {}): string {
  const publicBaseUrl=(config.publicBaseUrl?.trim()||"https://kontamou.site").replace(/\/$/,"");
  const body=stripShortSignature(input.text);
  const recipient=recipientKind(input.eventType);
  const tone=emailTone(input.eventType);
  const cta=resolveCta(input,publicBaseUrl);
  const paragraphs=body.split(/\n{2,}/).filter(Boolean).map((paragraph)=>`<p style="font-size:16px;line-height:1.65;margin:0 0 18px;white-space:pre-line;">${escapeHtml(paragraph)}</p>`).join("");
  const preheader=escapeHtml(stringPayload(input.payload,"preheader")||body.split("\n").find(Boolean)||input.subject);
  const customerThanks=recipient==="customer"?`<div style="margin-top:26px;padding-top:22px;border-top:1px solid #d6cfbf;font-size:15px;line-height:1.6;font-weight:700;color:#405149;">${escapeHtml(CUSTOMER_LOCAL_SUPPORT_LINE)}</div>`:"";
  return `<!doctype html><html lang="${escapeHtml(input.locale||"el")}"><body style="margin:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#183027"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f0e8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fffdf8;border:1px solid #d6cfbf;border-radius:24px;overflow:hidden"><tr><td style="background:#183027;padding:30px 34px;color:#fffdf8"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><div style="width:46px;height:46px;border:1px solid #f4f0e8;border-radius:50%;line-height:46px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.12em">KM</div></td><td style="text-align:right;font-size:11px;letter-spacing:.14em;font-weight:700;color:#d8d8c7">KONTA MOY · BUY LOCAL SPARTA</td></tr></table><div style="margin-top:26px;font-size:11px;letter-spacing:.14em;color:${tone.accent};font-weight:800">${escapeHtml(tone.label)}</div><h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:34px;line-height:1.08;margin:10px 0 0;color:#fffdf8">${escapeHtml(input.subject)}</h1></td></tr><tr><td style="padding:34px">${paragraphs}<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:8px"><tr><td style="border-radius:999px;background:#183027"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 22px;color:#fffdf8;text-decoration:none;font-size:14px;font-weight:800">${escapeHtml(cta.label)} →</a></td></tr></table>${customerThanks}</td></tr><tr><td style="background:#101f18;padding:26px 34px;color:#d9e1dc;font-size:11px;line-height:1.7"><div style="font-size:12px;font-weight:800;color:#fffdf8;letter-spacing:.07em;margin-bottom:7px">KONTA MOY · BUY LOCAL SPARTA</div><strong style="color:#fffdf8">${escapeHtml(KONTA_MOY_EMAIL_COMPANY.legalName)}</strong><br>ΑΦΜ ${escapeHtml(KONTA_MOY_EMAIL_COMPANY.taxNumber)} · ΓΕΜΗ ${escapeHtml(KONTA_MOY_EMAIL_COMPANY.gemiNumber)} (${escapeHtml(KONTA_MOY_EMAIL_COMPANY.gemiStatus)})<br>Αρμόδιο Επιμελητήριο: ${escapeHtml(KONTA_MOY_EMAIL_COMPANY.gemiAuthority)}<br>Έδρα: ${escapeHtml(KONTA_MOY_EMAIL_COMPANY.address)} · Νόμιμος εκπρόσωπος: ${escapeHtml(KONTA_MOY_EMAIL_COMPANY.representative)}<br><a href="tel:+306936999686" style="color:#fffdf8">693 699 9686</a> · <a href="mailto:${escapeHtml(KONTA_MOY_EMAIL_COMPANY.email)}" style="color:#fffdf8">${escapeHtml(KONTA_MOY_EMAIL_COMPANY.email)}</a> · <a href="${escapeHtml(KONTA_MOY_EMAIL_COMPANY.website)}" style="color:#fffdf8">www.kontamou.site</a></td></tr></table></td></tr></table></body></html>`;
}

export function signedKontaMoyText(input: KontaMoyEmailInput, config: { publicBaseUrl?: string } = {}): string {
  const publicBaseUrl=(config.publicBaseUrl?.trim()||"https://kontamou.site").replace(/\/$/,"");
  const body=stripShortSignature(input.text);
  const cta=resolveCta(input,publicBaseUrl);
  const customerThanks=recipientKind(input.eventType)==="customer"?`\n\n${CUSTOMER_LOCAL_SUPPORT_LINE}`:"";
  const ctaLine=body.includes(cta.url)?"":`\n\n${cta.label}: ${cta.url}`;
  return `${body}${ctaLine}${customerThanks}\n\n—\n${KONTA_MOY_EMAIL_COMPANY.brand} · ${KONTA_MOY_EMAIL_COMPANY.descriptor}\n${KONTA_MOY_EMAIL_COMPANY.legalName}\nΑΦΜ ${KONTA_MOY_EMAIL_COMPANY.taxNumber} · ΓΕΜΗ ${KONTA_MOY_EMAIL_COMPANY.gemiNumber} (${KONTA_MOY_EMAIL_COMPANY.gemiStatus})\nΑρμόδιο Επιμελητήριο: ${KONTA_MOY_EMAIL_COMPANY.gemiAuthority}\nΈδρα: ${KONTA_MOY_EMAIL_COMPANY.address}\nΝόμιμος εκπρόσωπος: ${KONTA_MOY_EMAIL_COMPANY.representative}\nΤηλ.: ${KONTA_MOY_EMAIL_COMPANY.phone}\nEmail: ${KONTA_MOY_EMAIL_COMPANY.email}\nWebsite: ${KONTA_MOY_EMAIL_COMPANY.website}`;
}

function recipientKind(eventType:string):"customer"|"vendor"|"internal"{
  if(/^vendor\./.test(eventType)||/agreement/.test(eventType))return"vendor";
  if(/^(admin\.|ops\.|email\.inbound)/.test(eventType))return"internal";
  return"customer";
}

function emailTone(eventType:string):{label:string;accent:string}{
  if(/^(admin\.|ops\.)/.test(eventType))return{label:"OPERATIONS",accent:"#b29661"};
  if(/(tax|fiscal|refund|agreement)/.test(eventType))return{label:"ΕΠΙΣΗΜΗ ΕΝΗΜΕΡΩΣΗ",accent:"#b29661"};
  if(/^vendor\./.test(eventType))return{label:"VENDOR WORKSPACE",accent:"#c7c9a8"};
  if(/(password|verification|security)/.test(eventType))return{label:"ΑΣΦΑΛΕΙΑ ΛΟΓΑΡΙΑΣΜΟΥ",accent:"#c7c9a8"};
  return{label:"KONTA MOY",accent:"#e0a58f"};
}

function resolveCta(input:KontaMoyEmailInput,publicBaseUrl:string):{label:string;url:string}{
  const explicitUrl=stringPayload(input.payload,"ctaUrl");
  const explicitPath=stringPayload(input.payload,"ctaPath");
  const explicitLabel=stringPayload(input.payload,"ctaLabel");
  if(explicitUrl||explicitPath)return{label:explicitLabel||"Άνοιγμα",url:absoluteUrl(publicBaseUrl,explicitUrl||explicitPath!)};
  const bodyUrl=firstUrl(input.text);
  if(bodyUrl&&/activation|verification|password|setup/.test(input.eventType))return{label:activationCtaLabel(input.eventType),url:bodyUrl};
  const orderId=stringPayload(input.payload,"orderId");
  if(orderId&&recipientKind(input.eventType)==="customer")return{label:"Προβολή παραγγελίας",url:`${publicBaseUrl}/account/orders/${encodeURIComponent(orderId)}`};
  if(/^vendor\.(sla|order)/.test(input.eventType))return{label:"Άνοιγμα Vendor Daily",url:`${publicBaseUrl}/daily`};
  if(/^vendor\./.test(input.eventType))return{label:"Άνοιγμα Vendor Workspace",url:`${publicBaseUrl}/vendor`};
  if(/^admin\./.test(input.eventType))return{label:"Άνοιγμα Admin",url:`${publicBaseUrl}/admin`};
  if(/ask[_-]local/.test(input.eventType))return{label:"Προβολή Ask Local",url:`${publicBaseUrl}/account`};
  if(/return\.|refund\.|shipping\.|tax|order\./.test(input.eventType))return{label:"Άνοιγμα λογαριασμού",url:`${publicBaseUrl}/account`};
  return{label:"Άνοιγμα KONTA MOY",url:publicBaseUrl};
}

function activationCtaLabel(eventType:string):string{
  if(/password|setup|activation/.test(eventType))return"Ολοκλήρωση πρόσβασης";
  if(/verification/.test(eventType))return"Επιβεβαίωση email";
  return"Άνοιγμα KONTA MOY";
}

function stripShortSignature(value:string):string{
  return String(value??"").replace(/\n*\s*KONTA MOY\s*[·|—-]\s*Buy Local Sparta\s*$/iu,"").trim();
}

function stringPayload(payload:Readonly<Record<string,unknown>>|undefined,key:string):string|undefined{
  const value=payload?.[key];return typeof value==="string"&&value.trim()?value.trim():undefined;
}

function firstUrl(value:string):string|undefined{
  const match=value.match(/https?:\/\/[^\s<>]+/i);return match?.[0]?.replace(/[),.;]+$/,"");
}

function absoluteUrl(base:string,value:string):string{
  if(/^(https?:\/\/|mailto:|tel:)/i.test(value))return value;
  return `${base.replace(/\/$/,"")}/${value.replace(/^\//,"")}`;
}

function escapeHtml(value:unknown):string{
  return String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]??char));
}

function publicBaseUrlFromEnv(env:NodeJS.ProcessEnv=process.env):string{
  const explicit=env.BLS_PUBLIC_BASE_URL?.trim()||env.NEXT_PUBLIC_SITE_URL?.trim();
  if(explicit)return explicit.replace(/\/$/,"");
  const production=env.VERCEL_PROJECT_PRODUCTION_URL?.trim()||env.VERCEL_URL?.trim();
  return production?`https://${production.replace(/^https?:\/\//,"").replace(/\/$/,"")}`:"https://kontamou.site";
}

export type ResendWebhookEvent = Readonly<{ id:string; type:string; createdAt:number; emailId?:string; data:Readonly<Record<string,unknown>> }>;
export class ResendWebhookVerifier {
  readonly #secret:string;readonly #toleranceSeconds:number;
  constructor(secret:string,toleranceSeconds=300){if(!secret.startsWith("whsec_"))throw new Error("Resend webhook secret must start with whsec_");this.#secret=secret;this.#toleranceSeconds=toleranceSeconds;}
  verify(input:{payload:string;id:string|undefined;timestamp:string|undefined;signature:string|undefined;now?:number}):ResendWebhookEvent{
    const id=required(input.id,"svix-id"),timestamp=required(input.timestamp,"svix-timestamp"),signature=required(input.signature,"svix-signature");const ts=Number(timestamp);if(!Number.isSafeInteger(ts))throw new Error("Invalid Resend webhook timestamp");const now=Math.floor((input.now??Date.now())/1000);if(Math.abs(now-ts)>this.#toleranceSeconds)throw new Error("Resend webhook timestamp is outside tolerance");
    const key=Buffer.from(this.#secret.slice("whsec_".length),"base64");const expected=createHmac("sha256",key).update(`${id}.${timestamp}.${input.payload}`).digest();const candidates=signature.split(" ").flatMap((part)=>{const [version,value]=part.split(",",2);if(version!=="v1"||!value)return[];try{return[Buffer.from(value,"base64")]}catch{return[];}});if(!candidates.some((candidate)=>candidate.length===expected.length&&timingSafeEqual(candidate,expected)))throw new Error("Invalid Resend webhook signature");
    const parsed=JSON.parse(input.payload) as Record<string,unknown>;const type=typeof parsed.type==="string"?parsed.type:"";const created=typeof parsed.created_at==="string"?Date.parse(parsed.created_at):NaN;const data=parsed.data&&typeof parsed.data==="object"&&!Array.isArray(parsed.data)?parsed.data as Record<string,unknown>:{};if(!type||!Number.isFinite(created))throw new Error("Invalid Resend webhook payload");return{id,type,createdAt:created,emailId:typeof data.email_id==="string"?data.email_id:undefined,data};
  }
}

function extractFromDomain(from:string):string{const match=from.match(/<([^<>]+)>\s*$/);const address=(match?.[1]??from).trim().toLowerCase();const at=address.lastIndexOf("@");if(at<=0||at===address.length-1)throw new Error("RESEND_FROM must contain a valid email address");return address.slice(at+1);}

export function resendDeliveryEnabled(env:NodeJS.ProcessEnv=process.env):boolean{const flag=env.BLS_EMAIL_DELIVERY_ENABLED?.trim().toLowerCase();if(flag==="false")return false;if(flag==="true")return true;return Boolean(env.RESEND_API_KEY?.trim());}

export function resendConfigFromEnv(env:NodeJS.ProcessEnv=process.env):ResendConfig{
  const apiKey=required(env.RESEND_API_KEY,"RESEND_API_KEY");
  const domain=env.BLS_EMAIL_DOMAIN?.trim()||"kontamou.site";
  const configuredFrom=env.RESEND_FROM?.trim()||`notifications@${domain}`;
  const configuredAddressMatch=configuredFrom.match(/<([^<>]+)>\s*$/);
  const configuredAddress=(configuredAddressMatch?.[1]??configuredFrom).trim();
  const from=`ΚΟΝΤΑ ΜΟΥ <${configuredAddress}>`;
  const replyTo=env.RESEND_REPLY_TO?.trim()||`reply@${domain}`;
  return{apiKey,from,replyTo,baseUrl:env.RESEND_BASE_URL?.trim()||"https://api.resend.com",timeoutMs:positive(env.RESEND_TIMEOUT_MS,8_000,"RESEND_TIMEOUT_MS"),webhookSecret:env.RESEND_WEBHOOK_SECRET?.trim()||undefined};
}
function required(v:string|undefined,n:string){const x=v?.trim();if(!x)throw new Error(`${n} is required`);return x;}function positive(raw:string|undefined,fallback:number,name:string){if(!raw?.trim())return fallback;const n=Number(raw);if(!Number.isSafeInteger(n)||n<=0)throw new Error(`${name} must be a positive integer`);return n;}
