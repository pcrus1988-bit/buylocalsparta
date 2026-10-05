import { join } from "node:path";
import { loadManifest, loadMigrations, migrationDirectoryFrom, verifyMigrationManifest } from "./migration-lib.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

function usesLocalDatabase(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

const LOOPBACK_SPORT_FIT_STYLE_CODES = [
  "KJ4150", "KJ4189", "JS4403", "IF6748",
  "JR6599", "JR9087", "JQ6920",
  "100001162", "12606-BKRG",
  "12606-TPE", "12606-BBK", "150370-BKRG", "117385-LIL", "117485-BBK", "117731-BBK",
  "IH9808", "KJ1750", "KJ1757",
  "81-16073-01", "81-19103", "81-19109", "81-1981-51", "81-1981-52", "82-16143-01", "82-16143-02", "82-19109",
  "JH6911", "JP6592", "JR4007",
  "JD9571", "KB5970",
  "JE2774", "JP3389", "JV6067",
  "KJ0410", "KJ0411",
  "IH1838", "KJ4808", "KJ6635"
] as const;

async function seedLoopbackSportFitCatalogueIdentities(client: any): Promise<void> {
  // Migrations 0308+ contain immutable, production-data enrichment assertions:
  // each verified supplier/manufacturer style must resolve to exactly one live
  // canonical family. Hosted production already has those catalogue identities,
  // but a fresh plain-Postgres CI database intentionally has no commerce data.
  //
  // Give loopback migration replay the minimal non-commerce identity topology
  // needed to exercise those migrations without weakening their assertions or
  // changing registered migration checksums. No vendor offers or inventory are
  // created, so these fixtures can never become storefront-sellable test items.
  await client.query(
    `
      DO $sport_fit_ci$
      DECLARE
        v_market_id uuid;
        v_category_id uuid;
        v_brand_id uuid;
        v_family_id uuid;
        v_style_code text;
        v_slug text;
      BEGIN
        INSERT INTO public.markets(code,name,country_code,currency,timezone,default_locale)
        VALUES ('__sport_fit_ci__','Sport & Fit CI','GR','EUR','Europe/Athens','el')
        ON CONFLICT (code) DO NOTHING;

        SELECT id INTO v_market_id
        FROM public.markets
        WHERE code='__sport_fit_ci__';

        INSERT INTO public.categories(
          market_id,code,slug,taxonomy_role,assignable,discoverable,sort_order,active
        )
        VALUES (
          v_market_id,'sport_fit_ci','sport-fit-ci','product_class',true,false,9999,true
        )
        ON CONFLICT (market_id,slug) DO NOTHING;

        SELECT id INTO v_category_id
        FROM public.categories
        WHERE market_id=v_market_id AND slug='sport-fit-ci';

        INSERT INTO public.brands(name,normalized_name)
        VALUES ('Sport Fit CI','sport fit ci')
        ON CONFLICT (normalized_name) DO NOTHING;

        SELECT id INTO v_brand_id
        FROM public.brands
        WHERE normalized_name='sport fit ci';

        FOREACH v_style_code IN ARRAY ARRAY[${LOOPBACK_SPORT_FIT_STYLE_CODES.map((code) => `'${code}'`).join(",")} ]::text[]
        LOOP
          v_family_id := NULL;

          SELECT cv.family_id INTO v_family_id
          FROM public.canonical_variants cv
          JOIN public.product_families pf ON pf.id=cv.family_id
          WHERE cv.market_id=v_market_id
            AND cv.active=true
            AND pf.active=true
            AND (
              upper(coalesce(nullif(btrim(cv.mpn),''),''))=upper(v_style_code)
              OR upper(coalesce(cv.slug,'')) LIKE '%' || upper(v_style_code) || '%'
              OR upper(replace(coalesce(cv.slug,''),'_','-')) LIKE '%' || upper(v_style_code) || '%'
            )
          ORDER BY cv.created_at
          LIMIT 1;

          IF v_family_id IS NULL THEN
            INSERT INTO public.product_families(
              market_id,brand_id,category_id,model,active,created_at,updated_at
            )
            VALUES (
              v_market_id,v_brand_id,v_category_id,'CI ' || v_style_code,true,now(),now()
            )
            RETURNING id INTO v_family_id;

            v_slug := 'sport-fit-ci-' || lower(regexp_replace(v_style_code,'[^a-zA-Z0-9]+','-','g'));

            INSERT INTO public.canonical_variants(
              market_id,family_id,brand_id,category_id,slug,mpn,model,condition,
              variant_attributes,platform_price_minor,currency,tax_rate_bps,
              active,suppressed,recalled,created_at,updated_at
            )
            VALUES (
              v_market_id,v_family_id,v_brand_id,v_category_id,v_slug,v_style_code,'CI ' || v_style_code,'new',
              '{}'::jsonb,1,'EUR',2400,
              true,false,false,now(),now()
            );
          END IF;
        END LOOP;
      END
      $sport_fit_ci$;
    `
  );
}

let pgModule: any;
try {
  pgModule = await import("pg");
} catch {
  throw new Error("PostgreSQL driver 'pg' is not installed. Install workspace dependencies before running db:migrate.");
}
const Pool = pgModule.Pool ?? pgModule.default?.Pool;
if (!Pool) throw new Error("Unable to load pg.Pool");

const directory = migrationDirectoryFrom(import.meta.url);
const migrations = await loadMigrations(directory);
const manifest = await loadManifest(join(directory, "checksums.json"));
verifyMigrationManifest(migrations, manifest);

const pool = new Pool({ connectionString, max: 2, application_name: "buy-local-sparta-migrator" });
try {
  const client = await pool.connect();
  try {
    // CI and local development use plain PostgreSQL/PostGIS rather than a full
    // Supabase stack. Keep the production migration immutable while providing
    // only the minimal Storage topology it references. This is intentionally
    // restricted to loopback hosts and can never bootstrap a remote database.
    if (usesLocalDatabase(connectionString)) {
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS storage;
        CREATE TABLE IF NOT EXISTS storage.buckets (
          id text PRIMARY KEY,
          name text NOT NULL UNIQUE,
          public boolean NOT NULL DEFAULT false,
          file_size_limit bigint,
          allowed_mime_types text[]
        )
      `);

      // Migration 0294 indexes the live dropship family projection, which is
      // provisioned by the hosted Supabase schema rather than the plain
      // PostgreSQL migration chain. Give loopback CI the minimal relation
      // shape required to validate immutable migrations without altering the
      // production migration or its registered checksum.
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS bls_private;
        CREATE TABLE IF NOT EXISTS bls_private.storefront_dropship_live_family (
          supplier_id uuid NOT NULL,
          external_product_id text NOT NULL,
          newest_at timestamptz,
          available_until timestamptz,
          min_price_minor bigint,
          sellable boolean NOT NULL DEFAULT false
        )
      `);

      // Hosted Supabase always provides the postgres role. Some migrations grant
      // narrowly scoped runtime privileges to that role, while the plain PostGIS
      // CI image initializes under the configured application user instead.
      // Create a non-login compatibility role only on loopback databases so the
      // immutable production migrations execute under the same role topology.
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
            CREATE ROLE postgres NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          END IF;
        END
        $$;
      `);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        filename text NOT NULL UNIQUE,
        sha256 char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query("SELECT version, filename, sha256 FROM schema_migrations ORDER BY version");
    const byVersion = new Map<number, { filename: string; sha256: string }>(applied.rows.map((row: any) => [Number(row.version), { filename: row.filename, sha256: row.sha256 }]));

    let loopbackSportFitSeeded = false;

    for (const migration of migrations) {
      const existing = byVersion.get(migration.version);
      if (existing) {
        if (existing.filename !== migration.filename || existing.sha256 !== migration.sha256) {
          throw new Error(`Applied migration ${migration.version} does not match repository checksum`);
        }
        console.log(`skip ${migration.filename}`);
        continue;
      }
      if (usesLocalDatabase(connectionString) && !loopbackSportFitSeeded && migration.version >= 308) {
        await seedLoopbackSportFitCatalogueIdentities(client);
        loopbackSportFitSeeded = true;
      }

      console.log(`apply ${migration.filename}`);
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('buy_local_sparta_schema_migrations'))");
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations(version, filename, sha256) VALUES ($1, $2, $3)",
          [migration.version, migration.filename, migration.sha256]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
