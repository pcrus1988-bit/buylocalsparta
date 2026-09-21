import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

type SourceRow = {
  id: string;
  manufacturer: string;
  product_id: string | null;
  source_type: string;
  source_title: string;
  source_url: string;
  document_revision: string | null;
  publication_date: string | null;
  language: string | null;
  page_count: number | null;
  section_heading: string | null;
  retrieved_at: string | null;
  checksum_sha256: string | null;
  content_type: string | null;
  valid_from: string | null;
  metadata: Record<string, unknown> | null;
};

type MonitorConfig = {
  enabled: boolean;
  batchLimit: number;
  officialHosts: string[];
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isOfficialVitexUrl(value: string, officialHosts: string[]): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && officialHosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function getMonitorConfig(): Promise<MonitorConfig | null> {
  const result = await getProductionPostgresRuntime().sqlPool.query<{
    value: {
      enabled?: boolean;
      batchLimit?: number;
      officialHosts?: string[];
    };
  }>(`
    SELECT value
    FROM public.system_settings
    WHERE key='vitex.source_monitor'
    LIMIT 1
  `);

  if (result.rowCount !== 1) return null;
  const value = result.rows[0]?.value ?? {};
  const batchLimit = Number(value.batchLimit);
  return {
    enabled: value.enabled === true,
    batchLimit: Number.isSafeInteger(batchLimit) && batchLimit > 0
      ? Math.min(batchLimit, 4)
      : 4,
    officialHosts: Array.isArray(value.officialHosts)
      ? value.officialHosts.filter((item): item is string => typeof item === "string")
      : ["vitex.gr", "www.vitex.gr"]
  };
}

async function isAuthorized(request: Request): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;

  const token = request.headers.get("x-vitex-source-token")?.trim() ?? "";
  if (!/^[a-f0-9]{96}$/i.test(token)) return false;
  const tokenSha256 = sha256(token);

  const result = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT 1
    FROM public.system_settings
    WHERE key='vitex.source_monitor'
      AND value @> '{"enabled":true}'::jsonb
      AND value->>'tokenSha256'=$1
    LIMIT 1
  `, [tokenSha256]);

  return result.rowCount === 1;
}

async function markAttempt(
  sourceId: string,
  patch: Record<string, unknown>
): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.manufacturer_technical_sources
    SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
    WHERE id=$1
  `, [sourceId, JSON.stringify(patch)]);
}

async function processSource(
  source: SourceRow,
  officialHosts: string[]
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();

  if (!isOfficialVitexUrl(source.source_url, officialHosts)) {
    await markAttempt(source.id, {
      checksum_status: "blocked_non_official_host",
      checksum_last_attempt_at: now
    });
    return { id: source.id, status: "blocked_non_official_host" };
  }

  try {
    const response = await fetch(source.source_url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent": "KONTA-MOU-Vitex-Source-Monitor/1.0",
        "accept": "application/pdf,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`origin_http_${response.status}`);
    }
    if (!isOfficialVitexUrl(response.url, officialHosts)) {
      throw new Error("origin_redirected_non_official_host");
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > 30 * 1024 * 1024) {
      throw new Error("origin_pdf_too_large");
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 30 * 1024 * 1024) {
      throw new Error("origin_pdf_too_large");
    }
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("origin_response_not_pdf");
    }

    const checksum = sha256(bytes);
    const checkedMetadata = {
      ...(source.metadata ?? {}),
      checksum_status: "verified_exact_binary",
      checksum_algorithm: "sha256",
      checksum_last_attempt_at: now,
      checksum_last_checked_at: now,
      content_length_bytes: bytes.byteLength,
      origin_etag: response.headers.get("etag"),
      origin_last_modified: response.headers.get("last-modified"),
      resolved_url: response.url
    };

    if (!source.checksum_sha256) {
      await getProductionPostgresRuntime().sqlPool.query(`
        UPDATE public.manufacturer_technical_sources
        SET checksum_sha256=$2,
            retrieved_at=$3::timestamptz,
            metadata=$4::jsonb
        WHERE id=$1
          AND is_current=true
          AND checksum_sha256 IS NULL
      `, [source.id, checksum, now, JSON.stringify(checkedMetadata)]);

      return { id: source.id, status: "hashed", checksum };
    }

    if (source.checksum_sha256 === checksum) {
      await getProductionPostgresRuntime().sqlPool.query(`
        UPDATE public.manufacturer_technical_sources
        SET retrieved_at=$2::timestamptz,
            metadata=$3::jsonb
        WHERE id=$1
          AND is_current=true
      `, [source.id, now, JSON.stringify(checkedMetadata)]);

      return { id: source.id, status: "unchanged", checksum };
    }

    const client = await getProductionPostgresRuntime().sqlPool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<SourceRow>(`
        SELECT id, manufacturer, product_id, source_type, source_title, source_url,
               document_revision, publication_date, language, page_count, section_heading,
               retrieved_at, checksum_sha256, content_type, valid_from, metadata
        FROM public.manufacturer_technical_sources
        WHERE id=$1 AND is_current=true
        FOR UPDATE
      `, [source.id]);

      if (locked.rowCount !== 1) {
        await client.query("ROLLBACK");
        return { id: source.id, status: "already_superseded" };
      }

      const current = locked.rows[0];
      if (!current.checksum_sha256) {
        await client.query(`
          UPDATE public.manufacturer_technical_sources
          SET checksum_sha256=$2,
              retrieved_at=$3::timestamptz,
              metadata=$4::jsonb
          WHERE id=$1
        `, [current.id, checksum, now, JSON.stringify(checkedMetadata)]);
        await client.query("COMMIT");
        return { id: source.id, status: "hashed_after_lock", checksum };
      }

      if (current.checksum_sha256 === checksum) {
        await client.query(`
          UPDATE public.manufacturer_technical_sources
          SET retrieved_at=$2::timestamptz,
              metadata=$3::jsonb
          WHERE id=$1
        `, [current.id, now, JSON.stringify(checkedMetadata)]);
        await client.query("COMMIT");
        return { id: source.id, status: "unchanged_after_lock", checksum };
      }

      const today = now.slice(0, 10);
      const nextMetadata = {
        ...checkedMetadata,
        checksum_status: "changed_requires_review",
        previous_source_id: current.id,
        previous_checksum_sha256: current.checksum_sha256,
        change_detected_at: now
      };

      const affectedProducts = await client.query<{ product_id: string }>(`
        SELECT DISTINCT product_id
        FROM (
          SELECT $2::uuid AS product_id
          UNION ALL
          SELECT e.product_id
          FROM public.manufacturer_instruction_evidence e
          WHERE e.source_id=$1
            AND e.is_current=true
          UNION ALL
          SELECT a.product_id
          FROM public.manufacturer_application_profiles a
          WHERE a.primary_source_id=$1
            AND a.is_current=true
        ) affected
        WHERE product_id IS NOT NULL
      `, [current.id, current.product_id]);

      const affectedProductIds = affectedProducts.rows.map((row) => row.product_id);

      await client.query(`
        UPDATE public.manufacturer_application_rules r
        SET active=false,
            valid_to=$2::date,
            updated_at=now()
        WHERE r.active=true
          AND r.source_evidence_id IN (
            SELECT e.id
            FROM public.manufacturer_instruction_evidence e
            WHERE e.source_id=$1
              AND e.is_current=true
          )
      `, [current.id, today]);

      await client.query(`
        UPDATE public.manufacturer_surface_compatibility c
        SET is_current=false,
            valid_to=$2::date
        WHERE c.is_current=true
          AND c.source_evidence_id IN (
            SELECT e.id
            FROM public.manufacturer_instruction_evidence e
            WHERE e.source_id=$1
              AND e.is_current=true
          )
      `, [current.id, today]);

      await client.query(`
        UPDATE public.manufacturer_product_compatibility c
        SET is_current=false,
            valid_to=$2::date
        WHERE c.is_current=true
          AND c.source_evidence_id IN (
            SELECT e.id
            FROM public.manufacturer_instruction_evidence e
            WHERE e.source_id=$1
              AND e.is_current=true
          )
      `, [current.id, today]);

      await client.query(`
        UPDATE public.manufacturer_package_sizes p
        SET active=false
        WHERE p.active=true
          AND p.source_evidence_id IN (
            SELECT e.id
            FROM public.manufacturer_instruction_evidence e
            WHERE e.source_id=$1
              AND e.is_current=true
          )
      `, [current.id]);

      await client.query(`
        UPDATE public.manufacturer_instruction_evidence
        SET is_current=false,
            valid_to=$2::date
        WHERE source_id=$1
          AND is_current=true
      `, [current.id, today]);

      if (affectedProductIds.length > 0) {
        await client.query(`
          UPDATE public.manufacturer_application_profiles
          SET verification_status='needs_review',
              last_verified_at=NULL,
              updated_at=now()
          WHERE product_id = ANY($1::uuid[])
            AND is_current=true
            AND verification_status='verified'
        `, [affectedProductIds]);

        await client.query(`
          UPDATE public.manufacturer_products
          SET verification_status='needs_review',
              last_verified_at=NULL,
              updated_at=now()
          WHERE id = ANY($1::uuid[])
            AND verification_status='verified'
        `, [affectedProductIds]);
      }

      await client.query(`
        UPDATE public.manufacturer_systems s
        SET verification_status='needs_review',
            last_verified_at=NULL,
            updated_at=now()
        WHERE s.verification_status='verified'
          AND (
            s.primary_source_id=$1
            OR EXISTS (
              SELECT 1
              FROM public.manufacturer_system_components sc
              JOIN public.manufacturer_instruction_evidence e
                ON e.id=sc.source_evidence_id
              WHERE sc.system_id=s.id
                AND e.source_id=$1
            )
          )
      `, [current.id]);

      await client.query(`
        UPDATE public.manufacturer_technical_sources
        SET is_current=false,
            valid_to=$2::date,
            superseded_by=NULL,
            metadata=COALESCE(metadata,'{}'::jsonb) || $3::jsonb
        WHERE id=$1
      `, [
        current.id,
        today,
        JSON.stringify({
          superseded_due_to_checksum_change_at: now,
          superseded_by_checksum_sha256: checksum
        })
      ]);

      const inserted = await client.query<{ id: string }>(`
        INSERT INTO public.manufacturer_technical_sources
          (manufacturer, product_id, source_type, source_title, source_url,
           document_revision, publication_date, language, page_count, section_heading,
           retrieved_at, checksum_sha256, content_type, valid_from, valid_to,
           is_current, superseded_by, metadata)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12,$13,$14::date,NULL,true,NULL,$15::jsonb)
        RETURNING id
      `, [
        current.manufacturer,
        current.product_id,
        current.source_type,
        current.source_title,
        current.source_url,
        current.document_revision,
        current.publication_date,
        current.language,
        current.page_count,
        current.section_heading,
        now,
        checksum,
        current.content_type,
        today,
        JSON.stringify(nextMetadata)
      ]);

      const nextId = inserted.rows[0]?.id;
      if (!nextId) throw new Error("new_source_version_insert_failed");

      await client.query(`
        UPDATE public.manufacturer_technical_sources
        SET superseded_by=$2
        WHERE id=$1
      `, [current.id, nextId]);

      await client.query("COMMIT");
      return {
        id: source.id,
        status: "changed",
        newSourceId: nextId,
        oldChecksum: current.checksum_sha256,
        newChecksum: checksum
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "source_fetch_failed";
    await markAttempt(source.id, {
      checksum_status: "fetch_failed",
      checksum_last_attempt_at: now,
      checksum_last_error: message
    });
    return { id: source.id, status: "error", error: message };
  }
}

async function run(request: Request): Promise<Response> {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = await getMonitorConfig();
  if (!config?.enabled) {
    return Response.json({ error: "vitex_source_monitor_disabled" }, { status: 503 });
  }

  const url = new URL(request.url);
  const requestedMode = url.searchParams.get("mode");
  const mode = requestedMode === "bootstrap" || requestedMode === "monitor"
    ? requestedMode
    : "auto";
  const requestedLimit = Number(url.searchParams.get("limit") || config.batchLimit);
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, config.batchLimit, 4)
    : config.batchLimit;

  const modePredicate = mode === "bootstrap"
    ? "AND checksum_sha256 IS NULL"
    : mode === "monitor"
      ? "AND checksum_sha256 IS NOT NULL"
      : "";

  const sources = await getProductionPostgresRuntime().sqlPool.query<SourceRow>(`
    SELECT id, manufacturer, product_id, source_type, source_title, source_url,
           document_revision, publication_date, language, page_count, section_heading,
           retrieved_at, checksum_sha256, content_type, valid_from, metadata
    FROM public.manufacturer_technical_sources
    WHERE manufacturer='Vitex'
      AND is_current=true
      AND content_type='application/pdf'
      ${modePredicate}
    ORDER BY
      CASE WHEN checksum_sha256 IS NULL THEN 0 ELSE 1 END,
      COALESCE(
        NULLIF(metadata->>'checksum_last_attempt_at','')::timestamptz,
        retrieved_at,
        created_at
      ) ASC
    LIMIT $1
  `, [limit]);

  const results: Record<string, unknown>[] = [];
  for (let index = 0; index < sources.rows.length; index += 2) {
    const batch = sources.rows.slice(index, index + 2);
    results.push(...await Promise.all(
      batch.map((source) => processSource(source, config.officialHosts))
    ));
  }

  const counts = results.reduce<Record<string, number>>((acc, result) => {
    const status = String(result.status ?? "unknown");
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  console.info(JSON.stringify({
    level: "info",
    event: "vitex.source_checksum_monitor",
    at: new Date().toISOString(),
    mode,
    processed: results.length,
    counts
  }));

  return Response.json(
    { ok: true, mode, processed: results.length, counts, results },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function GET(request: Request) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "vitex_source_monitor_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "vitex.source_checksum_monitor_failed",
      at: new Date().toISOString(),
      message
    }));
    return Response.json(
      { error: message },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
