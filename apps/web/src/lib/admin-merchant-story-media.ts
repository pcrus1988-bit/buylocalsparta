import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type MerchantStoryMediaCandidate = Readonly<{
  mediaId: string;
  altText?: string;
  createdAt: number;
}>;

export type MerchantStoryMediaRow = Readonly<{
  storyId: string;
  title: string;
  vendorId: string;
  vendorName: string;
  status: string;
  currentMediaId?: string;
  candidates: readonly MerchantStoryMediaCandidate[];
}>;

export type MerchantStoryMediaWorkspace = Readonly<{
  available: boolean;
  csrfToken: string;
  stories: readonly MerchantStoryMediaRow[];
}>;

type StoryRow = SqlRow & {
  story_uuid: string;
  story_id: string;
  title: string;
  status: string;
  vendor_uuid: string;
  vendor_id: string;
  vendor_name: string;
  current_media_id?: string | null;
};

type CandidateRow = SqlRow & {
  story_id: string;
  media_id: string;
  alt_text?: string | null;
  created_at: string | Date;
};

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid ${field}`);
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function epoch(value: unknown, field: string): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}

export async function adminMerchantStoryMediaWorkspace(principal: SessionPrincipal): Promise<MerchantStoryMediaWorkspace> {
  assertAdminPermission(principal, "content.read");
  if (!postgresAdminRuntimeEnabled()) return { available: false, csrfToken: principal.csrfToken, stories: [] };

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 12_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const stories = await tx.query<StoryRow>(`
      SELECT s.id::text AS story_uuid,
             s.public_id AS story_id,
             s.title,
             s.status,
             v.id::text AS vendor_uuid,
             v.public_id AS vendor_id,
             v.trading_name AS vendor_name,
             s.og_image AS current_media_id
      FROM merchant_stories s
      JOIN vendor_businesses v ON v.id=s.vendor_id
      JOIN markets m ON m.id=s.market_id
      WHERE m.code='sparta'
      ORDER BY s.updated_at DESC,s.public_id
    `);
    const candidates = await tx.query<CandidateRow>(`
      SELECT s.public_id AS story_id,
             pm.public_id AS media_id,
             pm.alt_text,
             pm.created_at
      FROM merchant_stories s
      JOIN vendor_businesses v ON v.id=s.vendor_id
      JOIN markets m ON m.id=s.market_id
      JOIN product_media pm ON pm.vendor_id=v.id
      WHERE m.code='sparta'
        AND pm.canonical_variant_id IS NULL
        AND pm.kind='image'
        AND pm.scan_status='clean'
        AND pm.rights_status='approved'
        AND pm.moderation_status='approved'
        AND pm.object_key IS NOT NULL
        AND pm.content_type IN ('image/jpeg','image/png','image/webp')
      ORDER BY s.updated_at DESC,pm.reviewed_at DESC NULLS LAST,pm.created_at DESC,pm.public_id
    `);

    const byStory = new Map<string, MerchantStoryMediaCandidate[]>();
    for (const candidate of candidates.rows) {
      const storyId = text(candidate.story_id, "candidate.story_id");
      const bucket = byStory.get(storyId) ?? [];
      bucket.push({
        mediaId: text(candidate.media_id, "candidate.media_id"),
        altText: optionalText(candidate.alt_text),
        createdAt: epoch(candidate.created_at, "candidate.created_at")
      });
      byStory.set(storyId, bucket);
    }

    return {
      available: true,
      csrfToken: principal.csrfToken,
      stories: stories.rows.map((story) => ({
        storyId: text(story.story_id, "story.story_id"),
        title: text(story.title, "story.title"),
        vendorId: text(story.vendor_id, "story.vendor_id"),
        vendorName: text(story.vendor_name, "story.vendor_name"),
        status: text(story.status, "story.status"),
        currentMediaId: optionalText(story.current_media_id),
        candidates: byStory.get(text(story.story_id, "story.story_id")) ?? []
      }))
    };
  }, { readOnly: true });
}

export async function adminSetMerchantStoryMedia(
  principal: SessionPrincipal,
  input: Readonly<{ storyId: string; mediaId?: string }>
): Promise<Readonly<{ storyId: string; mediaId?: string }>> {
  assertAdminPermission(principal, "content.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Merchant story media association requires PostgreSQL-backed Admin runtime");

  const storyId = input.storyId.trim();
  const mediaId = input.mediaId?.trim() || undefined;
  if (!storyId) throw new Error("Merchant story ID is required");
  if (mediaId && !/^media_[A-Za-z0-9_-]{8,128}$/.test(mediaId)) throw new Error("Merchant media ID is invalid");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 12_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const storyResult = await tx.query<StoryRow>(`
      SELECT s.id::text AS story_uuid,
             s.public_id AS story_id,
             s.title,
             s.status,
             v.id::text AS vendor_uuid,
             v.public_id AS vendor_id,
             v.trading_name AS vendor_name,
             s.og_image AS current_media_id
      FROM merchant_stories s
      JOIN vendor_businesses v ON v.id=s.vendor_id
      JOIN markets m ON m.id=s.market_id
      WHERE m.code='sparta' AND (s.public_id=$1 OR s.id::text=$1)
      FOR UPDATE OF s
    `, [storyId]);
    if (!storyResult.rowCount) throw new Error("Merchant story not found");
    const story = storyResult.rows[0];
    const storyUuid = text(story.story_uuid, "story.story_uuid");
    const vendorUuid = text(story.vendor_uuid, "story.vendor_uuid");
    const beforeMediaId = optionalText(story.current_media_id);

    if (mediaId) {
      const media = await tx.query<SqlRow>(`
        SELECT pm.public_id
        FROM product_media pm
        WHERE pm.public_id=$1
          AND pm.vendor_id=$2::uuid
          AND pm.canonical_variant_id IS NULL
          AND pm.kind='image'
          AND pm.scan_status='clean'
          AND pm.rights_status='approved'
          AND pm.moderation_status='approved'
          AND pm.object_key IS NOT NULL
          AND pm.content_type IN ('image/jpeg','image/png','image/webp')
        FOR SHARE
      `, [mediaId, vendorUuid]);
      if (!media.rowCount) throw new Error("Merchant media must belong to the same Vendor and pass scan, rights and moderation approval before association");
    }

    await tx.query(`UPDATE merchant_stories SET og_image=$2,updated_at=now() WHERE id=$1::uuid`, [storyUuid, mediaId ?? null]);

    const actor = await tx.query<SqlRow>(`SELECT id::text AS user_uuid FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [principal.userId]);
    const market = await tx.query<SqlRow>(`SELECT id::text AS market_uuid FROM markets WHERE code='sparta' LIMIT 1`);
    await tx.query(`
      INSERT INTO audit_events(id,market_id,actor_user_id,actor_role,action,entity_type,entity_id,reason,before_state,after_state,created_at)
      VALUES(gen_random_uuid(),$1::uuid,$2::uuid,'platform','merchant_story.media_changed','merchant_story',$3,$4,$5::jsonb,$6::jsonb,now())
    `, [
      text(market.rows[0]?.market_uuid, "market.market_uuid"),
      text(actor.rows[0]?.user_uuid, "actor.user_uuid"),
      text(story.story_id, "story.story_id"),
      mediaId ? "Approved merchant media associated" : "Merchant media association removed",
      JSON.stringify({ mediaId: beforeMediaId ?? null }),
      JSON.stringify({ mediaId: mediaId ?? null })
    ]);

    return { storyId: text(story.story_id, "story.story_id"), mediaId };
  }, { isolation: "serializable" });
}
