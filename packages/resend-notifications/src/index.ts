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
      const response=await this.#fetch(`${this.#config.baseUrl.replace(/\/$/,"")}/emails`,{method:"POST",headers:{authorization:`Bearer ${this.#config.apiKey}`,"content-type":"application/json","idempotency-key":input.idempotencyKey},body:JSON.stringify({from:this.#config.from,to:[input.destination],subject:input.notification.title,text:input.notification.body,...(this.#config.replyTo?{reply_to:this.#config.replyTo}:{})}),signal:controller.signal});
      const body=await response.json().catch(()=>({})) as {id?:unknown;message?:unknown};
      if(!response.ok||typeof body.id!=="string")throw new Error(`Resend send failed (${response.status}): ${typeof body.message==="string"?body.message:"unexpected response"}`);
      return{providerMessageId:body.id};
    }finally{clearTimeout(timer);}
  }
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

export function resendConfigFromEnv(env:NodeJS.ProcessEnv=process.env):ResendConfig{const apiKey=required(env.RESEND_API_KEY,"RESEND_API_KEY"),from=required(env.RESEND_FROM,"RESEND_FROM");return{apiKey,from,replyTo:env.RESEND_REPLY_TO?.trim()||undefined,baseUrl:env.RESEND_BASE_URL?.trim()||"https://api.resend.com",timeoutMs:positive(env.RESEND_TIMEOUT_MS,8_000,"RESEND_TIMEOUT_MS"),webhookSecret:env.RESEND_WEBHOOK_SECRET?.trim()||undefined};}
function required(v:string|undefined,n:string){const x=v?.trim();if(!x)throw new Error(`${n} is required`);return x;}function positive(raw:string|undefined,fallback:number,name:string){if(!raw?.trim())return fallback;const n=Number(raw);if(!Number.isSafeInteger(n)||n<=0)throw new Error(`${name} must be a positive integer`);return n;}
