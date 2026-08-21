import { createHash, randomUUID } from "node:crypto";
import {
  can,
  type Permission,
  type Role,
  type SecurityEventType,
  type SecuritySeverity,
  type SessionPrincipal,
  type VendorOnboardingState
} from "@buy-local-sparta/core";
import {
  PostgresAdminAuthService,
  PostgresFixedWindowRateLimiter,
  platformScope
} from "@buy-local-sparta/postgres-runtime";
import * as memory from "./admin-memory-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { assertDatabaseLessPreviewCsrf, createDatabaseLessPreviewSession, databaseLessPreviewSessionEnabled, databaseLessPreviewSessionFromToken, previewCredentialMatches } from "./preview-auth";

export const ADMIN_SESSION_COOKIE = "bls_admin_session";
const postgresAuthKey = "__buyLocalSpartaAdminPostgresAuth" as const;
const postgresLimiterKey = "__buyLocalSpartaAdminPostgresLimiter" as const;
type Globals = typeof globalThis & { [postgresAuthKey]?: PostgresAdminAuthService; [postgresLimiterKey]?: PostgresFixedWindowRateLimiter };
const globals = globalThis as Globals;

function authSecret(): string {
  const configured = process.env.BLS_AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("BLS_AUTH_SECRET (minimum 32 characters) is required for production admin sessions");
  return "buy-local-sparta-development-admin-auth-secret-not-production";
}

export function postgresAdminRuntimeEnabled(): boolean { return Boolean(process.env.DATABASE_URL?.trim()); }
function postgresAuth(): PostgresAdminAuthService {
  const runtime = getProductionPostgresRuntime();
  return globals[postgresAuthKey] ?? (globals[postgresAuthKey] = new PostgresAdminAuthService({ identity: runtime.persistence.identity, secret: authSecret(), sessionTtlMs: 6 * 60 * 60 * 1000 }));
}
function postgresLimiter(): PostgresFixedWindowRateLimiter {
  const runtime = getProductionPostgresRuntime();
  return globals[postgresLimiterKey] ?? (globals[postgresLimiterKey] = new PostgresFixedWindowRateLimiter(runtime.sqlPool));
}

export function getAdminRuntime() { return memory.getAdminRuntime(); }
export function isPlatformRole(role: Role): boolean { return ["super_admin","vendor_operations","catalog_qa","customer_support","platform_finance","content_seo","compliance","logistics","auditor"].includes(role); }
export function hasAdminPermission(principal: SessionPrincipal, permission: Permission): boolean { return principal.roles.some((role) => isPlatformRole(role) && can(role, permission)); }
export function assertAdminPermission(principal: SessionPrincipal, permission: Permission): void { if (!hasAdminPermission(principal, permission)) throw new Error(`Admin permission required: ${permission}`); }

export async function consumeAdminLoginLimit(visitorKey:string,now:number){if(postgresAdminRuntimeEnabled())return postgresLimiter().consume({route:"admin-login",key:visitorKey,limit:5,windowMs:15*60*1000,now});return memory.getAdminRuntime().rateLimiter.consume({key:`admin-login:${visitorKey}`,rule:{limit:5,windowMs:15*60*1000},now});}
export async function authenticateAdmin(input:{email:string;password:string;now:number}){
  if(postgresAdminRuntimeEnabled())return postgresAuth().authenticate(input);
  if(databaseLessPreviewSessionEnabled("admin")){
    const email=input.email.trim().toLowerCase();
    if(email==="admin@demo.local"&&previewCredentialMatches(input.password,"AdminStrong!123"))return createDatabaseLessPreviewSession({kind:"admin",userId:"preview_admin_super",email,roles:["super_admin"],now:input.now,ttlMs:6*60*60*1000});
    if(email==="finance@demo.local"&&previewCredentialMatches(input.password,"FinanceStrong!123"))return createDatabaseLessPreviewSession({kind:"admin",userId:"preview_admin_finance",email,roles:["platform_finance"],now:input.now,ttlMs:6*60*60*1000});
    throw new Error("Invalid email or password");
  }
  return memory.getAdminRuntime().auth.authenticate(input);
}
export async function adminSessionFromToken(token:string|undefined,now:number):Promise<SessionPrincipal|undefined>{if(postgresAdminRuntimeEnabled())return postgresAuth().session(token,now);if(databaseLessPreviewSessionEnabled("admin"))return databaseLessPreviewSessionFromToken(token,"admin",now);return memory.getAdminRuntime().auth.session(token,now);}
export function assertAdminCsrf(principal:SessionPrincipal,supplied:string|undefined):void{if(postgresAdminRuntimeEnabled())postgresAuth().assertCsrf(principal,supplied);else if(databaseLessPreviewSessionEnabled("admin"))assertDatabaseLessPreviewCsrf(principal,supplied);else memory.getAdminRuntime().auth.assertCsrf(principal,supplied);}
export async function logoutAdmin(token:string|undefined,now=Date.now()):Promise<void>{if(postgresAdminRuntimeEnabled())await postgresAuth().logout(token,now);else if(!databaseLessPreviewSessionEnabled("admin"))memory.getAdminRuntime().auth.logout(token);}

export async function recordAdminSecurityEvent(input:{type:SecurityEventType;severity:SecuritySeverity;route:string;method:string;subjectHash:string;actorUserId?:string;details?:Record<string,string|number|boolean|null>;occurredAt:number}){
  if(postgresAdminRuntimeEnabled()){await getProductionPostgresRuntime().persistence.security.record({id:`sec_${randomUUID()}`, ...input});return;}
  memory.getAdminRuntime().securityEvents.record(input);
}

export type AdminPersonalDataPurpose = "customer_management" | "customer_support" | "privacy_operations" | "order_fulfilment" | "finance_tax" | "security_investigation";
export async function recordAdminPersonalDataAccess(principal:SessionPrincipal,input:{eventType?:Extract<SecurityEventType,"personal_data.accessed"|"personal_data.revealed"|"personal_data.exported">;route:string;method?:string;resourceType:string;resourceId:string;purpose:AdminPersonalDataPurpose;dataClasses:readonly string[];recordCount?:number;accessScope?:"individual"|"bulk"}){
  const eventType=input.eventType??"personal_data.accessed";
  const subjectHash=createHash("sha256").update(`${input.resourceType}:${input.resourceId}`).digest("hex");
  await recordAdminSecurityEvent({
    type:eventType,
    severity:eventType==="personal_data.exported"?"high":"low",
    route:input.route,
    method:input.method??"GET",
    subjectHash,
    actorUserId:principal.userId,
    details:{
      purpose:input.purpose,
      resourceType:input.resourceType.slice(0,80),
      dataClasses:input.dataClasses.join(",").slice(0,500),
      recordCount:Math.max(0,input.recordCount??1),
      accessScope:input.accessScope??"individual"
    },
    occurredAt:Date.now()
  });
}

export async function recordAdminAudit(principal:SessionPrincipal,action:string,entityType:string,entityId:string,reason?:string,after?:unknown){
  const now=Date.now();
  if(postgresAdminRuntimeEnabled()){await getProductionPostgresRuntime().persistence.trust.saveAudit({scope:platformScope(principal.userId),event:{id:`audit_${randomUUID()}`,actorId:principal.userId,actorRole:principal.roles[0],action,entityType,entityId,reason,after,createdAt:now}});return;}
  memory.getAdminRuntime().audit.record({actorId:principal.userId,actorRole:principal.roles[0],action,entityType,entityId,reason,after,createdAt:now});
}

export async function adminDashboard(p:SessionPrincipal){if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.dashboard(p);return memory.adminDashboard(p);}
export async function adminVendorsWorkspace(p:SessionPrincipal){assertAdminPermission(p,"vendor.manage");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.vendorsWorkspace(p);return memory.adminVendorsWorkspace(p);}
export async function transitionVendorApplication(p:SessionPrincipal,input:{applicationId:string;to:VendorOnboardingState;reason:string}){assertAdminPermission(p,"vendor.manage");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.transitionVendorApplication(p,input);return memory.transitionVendorApplication(p,input);}
export async function adminMatchingWorkspace(p:SessionPrincipal){assertAdminPermission(p,"catalog.read");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.matchingWorkspace(p);return memory.adminMatchingWorkspace(p);}
export async function adminCatalogAction(p:SessionPrincipal,input:{kind:"approve_match"|"reject_match"|"approve_offer"|"reject_offer";id:string;reason:string}){assertAdminPermission(p,"catalog.write");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.catalogAction(p,input);return memory.adminCatalogAction(p,input);}
export async function adminCreateCanonical(p:SessionPrincipal,input:{submissionId:string;platformPriceMinor:number;titleEl?:string;reason:string}){assertAdminPermission(p,"catalog.write");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.createCanonical(p,input);return memory.adminCreateCanonical(p,input);}
export async function adminTrustWorkspace(p:SessionPrincipal){assertAdminPermission(p,"catalog.read");if(postgresAdminRuntimeEnabled())return { ...(await getProductionPostgresRuntime().adminOperations.trustWorkspace(p)), automatedMalwareScan:true };return { ...memory.adminTrustWorkspace(p), automatedMalwareScan:false };}
export async function adminMediaAction(p:SessionPrincipal,input:{assetId:string;action:"scan_clean"|"scan_infected"|"approve"|"reject";reason?:string}){assertAdminPermission(p,"catalog.write");if(postgresAdminRuntimeEnabled()){if(input.action==="scan_clean"||input.action==="scan_infected")throw new Error("Automated malware scanner owns media scan state");return getProductionPostgresRuntime().adminOperations.mediaAction(p,input)}return memory.adminMediaAction(p,input);}
export async function adminComplianceAction(p:SessionPrincipal,input:{documentId:string;decision:"verified"|"rejected";reason?:string}){assertAdminPermission(p,"catalog.write");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.complianceAction(p,input);return memory.adminComplianceAction(p,input);}
export async function adminFinanceWorkspace(p:SessionPrincipal){assertAdminPermission(p,"finance.read");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.financeWorkspace(p);return memory.adminFinanceWorkspace(p);}
export async function adminApprovePayable(p:SessionPrincipal,procurementId:string){assertAdminPermission(p,"finance.write");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.approvePayable(p,procurementId);return memory.adminApprovePayable(p,procurementId);}
export async function adminSettlementAction(p:SessionPrincipal,input:{kind:"create"|"submit"|"approve"|"pay";batchId?:string;procurementIds?:string[];payoutReference?:string}){assertAdminPermission(p,"finance.write");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.settlementAction(p,input);return memory.adminSettlementAction(p,input);}
export async function adminFairnessWorkspace(p:SessionPrincipal){assertAdminPermission(p,"fairness.read");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.fairnessWorkspace(p);return memory.adminFairnessWorkspace(p);}
export async function adminReviewFairnessAppeal(p:SessionPrincipal,input:{appealId:string;status:"under_review"|"resolved"|"rejected";resolution?:string}){assertAdminPermission(p,"fairness.manage");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.reviewFairnessAppeal(p,input);return memory.adminReviewFairnessAppeal(p,input);}
export async function adminOperationsWorkspace(p:SessionPrincipal){assertAdminPermission(p,"admin.audit.read");if(postgresAdminRuntimeEnabled())return getProductionPostgresRuntime().adminOperations.operationsWorkspace(p);return memory.adminOperationsWorkspace(p);}
export async function adminActivationWorkspace(p:SessionPrincipal){assertAdminPermission(p,"admin.audit.read");if(postgresAdminRuntimeEnabled())return{csrfToken:p.csrfToken,evidence:await getProductionPostgresRuntime().activationEvidence.latest(200)};return{csrfToken:p.csrfToken,evidence:[] as const};}

export async function adminTaxWorkspace(p:SessionPrincipal){assertAdminPermission(p,"finance.read");if(postgresAdminRuntimeEnabled()){const r=getProductionPostgresRuntime();return r.myData?await r.myData.workspace(p):{environment:"not_configured",specVersion:"",issuanceEnabled:false,approvedMappingVersion:undefined,documents:[] as const}}return{environment:"development",specVersion:"",issuanceEnabled:false,approvedMappingVersion:undefined,documents:[] as const};}
export async function adminTransmitMyData(p:SessionPrincipal,documentId:string){assertAdminPermission(p,"finance.write");if(!postgresAdminRuntimeEnabled())throw new Error("AADE myDATA transmission requires PostgreSQL runtime");const service=getProductionPostgresRuntime().myData;if(!service)throw new Error("AADE myDATA credentials are not configured");return service.transmitPreparedDocument(p,{documentId});}
