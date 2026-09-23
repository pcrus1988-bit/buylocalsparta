import { createHash } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import type { BuildCustomerGuide, BuildProjectGuidance, BuildQuantityEstimate } from "./build-guidance-runtime";

export type PaintBuildProjectSnapshot = Readonly<{
  createdAt: string;
  project: Readonly<{
    title: string;
    projectType: string;
    scenarioKey: string;
    areaM2?: number;
    colour?: string;
    summary?: string;
    selectedProduct?: Readonly<{
      manufacturerProductId?: string;
      catalogueId?: string;
      title?: string;
      brand?: string;
      price?: string;
    }>;
    kit?: Readonly<{
      complete: boolean;
      totalMinor: number;
      items: readonly Readonly<{
        canonicalVariantId: string;
        title: string;
        priceMinor: number;
        price: string;
        quantity: number;
        selected: boolean;
        required: boolean;
        role: "required_system" | "recommended_working" | "optional_extra";
        sourceLayer: "MANUFACTURER_VITEX" | "KONTA_MOU_RULE";
        reasonEl?: string;
      }>[];
      unresolvedRequired: readonly string[];
      unavailableAccessorySlots: readonly string[];
    }>;
  }>;
  guidance: BuildProjectGuidance;
  customerGuide: BuildCustomerGuide;
  quantityEstimate: BuildQuantityEstimate;
}>;

export type PaintBuildSnapshotRecord = Readonly<{
  id: string;
  publicId: string;
  userId?: string;
  projectName: string;
  projectType: string;
  scenarioKey: string;
  snapshot: PaintBuildProjectSnapshot;
  createdAt: string;
}>;

async function resolveUserId(principal: SessionPrincipal): Promise<string> {
  const db = getProductionPostgresRuntime().nativePool;
  const row = await db.query<{ id: string }>(
    "select id from users where public_id=$1 or id::text=$1 limit 1",
    [principal.userId]
  );
  if (!row.rowCount) throw new Error("ACCOUNT_NOT_FOUND");
  return String(row.rows[0].id);
}

export async function createPaintBuildSnapshot(
  snapshot: PaintBuildProjectSnapshot,
  principal?: SessionPrincipal
): Promise<PaintBuildSnapshotRecord> {
  const db = getProductionPostgresRuntime().nativePool;
  const userId = principal ? await resolveUserId(principal) : null;
  const result = await db.query<{
    id: string; public_id: string; created_at: Date;
  }>(
    `insert into paint_build_guidance_snapshots
      (user_id,scenario_key,project_type,project_name,resolver_version,project_snapshot,guidance_snapshot,guidance_conflict,blocked,expires_at)
     values($1,$2,$3,$4,'three-layer-v1',$5::jsonb,$6::jsonb,$7,$8,$9)
     returning id,public_id,created_at`,
    [
      userId,
      snapshot.project.scenarioKey,
      snapshot.project.projectType,
      snapshot.project.title,
      JSON.stringify(snapshot.project),
      JSON.stringify({
        createdAt: snapshot.createdAt,
        guidance: snapshot.guidance,
        customerGuide: snapshot.customerGuide,
        quantityEstimate: snapshot.quantityEstimate
      }),
      snapshot.guidance.guidance_conflict === true,
      snapshot.guidance.blocked === true,
      userId ? null : new Date(Date.now() + 24 * 60 * 60 * 1000)
    ]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    publicId: row.public_id,
    userId: userId ?? undefined,
    projectName: snapshot.project.title,
    projectType: snapshot.project.projectType,
    scenarioKey: snapshot.project.scenarioKey,
    snapshot,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function readPaintBuildSnapshot(
  publicId: string,
  principal?: SessionPrincipal
): Promise<PaintBuildSnapshotRecord> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<any>(
    `select id,public_id,user_id,scenario_key,project_type,project_name,project_snapshot,guidance_snapshot,created_at,expires_at
     from paint_build_guidance_snapshots
     where public_id=$1
       and (expires_at is null or expires_at > now())
     limit 1`,
    [publicId]
  );
  if (!result.rowCount) throw new Error("SNAPSHOT_NOT_FOUND");
  const row = result.rows[0];
  if (row.user_id) {
    if (!principal) throw new Error("AUTH_REQUIRED");
    const userId = await resolveUserId(principal);
    if (String(row.user_id) !== userId) throw new Error("FORBIDDEN");
  }
  const guidanceData = row.guidance_snapshot as Record<string, unknown>;
  const snapshot: PaintBuildProjectSnapshot = {
    createdAt: String(guidanceData.createdAt ?? new Date(row.created_at).toISOString()),
    project: row.project_snapshot,
    guidance: guidanceData.guidance as BuildProjectGuidance,
    customerGuide: guidanceData.customerGuide as BuildCustomerGuide,
    quantityEstimate: guidanceData.quantityEstimate as BuildQuantityEstimate
  };
  return {
    id: String(row.id),
    publicId: String(row.public_id),
    userId: row.user_id ? String(row.user_id) : undefined,
    projectName: String(row.project_name),
    projectType: String(row.project_type),
    scenarioKey: String(row.scenario_key),
    snapshot,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function savePaintBuildProjectDocument(
  record: PaintBuildSnapshotRecord,
  principal: SessionPrincipal,
  pdf: Buffer
): Promise<{ publicId: string; createdAt: string }> {
  const db = getProductionPostgresRuntime().nativePool;
  const userId = await resolveUserId(principal);
  if (!record.userId || record.userId !== userId) throw new Error("FORBIDDEN");
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const inserted = await db.query<{ public_id: string; created_at: Date }>(
    `insert into customer_project_documents
      (user_id,guidance_snapshot_id,project_name,project_type,scenario_key,guidance_snapshot,content,byte_size,sha256)
     values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
     on conflict (guidance_snapshot_id) do nothing
     returning public_id,created_at`,
    [
      userId,
      record.id,
      record.projectName,
      record.projectType,
      record.scenarioKey,
      JSON.stringify(record.snapshot),
      pdf,
      pdf.byteLength,
      sha256
    ]
  );
  if (inserted.rowCount) {
    return { publicId: inserted.rows[0].public_id, createdAt: new Date(inserted.rows[0].created_at).toISOString() };
  }
  const existing = await db.query<{ public_id: string; created_at: Date }>(
    "select public_id,created_at from customer_project_documents where guidance_snapshot_id=$1 and user_id=$2",
    [record.id,userId]
  );
  if (!existing.rowCount) throw new Error("DOCUMENT_SAVE_FAILED");
  return { publicId: existing.rows[0].public_id, createdAt: new Date(existing.rows[0].created_at).toISOString() };
}

export async function listPaintBuildDocuments(principal: SessionPrincipal) {
  const db = getProductionPostgresRuntime().nativePool;
  const userId = await resolveUserId(principal);
  const result = await db.query<{
    public_id: string; project_name: string; project_type: string; scenario_key: string; created_at: Date; byte_size: number;
  }>(
    `select public_id,project_name,project_type,scenario_key,created_at,byte_size
     from customer_project_documents
     where user_id=$1
     order by created_at desc`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.public_id,
    projectName: row.project_name,
    projectType: row.project_type,
    scenarioKey: row.scenario_key,
    documentType: "paint_build_project_guide" as const,
    createdAt: new Date(row.created_at).toISOString(),
    byteSize: Number(row.byte_size)
  }));
}

export async function readPaintBuildDocument(publicId: string, principal: SessionPrincipal): Promise<Buffer> {
  const db = getProductionPostgresRuntime().nativePool;
  const userId = await resolveUserId(principal);
  const result = await db.query<{ content: Buffer; byte_size: number; sha256: string }>(
    `select content,byte_size,sha256 from customer_project_documents
     where public_id=$1 and user_id=$2 limit 1`,
    [publicId,userId]
  );
  if (!result.rowCount) throw new Error("DOCUMENT_NOT_FOUND");
  const pdf = Buffer.from(result.rows[0].content);
  if (pdf.byteLength !== Number(result.rows[0].byte_size)) throw new Error("DOCUMENT_SIZE_MISMATCH");
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  if (sha256 !== result.rows[0].sha256) throw new Error("DOCUMENT_HASH_MISMATCH");
  return pdf;
}
