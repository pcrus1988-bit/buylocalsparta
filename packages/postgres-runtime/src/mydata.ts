import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlPool, type SqlRow } from "@buy-local-sparta/core";
import { AadeMyDataClient, type MyDataTransmissionResult } from "@buy-local-sparta/aade-mydata";
import { platformScope } from "./admin-auth.ts";

export type MyDataDocumentProjection = Readonly<{
  id:string; orderId?:string; type:string; status:string; transmissionStatus:string; grossMinor:number; currency:string;
  mappingVersion?:string; invoiceTypeCode?:string; documentNumber?:string; aadeMark?:string; aadeUid?:string; qrUrl?:string; lastError?:string; createdAt:number;
}>;

export type MyDataConnectivityResult = Readonly<{
  ok:true; readOnly:true; operation:"RequestTransmittedDocs"; environment:string; specVersion:string; checkedAt:number; responseBytes:number;
}>;

export class PostgresMyDataService {
  readonly #uow:PostgresUnitOfWork;
  readonly #client:AadeMyDataClient;
  readonly #issuanceEnabled:boolean;
  readonly #deploymentMappingPin?:string;
  constructor(pool:SqlPool,input:{client:AadeMyDataClient;issuanceEnabled:boolean;approvedMappingVersion?:string}){
    this.#uow=new PostgresUnitOfWork(pool);
    this.#client=input.client;
    this.#issuanceEnabled=input.issuanceEnabled;
    this.#deploymentMappingPin=input.approvedMappingVersion?.trim()||undefined;
    if(this.#issuanceEnabled&&!this.#deploymentMappingPin)throw new Error("AADE myDATA issuance requires BLS_MYDATA_MAPPING_VERSION");
  }

  async workspace(principal:SessionPrincipal):Promise<{environment:string;specVersion:string;issuanceEnabled:boolean;approvedMappingVersion?:string;deploymentMappingPin?:string;documents:readonly MyDataDocumentProjection[]}>
  {
    const snapshot=await this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const [docs,approved]=await Promise.all([
        tx.query<SqlRow>(`SELECT td.public_id,o.public_id AS order_public_id,td.type,td.status,td.transmission_status,td.gross_minor,td.currency,td.mapping_version,td.invoice_type_code,td.document_number,td.aade_mark,td.aade_uid,td.aade_qr_url,td.last_error,td.created_at FROM tax_documents td LEFT JOIN customer_orders o ON o.id=td.order_id ORDER BY td.created_at DESC LIMIT 250`),
        tx.query<SqlRow>(`SELECT p.version FROM accounting_tax_policies p JOIN markets m ON m.id=p.market_id WHERE m.code=$1 AND p.status='approved' ORDER BY p.approved_at DESC LIMIT 1`,["sparta"])
      ]);
      return{
        documents:docs.rows.map(row=>({id:text(row.public_id),orderId:optional(row.order_public_id),type:text(row.type),status:text(row.status),transmissionStatus:text(row.transmission_status),grossMinor:int(row.gross_minor),currency:text(row.currency),mappingVersion:optional(row.mapping_version),invoiceTypeCode:optional(row.invoice_type_code),documentNumber:optional(row.document_number),aadeMark:optional(row.aade_mark),aadeUid:optional(row.aade_uid),qrUrl:optional(row.aade_qr_url),lastError:optional(row.last_error),createdAt:epoch(row.created_at)})),
        approvedMappingVersion:approved.rowCount?text(approved.rows[0].version):undefined
      };
    },{readOnly:true});
    return{environment:this.#client.environment,specVersion:this.#client.specVersion,issuanceEnabled:this.#issuanceEnabled,approvedMappingVersion:snapshot.approvedMappingVersion,deploymentMappingPin:this.#deploymentMappingPin,documents:snapshot.documents};
  }

  async connectivityCheck():Promise<MyDataConnectivityResult>{
    const checkedAt=Date.now();
    const today=aadeDate(new Date(checkedAt));
    const xml=await this.#client.requestTransmittedDocs({mark:"0",dateFrom:today,dateTo:today});
    return{ok:true,readOnly:true,operation:"RequestTransmittedDocs",environment:this.#client.environment,specVersion:this.#client.specVersion,checkedAt,responseBytes:Buffer.byteLength(xml,"utf8")};
  }

  async transmitPreparedDocument(principal:SessionPrincipal,input:{documentId:string;now?:number}):Promise<MyDataTransmissionResult>{
    if(!this.#issuanceEnabled)throw new Error("AADE myDATA issuance kill switch is disabled");
    const now=input.now??Date.now();
    const prepared=await this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const r=await tx.query<SqlRow>(`SELECT td.id::text AS document_uuid,td.public_id,td.status,td.transmission_status,td.mapping_version,td.payload_snapshot,td.aade_mark,
          td.accounting_policy_id::text,td.fiscalisation_route,td.mydata_payment_type,td.payment_transaction_id,td.ecr_token,td.provider_payment_signature,
          td.document_series,td.document_aa,td.market_id::text,
          p.version AS policy_version,p.status AS policy_status,p.fiscalisation_route AS policy_route
        FROM tax_documents td
        LEFT JOIN accounting_tax_policies p ON p.id=td.accounting_policy_id
        WHERE td.public_id=$1 FOR UPDATE OF td`,[input.documentId]);
      if(!r.rowCount)throw new Error("Tax document not found");
      const row=r.rows[0];
      if(optional(row.aade_mark))return{alreadyAccepted:true as const};
      if(text(row.policy_status)!=="approved")throw new Error("Tax document is not attached to an approved accounting policy");
      const policyVersion=text(row.policy_version);
      if(text(row.mapping_version)!==policyVersion)throw new Error("Tax document mapping version does not match its approved accounting policy");
      if(this.#deploymentMappingPin&&this.#deploymentMappingPin!==policyVersion)throw new Error(`Deployment mapping pin ${this.#deploymentMappingPin} does not match approved policy ${policyVersion}`);
      if(text(row.policy_route)!=="aade_direct_erp"||text(row.fiscalisation_route)!=="aade_direct_erp")throw new Error("Direct SendInvoices is allowed only for documents assigned to the approved AADE Direct ERP route");
      const payload=json(row.payload_snapshot);
      const preparation=json(payload.preparation);
      const preparationPayment=json(preparation.payment);
      const remoteEcommerceExempt=preparationPayment.posInterconnectionExempt===true&&preparationPayment.remoteEcommerce===true;
      const paymentType=intOptional(row.mydata_payment_type);
      if(paymentType===7){
        if(!optional(row.payment_transaction_id))throw new Error("POS/e-POS payment type 7 requires the payment transactionId");
        if(!remoteEcommerceExempt&&!nonEmptyJson(row.ecr_token))throw new Error("Direct ERP POS/e-POS payment type 7 requires an ECRToken outside the remote e-commerce exemption");
        if(nonEmptyJson(row.provider_payment_signature))throw new Error("Provider payment signature must not be mixed into the direct ERP ECRToken route");
      }
      if(text(row.transmission_status)!=="ready")throw new Error(`Tax document is ${text(row.transmission_status)}, not ready for transmission`);
      const xml=typeof payload.mydataXml==="string"?payload.mydataXml.trim():"";
      if(!xml)throw new Error("Prepared tax document is missing accountant-approved myDATA XML");
      const hash=createHash("sha256").update(xml).digest("hex");
      const attemptKey=`send:${input.documentId}:${hash}`;
      const existing=await tx.query<SqlRow>(`SELECT status FROM mydata_transmission_attempts WHERE tax_document_id=$1 AND operation='send_invoice' AND attempt_key=$2`,[text(row.document_uuid),attemptKey]);
      if(existing.rowCount){const status=text(existing.rows[0].status);if(status==="accepted")return{alreadyAccepted:true as const};throw new Error(`Existing AADE transmission attempt is ${status}; reconcile it instead of retrying blindly`);}
      await tx.query(`INSERT INTO mydata_transmission_attempts(public_id,tax_document_id,operation,attempt_key,environment,spec_version,request_hash,status,started_at) VALUES($1,$2,'send_invoice',$3,$4,$5,$6,'started',$7)`,[`mda_${randomUUID().replaceAll("-","")}`,text(row.document_uuid),attemptKey,this.#client.environment,this.#client.specVersion,hash,new Date(now)]);
      await tx.query("UPDATE tax_documents SET transmission_status='transmitting',last_transmission_at=$2,last_error=NULL WHERE id=$1",[text(row.document_uuid),new Date(now)]);
      return{alreadyAccepted:false as const,documentUuid:text(row.document_uuid),attemptKey,xml,series:optional(row.document_series),aa:intOptional(row.document_aa),marketId:text(row.market_id)};
    },{isolation:"serializable"});
    if(prepared.alreadyAccepted)return{ok:true,items:[],rawXml:""};
    let result:MyDataTransmissionResult;
    try{result=await this.#client.sendInvoices(prepared.xml);}catch(error){
      const message=error instanceof Error?error.message:String(error);
      await this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
        await tx.query(`UPDATE mydata_transmission_attempts SET status='manual_review',http_summary=$3,completed_at=$4 WHERE tax_document_id=$1 AND attempt_key=$2`,[prepared.documentUuid,prepared.attemptKey,message.slice(0,1000),new Date(now)]);
        await tx.query(`UPDATE tax_documents SET transmission_status='manual_review',last_error=$2,last_transmission_at=$3 WHERE id=$1`,[prepared.documentUuid,message.slice(0,1000),new Date(now)]);
      });
      throw new Error("AADE myDATA outcome is uncertain; automatic retry is blocked pending reconciliation");
    }
    await this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const first=result.items[0];
      const accepted=result.ok&&Boolean(first?.invoiceMark);
      const errors=result.items.flatMap(i=>i.errors.map(e=>e.code?`${e.code}: ${e.message}`:e.message)).join(" | ");
      await tx.query(`UPDATE mydata_transmission_attempts SET status=$3,response_snapshot=$4::jsonb,completed_at=$5 WHERE tax_document_id=$1 AND attempt_key=$2`,[prepared.documentUuid,prepared.attemptKey,accepted?"accepted":"rejected",JSON.stringify({ok:result.ok,items:result.items}),new Date(now)]);
      await tx.query(`UPDATE tax_documents SET transmission_status=$2,status=$3,aade_mark=$4,aade_uid=$5,aade_qr_url=$6,provider='aade_mydata_erp',provider_document_id=COALESCE($4,provider_document_id),last_error=$7,last_transmission_at=$8,issued_at=CASE WHEN $2='accepted' THEN COALESCE(issued_at,$8) ELSE issued_at END WHERE id=$1`,[prepared.documentUuid,accepted?"accepted":"rejected",accepted?"issued":"rejected",first?.invoiceMark??null,first?.invoiceUid??null,first?.qrUrl??null,errors||null,new Date(now)]);
      if(accepted&&prepared.series&&prepared.aa!==undefined&&first?.invoiceMark){
        await tx.query(`UPDATE mydata_fiscal_series SET last_issued_aa=GREATEST(COALESCE(last_issued_aa,0),$3),last_mark=$4,updated_at=$5 WHERE market_id=$1::uuid AND series=$2`,[prepared.marketId,prepared.series,prepared.aa,first.invoiceMark,new Date(now)]);
      }
    },{isolation:"serializable"});
    return result;
  }
}

function aadeDate(date:Date):string{const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const value=Object.fromEntries(parts.filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));return `${value.day}/${value.month}/${value.year}`;}
function text(v:unknown):string{if(typeof v!=="string"||!v)throw new Error("Invalid database text");return v;}function optional(v:unknown):string|undefined{return typeof v==="string"&&v?v:undefined;}function int(v:unknown):number{const n=Number(v);if(!Number.isSafeInteger(n))throw new Error("Invalid database integer");return n;}function intOptional(v:unknown):number|undefined{return v==null?undefined:int(v);}function epoch(v:unknown):number{const n=v instanceof Date?v.getTime():new Date(String(v)).getTime();if(!Number.isFinite(n))throw new Error("Invalid database timestamp");return n;}function json(v:unknown):Record<string,unknown>{if(v&&typeof v==="object"&&!Array.isArray(v))return v as Record<string,unknown>;if(typeof v==="string")try{const p=JSON.parse(v);return p&&typeof p==="object"&&!Array.isArray(p)?p:{};}catch{return{}}return{};}function nonEmptyJson(v:unknown):boolean{return Object.keys(json(v)).length>0;}
