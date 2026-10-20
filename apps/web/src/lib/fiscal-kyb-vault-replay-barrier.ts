/**
 * M42 — server-only, single-use DISPATCH barrier for signed synthetic probes.
 *
 * Not reachable from a route/worker. No live issuer, database table, Storage
 * grant or object operation is activated by this file. The injected consumer
 * MUST perform a durable, atomic insert with unique jti AND unique run ID.
 *
 * IMPORTANT: this only blocks duplicate dispatch via THIS wrapper. It cannot
 * prevent a stolen JWT being replayed directly against an external Storage
 * service; real provider-level replay controls and issuer trust are separate
 * release gates.
 */
import {
 verifyFiscalSyntheticProbeJwt,
 type FiscalSignedProbeArgs
} from "./fiscal-kyb-vault-signed-probe.ts";
import {runFiscalSyntheticStorageApiProbe} from "./fiscal-kyb-vault-storage-api-probe.ts";

export type FiscalVerifiedSyntheticToken=Readonly<{
 runId:string;tokenId:string;expiresAt:number;
 signatureVerified:true;syntheticOnly:true;
}>;
export type FiscalReplayReservation=(
 token:FiscalVerifiedSyntheticToken
)=>Promise<boolean>;
export type FiscalReplayBarrierArgs=FiscalSignedProbeArgs&
 Readonly<{reserveOnce:FiscalReplayReservation}>;

const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SQL=`
INSERT INTO public.fiscal_synthetic_probe_replay
 (token_id,run_id,expires_at)
VALUES ($1::uuid,$2::uuid,to_timestamp($3::double precision))
ON CONFLICT DO NOTHING
RETURNING token_id
`;

type QueryPort=Readonly<{
 query:(statement:string,parameters:readonly (string|number)[])=>
  Promise<Readonly<{rowCount:number|null}>>;
}>;

function reject():never{throw Error("FISCAL_M42_REPLAY_OR_UNAVAILABLE");}

/**
 * Query port must use a separately authorized PostgreSQL connection.
 * SQL uses the REVIEW_ONLY M42 DDL and has no expiry-based token reuse.
 * Errors fail closed; the credential is NEVER returned or logged.
 */
export function fiscalSqlReplayReservation(db:QueryPort):FiscalReplayReservation{
 if(!db||typeof db.query!=="function")return reject();
 return async token=>{
  if(!token||token.signatureVerified!==true||token.syntheticOnly!==true||
   !UUID_V4.test(token.runId)||!UUID_V4.test(token.tokenId)||
   !Number.isSafeInteger(token.expiresAt)||token.expiresAt<=0)return reject();
  try{
   const result=await db.query(SQL,[token.tokenId,token.runId,token.expiresAt]);
   if(!result||![0,1].includes(result.rowCount as number))return reject();
   return result.rowCount===1;
  }catch{return reject();}
 };
}

/** Offline-only synthetic call; signature is verified BEFORE SQL or HTTP. */
export async function runFiscalReplayGuardedSyntheticStorageProbe(
 args:FiscalReplayBarrierArgs
){
 if(!args||typeof args.reserveOnce!=="function")return reject();
 const verified=verifyFiscalSyntheticProbeJwt(
  args.scopedJwt,args.trust,args.now);
 let granted=false;
 try{granted=(await args.reserveOnce(verified))===true;}
 catch{return reject();}
 if(!granted)return reject();
 // Even a network/cleanup failure burns the token and run ID. Never refund.
 return runFiscalSyntheticStorageApiProbe(args);
}

export function inspectFiscalM42Readiness(){
 return Object.freeze({
  atomicReplayDispatchContractInCi:true as const,
  sqlReviewOnly:true as const,
  liveReplayLedgerDeployed:false as const,
  providerLevelReplayPreventionVerified:false as const,
  independentIssuerTrusted:false as const,
  supabaseStoragePoliciesActivated:false as const,
  liveKybDocumentIntake:false as const,
  legalFiscalIssuance:false as const
 });
}
