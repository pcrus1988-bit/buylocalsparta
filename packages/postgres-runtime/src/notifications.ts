import { createHmac, randomUUID } from "node:crypto";
import { NotificationDeliveryWorker, PostgresUnitOfWork, type Notification, type NotificationDeliveryAttemptSink, type NotificationDeliveryStore, type NotificationDestination, type NotificationProvider, type NotificationRecipientResolver, type SqlExecutor, type SqlPool, type SqlRow } from "@buy-local-sparta/core";
import { ResendEmailProvider, ResendWebhookVerifier, type ResendConfig, type ResendWebhookEvent } from "@buy-local-sparta/resend-notifications";
import { PostgresEmailTemplateRegistry } from "./email-templates.ts";
export { PostgresEmailTemplateRegistry };
export type { EmailTemplateCatalogItem } from "./email-templates.ts";

function text(v:unknown,label:string){if(typeof v!=="string"||!v)throw new Error(`Invalid ${label}`);return v;}
function optional(v:unknown){return typeof v==="string"&&v? v:undefined;}

export class PostgresNotificationRecipientResolver implements NotificationRecipientResolver {
  readonly #uow:PostgresUnitOfWork;readonly #suppressionSecret:string;
  constructor(db:SqlPool,suppressionSecret:string){if(suppressionSecret.length<32)throw new Error("Notification suppression secret must be at least 32 characters");this.#uow=new PostgresUnitOfWork(db);this.#suppressionSecret=suppressionSecret;}
  async resolve(notification:Notification):Promise<NotificationDestination|undefined>{
    if(notification.channel!=="email")return undefined;
    return this.#uow.withTransaction({platformAccess:true,requestId:`notification-resolve:${notification.id}`},async tx=>{
      let email:string|undefined;
      if(notification.userId){const result=await tx.query<SqlRow>("SELECT email::text AS email FROM users WHERE (public_id=$1 OR id::text=$1) AND status='active' AND email_verified_at IS NOT NULL",[notification.userId]);email=optional(result.rows[0]?.email);}
      else if(notification.vendorId){const result=await tx.query<SqlRow>(`SELECT u.email::text AS email FROM vendor_businesses vb JOIN vendor_users vu ON vu.vendor_id=vb.id AND vu.active JOIN vendor_user_roles vur ON vur.vendor_user_id=vu.id AND vur.role='vendor_owner' JOIN users u ON u.id=vu.user_id WHERE (vb.public_id=$1 OR vb.id::text=$1) AND u.status='active' AND u.email_verified_at IS NOT NULL ORDER BY vu.created_at LIMIT 1`,[notification.vendorId]);email=optional(result.rows[0]?.email);}
      if(!email)return undefined;const hash=this.hashDestination(email);const suppressed=await tx.query<SqlRow>("SELECT 1 FROM notification_destination_suppressions WHERE channel='email' AND destination_hash=$1 AND active=true LIMIT 1",[hash]);if(suppressed.rowCount)return undefined;return{channel:"email",value:email};
    },{readOnly:true});
  }
  hashDestination(email:string){return createHmac("sha256",this.#suppressionSecret).update(email.trim().toLowerCase()).digest("hex");}
}

class TemplateAwareResendProvider implements NotificationProvider {
  readonly channel="email" as const;
  readonly name="resend";
  readonly #provider:ResendEmailProvider;
  readonly #templates:PostgresEmailTemplateRegistry;
  constructor(provider:ResendEmailProvider,templates:PostgresEmailTemplateRegistry){this.#provider=provider;this.#templates=templates;}
  async send(input:{notification:Notification;destination:string;idempotencyKey:string}){
    let notification=input.notification;
    try { notification=await this.#templates.resolveForSend(input.notification); }
    catch(error){
      console.error(JSON.stringify({level:"error",event:"notification_template.resolve_failed",eventType:input.notification.eventType,message:error instanceof Error?error.message:String(error)}));
    }
    return this.#provider.send({...input,notification});
  }
}

export class PostgresResendNotificationService {
  readonly #uow:PostgresUnitOfWork;readonly #resolver:PostgresNotificationRecipientResolver;readonly #verifier?:ResendWebhookVerifier;readonly worker:NotificationDeliveryWorker;
  constructor(input:{db:SqlPool;store:NotificationDeliveryStore;attemptSink:NotificationDeliveryAttemptSink;config:ResendConfig;suppressionSecret:string;workerId?:string;fetchImpl?:typeof fetch}){
    this.#uow=new PostgresUnitOfWork(input.db);this.#resolver=new PostgresNotificationRecipientResolver(input.db,input.suppressionSecret);this.#verifier=input.config.webhookSecret?new ResendWebhookVerifier(input.config.webhookSecret):undefined;
    const provider=new TemplateAwareResendProvider(new ResendEmailProvider(input.config,input.fetchImpl),new PostgresEmailTemplateRegistry(input.db));
    this.worker=new NotificationDeliveryWorker({service:input.store,resolver:this.#resolver,providers:[provider],attemptSink:input.attemptSink,workerId:input.workerId,maxAttempts:5,baseRetryMs:5_000,leaseMs:30_000});
  }
  async runOnce(now=Date.now(),limit=50){return this.worker.runOnce(now,limit);}
  verifyWebhook(input:{payload:string;id:string|undefined;timestamp:string|undefined;signature:string|undefined;now?:number}){if(!this.#verifier)throw new Error("RESEND_WEBHOOK_SECRET is required to verify Resend webhooks");return this.#verifier.verify(input);}
  async processWebhook(event:ResendWebhookEvent,now=Date.now()):Promise<{duplicate:boolean;suppressed:boolean}> {
    return this.#uow.withTransaction({platformAccess:true,requestId:`resend-webhook:${event.id}`},async tx=>{
      const details=safeDetails(event);const inserted=await tx.query<SqlRow>(`INSERT INTO notification_provider_events(id,provider,event_id,event_type,provider_message_id,event_created_at,details,received_at) VALUES($1,'resend',$2,$3,$4,$5,$6,$7) ON CONFLICT(provider,event_id) DO NOTHING RETURNING id::text AS id`,[randomUUID(),event.id,event.type,event.emailId??null,new Date(event.createdAt),details,new Date(now)]);if(!inserted.rowCount)return{duplicate:true,suppressed:false};
      let suppressed=false;if(event.emailId&&["email.bounced","email.complained"].includes(event.type)){const target=await this.#destinationForProviderMessage(tx,event.emailId);if(target){await tx.query(`INSERT INTO notification_destination_suppressions(id,channel,destination_hash,provider,reason,source_event_id,active,created_at,updated_at) VALUES($1,'email',$2,'resend',$3,$4,true,$5,$5) ON CONFLICT(channel,destination_hash) DO UPDATE SET provider='resend',reason=EXCLUDED.reason,source_event_id=EXCLUDED.source_event_id,active=true,updated_at=EXCLUDED.updated_at`,[randomUUID(),this.#resolver.hashDestination(target),event.type,event.id,new Date(now)]);suppressed=true;}}
      if(event.emailId&&["email.bounced","email.complained","email.failed"].includes(event.type)){await tx.query(`UPDATE notifications SET status='failed',failed_at=$2,last_delivery_error=$3,delivery_lease_owner=NULL,delivery_lease_until=NULL WHERE provider_message_id=$1 AND channel='email' AND status IN ('sending','sent')`,[event.emailId,new Date(now),event.type]);}
      return{duplicate:false,suppressed};
    });
  }
  async #destinationForProviderMessage(tx:SqlExecutor,providerMessageId:string):Promise<string|undefined>{const row=await tx.query<SqlRow>(`SELECT u.email::text AS user_email,(SELECT u2.email::text FROM vendor_users vu JOIN vendor_user_roles vur ON vur.vendor_user_id=vu.id AND vur.role='vendor_owner' JOIN users u2 ON u2.id=vu.user_id WHERE vu.vendor_id=n.vendor_id AND vu.active AND u2.status='active' AND u2.email_verified_at IS NOT NULL ORDER BY vu.created_at LIMIT 1) AS vendor_email FROM notifications n LEFT JOIN users u ON u.id=n.user_id WHERE n.provider_message_id=$1 LIMIT 1`,[providerMessageId]);return optional(row.rows[0]?.user_email)??optional(row.rows[0]?.vendor_email);}
}

function safeDetails(event:ResendWebhookEvent):Record<string,unknown>{const data=event.data;const result:Record<string,unknown>={};if(event.type==="email.bounced"&&data.bounce&&typeof data.bounce==="object"){const b=data.bounce as Record<string,unknown>;for(const key of ["type","subType","message"]){if(typeof b[key]==="string")result[key]=b[key];}}if(event.type==="email.failed"&&data.failed&&typeof data.failed==="object"){const f=data.failed as Record<string,unknown>;if(typeof f.reason==="string")result.reason=f.reason;}return result;}
