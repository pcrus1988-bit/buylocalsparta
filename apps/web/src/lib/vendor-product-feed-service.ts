import { createHash } from "node:crypto";
import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow,
  type VendorXmlFieldMapping
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { resolveVendorOperatingAssignment } from "./vendor-operating-assignment";
import {
  fetchVendorXml,
  normalizeVendorFeedUrl,
  prepareVendorProductFeed,
  type VendorProductFeedMappingInput,
  type VendorProductFeedPreview
} from "./vendor-product-feed-preview";

type FeedSourceType = "url" | "upload";
type FeedTrigger = "upload" | "manual" | "scheduled";
type FeedStatus = "active" | "paused" | "completed" | "error";

export type VendorProductFeedSummary = Readonly<{
  id: string;
  name: string;
  sourceType: FeedSourceType;
  sourceUrl?: string;
  sourceFilename?: string;
  status: FeedStatus;
  syncIntervalMinutes: number;
  fieldMapping: VendorXmlFieldMapping;
  categoryMapping: Readonly<Record<string, string>>;
  defaultCategoryCode?: string;
  productCount: number;
  readyCount: number;
  errorCount: number;
  lastSyncAt?: number;
  lastSuccessAt?: number;
  nextSyncAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}>;

export type VendorProductFeedRun = Readonly<{
  id: string;
  feedId: string;
  triggerType: FeedTrigger;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  createdSubmissions: number;
  updatedSubmissions: number;
  updatedOffers: number;
  protectedInventoryRows: number;
  missingRows: number;
  errorMessage?: string;
  startedAt: number;
  finishedAt?: number;
}>;

export type VendorProductFeedWorkspace = Readonly<{
  feeds: readonly VendorProductFeedSummary[];
  recentRuns: readonly VendorProductFeedRun[];
}>;

export type SaveVendorProductFeedInput = VendorProductFeedMappingInput & Readonly<{
  sourceType: FeedSourceType;
  sourceUrl?: string;
  sourceFilename?: string;
  feedName: string;
  syncIntervalMinutes?: number;
  xml: string;
}>;

const sql = (...parts: string[]) => parts.join(" ");

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, {
    statementTimeoutMs: 180_000,
    lockTimeoutMs: 5_000
  });
}

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function int(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function epoch(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export async function vendorProductFeedWorkspace(principal: SessionPrincipal): Promise<VendorProductFeedWorkspace> {
  const vendorId = requiredVendorId(principal);
  return uow().withTransaction({ actorUserId: principal.userId, vendorId }, async (tx) => {
    const feeds = await tx.query<SqlRow>(sql(
      "SELECT f.public_id,f.name,f.source_type,f.source_url,f.source_filename,f.status,f.sync_interval_minutes,",
      "f.field_mapping,f.category_mapping,c.code AS default_category_code,f.product_count,f.ready_count,f.error_count,",
      "f.last_sync_at,f.last_success_at,f.next_sync_at,f.last_error,f.created_at,f.updated_at",
      "FROM vendor_product_feeds f",
      "LEFT JOIN categories c ON c.id=f.default_category_id",
      "WHERE f.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)",
      "ORDER BY f.updated_at DESC,f.created_at DESC"
    ), [vendorId]);
    const runs = await tx.query<SqlRow>(sql(
      "SELECT r.public_id,f.public_id AS feed_public_id,r.trigger_type,r.status,r.total_rows,r.valid_rows,r.error_rows,",
      "r.created_submissions,r.updated_submissions,r.updated_offers,r.protected_inventory_rows,r.missing_rows,",
      "r.error_message,r.started_at,r.finished_at",
      "FROM vendor_product_feed_runs r JOIN vendor_product_feeds f ON f.id=r.feed_id",
      "WHERE r.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)",
      "ORDER BY r.started_at DESC,r.id DESC LIMIT 30"
    ), [vendorId]);
    return { feeds: feeds.rows.map(mapFeed), recentRuns: runs.rows.map(mapRun) };
  }, { readOnly: true });
}

export async function saveVendorProductFeed(
  principal: SessionPrincipal,
  input: SaveVendorProductFeedInput,
  triggerType: FeedTrigger = input.sourceType === "upload" ? "upload" : "manual"
): Promise<Readonly<{ feedId: string; preview: VendorProductFeedPreview; run: VendorProductFeedRun }>> {
  const vendorId = requiredVendorId(principal);
  const name = input.feedName.trim().slice(0, 120);
  if (name.length < 2) throw new Error("Δώσε ένα όνομα για το XML feed.");
  const interval = [60, 180, 360, 1440].includes(Number(input.syncIntervalMinutes)) ? Number(input.syncIntervalMinutes) : 360;
  const sourceUrl = input.sourceType === "url" ? normalizeVendorFeedUrl(input.sourceUrl) : undefined;
  if (input.sourceType === "upload" && !input.sourceFilename?.trim()) throw new Error("Λείπει το όνομα του XML αρχείου.");

  const prepared = await prepareVendorProductFeed(principal, input.xml, input);
  if (!prepared.rows.length) throw new Error("Δεν υπάρχει έγκυρο προϊόν για εισαγωγή. Διόρθωσε το mapping ή το XML.");
  const assignment = await resolveVendorOperatingAssignment(principal);
  if (!assignment.marketId || !assignment.locationId) throw new Error("Ο vendor δεν έχει πλήρη market/location ρύθμιση.");
  const sourceXmlHash = createHash("sha256").update(input.xml).digest("hex");

  const result = await uow().withTransaction(
    { actorUserId: principal.userId, vendorId, marketId: assignment.marketId },
    async (tx) => {
      const refs = await tx.query<SqlRow>(sql(
        "SELECT vb.id::text AS vendor_uuid,vb.market_id::text AS market_uuid,vl.id::text AS location_uuid,u.id::text AS user_uuid,",
        "(SELECT id::text FROM categories c WHERE $4::text IS NOT NULL AND c.code=$4",
        "AND (c.market_id IS NULL OR c.market_id=vb.market_id) ORDER BY c.market_id NULLS LAST LIMIT 1) AS default_category_uuid",
        "FROM vendor_businesses vb",
        "JOIN vendor_locations vl ON (vl.public_id=$2 OR vl.id::text=$2) AND vl.vendor_id=vb.id",
        "JOIN users u ON (u.public_id=$3 OR u.id::text=$3)",
        "WHERE vb.public_id=$1 OR vb.id::text=$1 LIMIT 1"
      ), [vendorId, assignment.locationId, principal.userId, input.defaultCategoryCode?.trim() ?? null]);
      if (refs.rowCount !== 1) throw new Error("Δεν βρέθηκε το ενεργό vendor/location scope.");
      const ref = refs.rows[0];
      const vendorUuid = String(ref.vendor_uuid);
      const marketUuid = String(ref.market_uuid);
      const locationUuid = String(ref.location_uuid);
      const userUuid = String(ref.user_uuid);
      const defaultCategoryUuid = text(ref.default_category_uuid) ?? null;

      const feedParams = [
        marketUuid, vendorUuid, locationUuid, name,
        input.sourceType === "url" ? sourceUrl! : input.sourceFilename!.trim().slice(0, 255),
        interval, JSON.stringify(prepared.preview.mapping), JSON.stringify(input.categoryMapping ?? {}),
        defaultCategoryUuid, userUuid, sourceXmlHash
      ];
      const feedQuery = input.sourceType === "url"
        ? sql(
            "INSERT INTO vendor_product_feeds(market_id,vendor_id,location_id,name,source_type,source_url,status,sync_interval_minutes,",
            "field_mapping,category_mapping,default_category_id,created_by,last_source_hash,last_sync_at,updated_at)",
            "VALUES($1::uuid,$2::uuid,$3::uuid,$4,'url',$5,'active',$6,$7::jsonb,$8::jsonb,$9::uuid,$10::uuid,$11,now(),now())",
            "ON CONFLICT(vendor_id,lower(source_url)) WHERE source_type='url' AND source_url IS NOT NULL DO UPDATE SET",
            "name=EXCLUDED.name,location_id=EXCLUDED.location_id,status=vendor_product_feeds.status,sync_interval_minutes=EXCLUDED.sync_interval_minutes,",
            "field_mapping=EXCLUDED.field_mapping,category_mapping=EXCLUDED.category_mapping,default_category_id=EXCLUDED.default_category_id,",
            "last_source_hash=EXCLUDED.last_source_hash,last_sync_at=now(),last_error=NULL,updated_at=now()",
            "RETURNING id::text,public_id"
          )
        : sql(
            "INSERT INTO vendor_product_feeds(market_id,vendor_id,location_id,name,source_type,source_filename,status,sync_interval_minutes,",
            "field_mapping,category_mapping,default_category_id,created_by,last_source_hash,last_sync_at,updated_at)",
            "VALUES($1::uuid,$2::uuid,$3::uuid,$4,'upload',$5,'completed',$6,$7::jsonb,$8::jsonb,$9::uuid,$10::uuid,$11,now(),now())",
            "RETURNING id::text,public_id"
          );
      const feed = await tx.query<SqlRow>(feedQuery, feedParams);
      const feedUuid = String(feed.rows[0]?.id ?? "");
      const feedPublicId = String(feed.rows[0]?.public_id ?? "");
      if (!feedUuid || !feedPublicId) throw new Error("Το XML feed δεν αποθηκεύτηκε.");

      const run = await tx.query<SqlRow>(sql(
        "INSERT INTO vendor_product_feed_runs(feed_id,market_id,vendor_id,trigger_type,status,source_hash,total_rows,valid_rows,error_rows,created_by)",
        "VALUES($1::uuid,$2::uuid,$3::uuid,$4,'running',$5,$6,$7,$8,$9::uuid) RETURNING id::text,public_id"
      ), [
        feedUuid, marketUuid, vendorUuid, triggerType, sourceXmlHash,
        prepared.preview.totalRows, prepared.preview.validRows, prepared.preview.errorRows, userUuid
      ]);
      const runUuid = String(run.rows[0]?.id ?? "");

      const itemRows = prepared.rows.map((row) => ({
        externalId: row.externalId,
        vendorSku: row.vendorSku ?? null,
        gtin: row.gtin ?? null,
        sourceHash: row.sourceHash,
        payload: row.payload
      }));
      await tx.query(sql(
        "WITH data AS (SELECT * FROM jsonb_to_recordset($1::jsonb)",
        "AS x(\"externalId\" text,\"vendorSku\" text,\"gtin\" text,\"sourceHash\" text,\"payload\" jsonb))",
        "INSERT INTO vendor_product_feed_items(feed_id,vendor_id,external_product_id,vendor_sku,gtin,source_hash,source_payload,state,",
        "consecutive_missing,first_seen_at,last_seen_at,last_changed_at,updated_at)",
        "SELECT $2::uuid,$3::uuid,d.\"externalId\",d.\"vendorSku\",d.\"gtin\",d.\"sourceHash\",d.\"payload\",'present',0,now(),now(),now(),now() FROM data d",
        "ON CONFLICT(feed_id,external_product_id) DO UPDATE SET vendor_sku=EXCLUDED.vendor_sku,gtin=EXCLUDED.gtin,source_payload=EXCLUDED.source_payload,",
        "state='present',consecutive_missing=0,last_validation_errors='[]'::jsonb,last_seen_at=now(),",
        "last_changed_at=CASE WHEN vendor_product_feed_items.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN now() ELSE vendor_product_feed_items.last_changed_at END,",
        "source_hash=EXCLUDED.source_hash,updated_at=now()"
      ), [JSON.stringify(itemRows), feedUuid, vendorUuid]);

      await tx.query(sql(
        "UPDATE vendor_offers vo SET merchant_visible=COALESCE(i.previous_offer_merchant_visible,false),updated_at=now()",
        "FROM vendor_product_feed_items i",
        "WHERE i.feed_id=$1::uuid AND i.state='present' AND i.hidden_by_feed=true AND i.offer_id=vo.id",
        "AND i.hidden_by_feed_at IS NOT NULL AND vo.merchant_visibility_updated_at<=i.hidden_by_feed_at"
      ), [feedUuid]);
      await tx.query(sql(
        "UPDATE vendor_product_feed_items SET hidden_by_feed=false,previous_offer_merchant_visible=NULL,hidden_by_feed_at=NULL,updated_at=now()",
        "WHERE feed_id=$1::uuid AND state='present' AND hidden_by_feed=true"
      ), [feedUuid]);

      let missingRows = 0;
      if (input.sourceType === "url" && prepared.reconciliationSafe) {
        const missing = await tx.query<SqlRow>(sql(
          "UPDATE vendor_product_feed_items SET state='missing',consecutive_missing=consecutive_missing+1,updated_at=now()",
          "WHERE feed_id=$1::uuid AND state IN ('present','missing') AND NOT (external_product_id=ANY($2::text[])) RETURNING id"
        ), [feedUuid, prepared.observedExternalIds]);
        missingRows = missing.rowCount;

        await tx.query(sql(
          "UPDATE vendor_product_feed_items i SET state='retired',hidden_by_feed=true,hidden_by_feed_at=now(),",
          "previous_offer_merchant_visible=vo.merchant_visible,updated_at=now()",
          "FROM vendor_offers vo",
          "WHERE i.feed_id=$1::uuid AND i.state='missing' AND i.consecutive_missing>=2",
          "AND i.offer_id=vo.id AND i.hidden_by_feed=false"
        ), [feedUuid]);
        await tx.query(sql(
          "UPDATE vendor_product_feed_items SET state='retired',updated_at=now()",
          "WHERE feed_id=$1::uuid AND state='missing' AND consecutive_missing>=2"
        ), [feedUuid]);
        await tx.query(sql(
          "UPDATE vendor_offers vo SET merchant_visible=false,updated_at=now()",
          "FROM vendor_product_feed_items i",
          "WHERE i.feed_id=$1::uuid AND i.state='retired' AND i.hidden_by_feed=true AND i.offer_id=vo.id"
        ), [feedUuid]);
        await tx.query(sql(
          "UPDATE inventory_balances ib SET on_hand=ib.active_reservations,source='vendor_feed',",
          "source_confidence='merchant_confirmed',stock_confirmed_at=now(),freshness_status='fresh',updated_at=now()",
          "FROM vendor_product_feed_items i",
          "WHERE i.feed_id=$1::uuid AND i.state='retired' AND i.offer_id=ib.offer_id"
        ), [feedUuid]);
      }

      await tx.query(sql(
        "WITH candidates AS (",
        "SELECT i.id AS item_id,vo.id AS offer_id,vo.canonical_variant_id,",
        "count(*) OVER (PARTITION BY i.id) AS candidate_count,",
        "row_number() OVER (PARTITION BY i.id ORDER BY CASE WHEN i.vendor_sku IS NOT NULL AND vo.vendor_sku=i.vendor_sku THEN 0 ELSE 1 END,vo.id) AS rn",
        "FROM vendor_product_feed_items i",
        "JOIN vendor_offers vo ON vo.vendor_id=i.vendor_id",
        "LEFT JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id",
        "WHERE i.feed_id=$1::uuid AND i.state='present' AND i.offer_id IS NULL",
        "AND ((i.vendor_sku IS NOT NULL AND vo.vendor_sku=i.vendor_sku) OR",
        "(i.gtin IS NOT NULL AND (vo.source_gtin=i.gtin OR cv.gtin=i.gtin))))",
        "UPDATE vendor_product_feed_items i SET offer_id=c.offer_id,canonical_variant_id=c.canonical_variant_id,submission_id=NULL,updated_at=now()",
        "FROM candidates c WHERE i.id=c.item_id AND c.rn=1 AND c.candidate_count=1"
      ), [feedUuid]);

      const changedOffers = await tx.query<SqlRow>(sql(
        "UPDATE vendor_offers vo SET customer_price_minor=(i.source_payload->>'priceMinor')::bigint,customer_price_updated_at=now(),updated_at=now()",
        "FROM vendor_product_feed_items i WHERE i.feed_id=$1::uuid AND i.state='present' AND i.offer_id=vo.id",
        "AND vo.vendor_id=$2::uuid AND vo.customer_price_minor IS DISTINCT FROM (i.source_payload->>'priceMinor')::bigint RETURNING vo.id"
      ), [feedUuid, vendorUuid]);

      const protectedInventory = await tx.query<SqlRow>(sql(
        "SELECT count(*)::integer AS count FROM inventory_balances ib",
        "JOIN vendor_product_feed_items i ON i.offer_id=ib.offer_id",
        "WHERE i.feed_id=$1::uuid AND i.state='present' AND (i.source_payload->>'stockOnHand')::integer<ib.active_reservations"
      ), [feedUuid]);
      const protectedInventoryRows = int(protectedInventory.rows[0]?.count);

      await tx.query(sql(
        "UPDATE inventory_balances ib SET",
        "on_hand=GREATEST((i.source_payload->>'stockOnHand')::integer,ib.active_reservations),",
        "source='vendor_feed',source_confidence='merchant_confirmed',stock_confirmed_at=now(),freshness_status='fresh',updated_at=now()",
        "FROM vendor_product_feed_items i WHERE i.feed_id=$1::uuid AND i.state='present' AND i.offer_id=ib.offer_id"
      ), [feedUuid]);

      // Reuse a pending/manual/CSV submission with the same vendor+location SKU
      // before creating a new feed-owned submission. This preserves the existing
      // catalogue identity instead of tripping the unique vendor SKU constraint.
      await tx.query(sql(
        "UPDATE vendor_product_feed_items i SET submission_id=s.id,updated_at=now()",
        "FROM vendor_product_submissions s",
        "WHERE i.feed_id=$1::uuid AND i.state='present' AND i.offer_id IS NULL AND i.submission_id IS NULL",
        "AND i.vendor_sku IS NOT NULL AND s.vendor_id=$2::uuid AND s.location_id=$3::uuid AND s.vendor_sku=i.vendor_sku"
      ), [feedUuid, vendorUuid, locationUuid]);

      const updatedSubmissions = await tx.query<SqlRow>(sql(
        "UPDATE vendor_product_submissions s SET",
        "vendor_sku=COALESCE(i.vendor_sku,s.vendor_sku),supplier_unit_price_minor=(i.source_payload->>'priceMinor')::bigint,",
        "stock_on_hand=(i.source_payload->>'stockOnHand')::integer,source_payload=i.source_payload||jsonb_build_object('feedId',$2,'feedExternalId',i.external_product_id),",
        "category_id=COALESCE((SELECT c.id FROM categories c WHERE c.code=i.source_payload->>'categoryCode'",
        "AND (c.market_id IS NULL OR c.market_id=$3::uuid) ORDER BY c.market_id NULLS LAST LIMIT 1),s.category_id),updated_at=now()",
        "FROM vendor_product_feed_items i WHERE i.feed_id=$1::uuid AND i.state='present' AND i.offer_id IS NULL",
        "AND i.submission_id=s.id AND s.vendor_id=$4::uuid AND s.status IN ('draft','submitted','needs_review','rejected','linked') RETURNING s.id"
      ), [feedUuid, feedPublicId, marketUuid, vendorUuid]);

      const created = await tx.query<SqlRow>(sql(
        "INSERT INTO vendor_product_submissions(id,public_id,market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,",
        "supplier_unit_price_minor,currency,supplier_tax_rate_bps,stock_on_hand,safety_stock,fulfilment_modes,advice_available,source,source_payload,status,created_by,created_at,updated_at)",
        "SELECT gen_random_uuid(),'vps_'||gen_random_uuid()::text,$2::uuid,$3::uuid,$4::uuid,i.vendor_sku,c.id,",
        "jsonb_strip_nulls(jsonb_build_object('title',i.source_payload->>'title','brand',i.source_payload->>'brand','model',i.source_payload->>'model',",
        "'mpn',i.source_payload->>'mpn','gtin',i.gtin,'condition',COALESCE(i.source_payload->>'condition','new'))),",
        "(i.source_payload->>'priceMinor')::bigint,'EUR',2400,(i.source_payload->>'stockOnHand')::integer,0,ARRAY['pickup']::fulfilment_mode[],true,'api',",
        "i.source_payload||jsonb_build_object('feedId',$5,'feedExternalId',i.external_product_id),'draft',$6::uuid,now(),now()",
        "FROM vendor_product_feed_items i",
        "JOIN LATERAL (SELECT c.id FROM categories c WHERE c.code=i.source_payload->>'categoryCode'",
        "AND (c.market_id IS NULL OR c.market_id=$2::uuid) ORDER BY c.market_id NULLS LAST LIMIT 1) c ON true",
        "WHERE i.feed_id=$1::uuid AND i.state='present' AND i.offer_id IS NULL AND i.submission_id IS NULL",
        "AND (i.vendor_sku IS NULL OR NOT EXISTS (SELECT 1 FROM vendor_product_submissions existing",
        "WHERE existing.vendor_id=$3::uuid AND existing.location_id=$4::uuid AND existing.vendor_sku=i.vendor_sku))",
        "RETURNING id,source_payload->>'feedExternalId' AS external_id"
      ), [feedUuid, marketUuid, vendorUuid, locationUuid, feedPublicId, userUuid]);

      await tx.query(sql(
        "UPDATE vendor_product_feed_items i SET submission_id=s.id,updated_at=now()",
        "FROM vendor_product_submissions s WHERE i.feed_id=$1::uuid AND i.submission_id IS NULL",
        "AND s.vendor_id=$2::uuid AND s.source='api' AND s.source_payload->>'feedId'=$3",
        "AND s.source_payload->>'feedExternalId'=i.external_product_id"
      ), [feedUuid, vendorUuid, feedPublicId]);

      // If a competing/manual import created the same SKU between the pre-check
      // and insert, attach that authoritative row rather than failing the feed.
      await tx.query(sql(
        "UPDATE vendor_product_feed_items i SET submission_id=s.id,updated_at=now()",
        "FROM vendor_product_submissions s",
        "WHERE i.feed_id=$1::uuid AND i.submission_id IS NULL AND i.offer_id IS NULL AND i.vendor_sku IS NOT NULL",
        "AND s.vendor_id=$2::uuid AND s.location_id=$3::uuid AND s.vendor_sku=i.vendor_sku"
      ), [feedUuid, vendorUuid, locationUuid]);

      await tx.query(sql(
        "UPDATE vendor_product_submissions s SET status='submitted',updated_at=now()",
        "FROM vendor_product_feed_items i WHERE i.feed_id=$1::uuid AND i.submission_id=s.id AND s.status='draft'"
      ), [feedUuid]);

      await tx.query(sql(
        "UPDATE vendor_product_feed_items i SET canonical_variant_id=s.canonical_variant_id,updated_at=now()",
        "FROM vendor_product_submissions s WHERE i.feed_id=$1::uuid AND i.submission_id=s.id AND s.canonical_variant_id IS NOT NULL"
      ), [feedUuid]);

      const runStatus = prepared.preview.errorRows > 0 ? "partial" : "completed";
      await tx.query(sql(
        "UPDATE vendor_product_feed_runs SET status=$2,total_rows=$3,valid_rows=$4,error_rows=$5,created_submissions=$6,",
        "updated_submissions=$7,updated_offers=$8,protected_inventory_rows=$9,missing_rows=$10,finished_at=now() WHERE id=$1::uuid"
      ), [
        runUuid, runStatus, prepared.preview.totalRows, prepared.preview.validRows, prepared.preview.errorRows,
        created.rowCount, updatedSubmissions.rowCount, changedOffers.rowCount, protectedInventoryRows, missingRows
      ]);

      await tx.query(sql(
        "UPDATE vendor_product_feeds SET",
        "status=CASE WHEN source_type='url' AND status='paused' THEN 'paused' ELSE $2 END,",
        "product_count=$3,ready_count=$4,error_count=$5,last_source_hash=$6,",
        "last_sync_at=now(),last_success_at=now(),",
        "next_sync_at=CASE WHEN source_type='url' AND status='paused' THEN NULL WHEN $2='active' THEN now()+make_interval(mins=>$7) ELSE NULL END,",
        "last_error=NULL,updated_at=now() WHERE id=$1::uuid"
      ), [
        feedUuid, input.sourceType === "url" ? "active" : "completed",
        prepared.preview.totalRows, prepared.preview.validRows, prepared.preview.errorRows, sourceXmlHash, interval
      ]);

      const finalRun = await tx.query<SqlRow>(sql(
        "SELECT r.public_id,f.public_id AS feed_public_id,r.trigger_type,r.status,r.total_rows,r.valid_rows,r.error_rows,",
        "r.created_submissions,r.updated_submissions,r.updated_offers,r.protected_inventory_rows,r.missing_rows,",
        "r.error_message,r.started_at,r.finished_at FROM vendor_product_feed_runs r",
        "JOIN vendor_product_feeds f ON f.id=r.feed_id WHERE r.id=$1::uuid"
      ), [runUuid]);
      return { feedId: feedPublicId, run: mapRun(finalRun.rows[0] ?? {}) };
    },
    { isolation: "serializable", statementTimeoutMs: 180_000 }
  );

  return { feedId: result.feedId, preview: prepared.preview, run: result.run };
}

export async function syncVendorProductFeed(
  principal: SessionPrincipal,
  feedId: string,
  triggerType: FeedTrigger = "manual"
) {
  const vendorId = requiredVendorId(principal);
  const feed = await uow().withTransaction({ actorUserId: principal.userId, vendorId }, async (tx) => {
    const result = await tx.query<SqlRow>(sql(
      "SELECT f.name,f.source_type,f.source_url,f.sync_interval_minutes,f.field_mapping,f.category_mapping,c.code AS default_category_code",
      "FROM vendor_product_feeds f LEFT JOIN categories c ON c.id=f.default_category_id",
      "WHERE f.public_id=$1 AND f.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1) LIMIT 1"
    ), [feedId, vendorId]);
    if (result.rowCount !== 1) throw new Error("Το XML feed δεν βρέθηκε.");
    return result.rows[0];
  }, { readOnly: true });

  if (String(feed.source_type) !== "url" || !text(feed.source_url)) throw new Error("Μόνο συνδεδεμένο XML URL μπορεί να συγχρονιστεί ξανά.");
  const xml = await fetchVendorXml(text(feed.source_url)!);
  return saveVendorProductFeed(principal, {
    sourceType: "url",
    sourceUrl: text(feed.source_url),
    feedName: String(feed.name),
    syncIntervalMinutes: int(feed.sync_interval_minutes),
    fieldMapping: jsonObject(feed.field_mapping) as VendorXmlFieldMapping,
    categoryMapping: jsonObject(feed.category_mapping) as Record<string, string>,
    defaultCategoryCode: text(feed.default_category_code),
    xml
  }, triggerType);
}

export async function setVendorProductFeedStatus(
  principal: SessionPrincipal,
  feedId: string,
  status: "active" | "paused"
): Promise<VendorProductFeedSummary> {
  const vendorId = requiredVendorId(principal);
  return uow().withTransaction({ actorUserId: principal.userId, vendorId }, async (tx) => {
    const changed = await tx.query<SqlRow>(sql(
      "UPDATE vendor_product_feeds SET status=$3,",
      "next_sync_at=CASE WHEN source_type='url' AND $3='active' THEN now() ELSE NULL END,updated_at=now()",
      "WHERE public_id=$1 AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1) AND source_type='url'",
      "RETURNING public_id,name,source_type,source_url,source_filename,status,sync_interval_minutes,field_mapping,category_mapping,",
      "NULL::text AS default_category_code,product_count,ready_count,error_count,last_sync_at,last_success_at,next_sync_at,last_error,created_at,updated_at"
    ), [feedId, vendorId, status]);
    if (changed.rowCount !== 1) throw new Error("Το XML feed δεν βρέθηκε ή δεν είναι URL feed.");
    return mapFeed(changed.rows[0]);
  });
}

function mapFeed(row: SqlRow): VendorProductFeedSummary {
  return {
    id: String(row.public_id),
    name: String(row.name),
    sourceType: String(row.source_type) as FeedSourceType,
    sourceUrl: text(row.source_url),
    sourceFilename: text(row.source_filename),
    status: String(row.status) as FeedStatus,
    syncIntervalMinutes: int(row.sync_interval_minutes),
    fieldMapping: jsonObject(row.field_mapping) as VendorXmlFieldMapping,
    categoryMapping: jsonObject(row.category_mapping) as Record<string, string>,
    defaultCategoryCode: text(row.default_category_code),
    productCount: int(row.product_count),
    readyCount: int(row.ready_count),
    errorCount: int(row.error_count),
    lastSyncAt: epoch(row.last_sync_at),
    lastSuccessAt: epoch(row.last_success_at),
    nextSyncAt: epoch(row.next_sync_at),
    lastError: text(row.last_error),
    createdAt: epoch(row.created_at) ?? 0,
    updatedAt: epoch(row.updated_at) ?? 0
  };
}

function mapRun(row: SqlRow): VendorProductFeedRun {
  return {
    id: String(row.public_id ?? ""),
    feedId: String(row.feed_public_id ?? ""),
    triggerType: String(row.trigger_type ?? "manual") as FeedTrigger,
    status: String(row.status ?? "failed"),
    totalRows: int(row.total_rows),
    validRows: int(row.valid_rows),
    errorRows: int(row.error_rows),
    createdSubmissions: int(row.created_submissions),
    updatedSubmissions: int(row.updated_submissions),
    updatedOffers: int(row.updated_offers),
    protectedInventoryRows: int(row.protected_inventory_rows),
    missingRows: int(row.missing_rows),
    errorMessage: text(row.error_message),
    startedAt: epoch(row.started_at) ?? 0,
    finishedAt: epoch(row.finished_at)
  };
}
