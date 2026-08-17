import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SqlPool, type SqlRow } from "@buy-local-sparta/core";

export type ActivationProvider = "database" | "viva" | "mydata" | "search" | "email" | "object_storage" | "clamav" | "boxnow" | "web";
export type ActivationStatus = "passed" | "failed" | "blocked" | "skipped";
export type ActivationCheckKind = "configuration" | "connectivity" | "scenario" | "deployment";

export type ActivationEvidenceInput = Readonly<{
  provider: ActivationProvider;
  environment: string;
  buildVersion: string;
  checkName: string;
  checkKind: ActivationCheckKind;
  status: ActivationStatus;
  details?: Readonly<Record<string, string | number | boolean | null>>;
  evidence?: string;
  observedAt?: number;
  expiresAt?: number;
}>;

export type ActivationEvidence = Readonly<{
  id: string;
  provider: ActivationProvider;
  environment: string;
  buildVersion: string;
  checkName: string;
  checkKind: ActivationCheckKind;
  status: ActivationStatus;
  evidenceDigest: string;
  details: Readonly<Record<string, unknown>>;
  observedAt: number;
  expiresAt?: number;
}>;

export class PostgresActivationEvidenceService {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async record(input: ActivationEvidenceInput): Promise<ActivationEvidence> {
    const observedAt = input.observedAt ?? Date.now();
    const details = sanitizeDetails(input.details ?? {});
    const digestSource = input.evidence?.trim() || JSON.stringify({
      provider: input.provider,
      environment: input.environment,
      buildVersion: input.buildVersion,
      checkName: input.checkName,
      checkKind: input.checkKind,
      status: input.status,
      details,
      observedAt
    });
    const evidenceDigest = createHash("sha256").update(digestSource).digest("hex");
    const publicId = `evidence_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    return this.#uow.withTransaction({ platformAccess: true, marketId: "sparta" }, async (tx) => {
      const result = await tx.query<SqlRow>(`INSERT INTO provider_activation_evidence
        (public_id,provider,environment,build_version,check_name,check_kind,status,evidence_digest,details,observed_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
        RETURNING public_id,provider,environment,build_version,check_name,check_kind,status,evidence_digest,details,observed_at,expires_at`, [
        publicId, input.provider, clean(input.environment, "environment"), clean(input.buildVersion, "buildVersion"), clean(input.checkName, "checkName"), input.checkKind, input.status, evidenceDigest, JSON.stringify(details), new Date(observedAt), input.expiresAt ? new Date(input.expiresAt) : null
      ]);
      return mapEvidence(result.rows[0]);
    });
  }

  async latest(limit = 100): Promise<readonly ActivationEvidence[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return this.#uow.withTransaction({ platformAccess: true, marketId: "sparta" }, async (tx) => {
      const result = await tx.query<SqlRow>(`SELECT DISTINCT ON (provider,environment,check_name)
        public_id,provider,environment,build_version,check_name,check_kind,status,evidence_digest,details,observed_at,expires_at
        FROM provider_activation_evidence
        ORDER BY provider,environment,check_name,observed_at DESC
        LIMIT $1`, [safeLimit]);
      return result.rows.map(mapEvidence).sort((a,b)=>b.observedAt-a.observedAt);
    }, { readOnly: true });
  }

  async forBuild(buildVersion: string): Promise<readonly ActivationEvidence[]> {
    return this.#uow.withTransaction({ platformAccess: true, marketId: "sparta" }, async (tx) => {
      const result = await tx.query<SqlRow>(`SELECT public_id,provider,environment,build_version,check_name,check_kind,status,evidence_digest,details,observed_at,expires_at
        FROM provider_activation_evidence WHERE build_version=$1 ORDER BY observed_at DESC`, [clean(buildVersion,"buildVersion")]);
      return result.rows.map(mapEvidence);
    }, { readOnly: true });
  }
}

function clean(value:string,label:string):string { const v=value.trim(); if(!v || v.length>160) throw new Error(`${label} is invalid`); return v; }
function sanitizeDetails(input:Readonly<Record<string,string|number|boolean|null>>):Record<string,string|number|boolean|null>{
  const out:Record<string,string|number|boolean|null>={};
  for(const [key,value] of Object.entries(input)){
    if(/secret|token|password|api.?key|client.?secret|subscription.?key|credential|authorization/i.test(key)) continue;
    if(typeof value==="string") out[key]=value.slice(0,500); else out[key]=value;
  }
  return out;
}
function mapEvidence(row:SqlRow):ActivationEvidence{
  const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details as Record<string,unknown> : {};
  return {
    id:String(row.public_id), provider:String(row.provider) as ActivationProvider, environment:String(row.environment), buildVersion:String(row.build_version), checkName:String(row.check_name),
    checkKind:String(row.check_kind) as ActivationCheckKind, status:String(row.status) as ActivationStatus, evidenceDigest:String(row.evidence_digest), details,
    observedAt:new Date(String(row.observed_at)).getTime(), expiresAt:row.expires_at?new Date(String(row.expires_at)).getTime():undefined
  };
}
