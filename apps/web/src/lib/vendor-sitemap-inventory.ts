import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { PublicVendorDirectoryEntry, PublicVendorResearchProfile } from "./public-vendor-directory";
import { publicVendorTaxonomies } from "./public-vendor-taxonomy";

type VendorSitemapRow = SqlRow & {
  vendor_id: string;
  vendor_name: string;
  vendor_status: string;
  address_line1?: string | null;
  locality?: string | null;
  postcode?: string | null;
  phone?: string | null;
  public_email?: string | null;
  research_source_kind?: string | null;
  research_source_count?: number | string | null;
  research_source_types?: readonly string[] | null;
  research_major_branch?: string | null;
  research_sub_branch?: string | null;
  research_marketplace_scope?: string | null;
  research_storefront_status?: string | null;
  research_directory_profile?: string | null;
  research_online_shop_url?: string | null;
  research_checked_at?: string | null;
};

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function textArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim())
  )];
}

function fromRow(row: VendorSitemapRow): PublicVendorDirectoryEntry {
  const isPartner = row.vendor_status === "active";
  const addressLine1 = optionalText(row.address_line1);
  const locality = optionalText(row.locality);
  const postcode = optionalText(row.postcode);
  const majorBranch = optionalText(row.research_major_branch);
  const subBranch = optionalText(row.research_sub_branch);
  const research: PublicVendorResearchProfile | undefined = !isPartner
    ? {
        sourceKind: optionalText(row.research_source_kind),
        sourceCount: asCount(row.research_source_count),
        sourceTypes: textArray(row.research_source_types),
        majorBranch,
        subBranch,
        marketplaceScope: optionalText(row.research_marketplace_scope),
        storefrontStatus: optionalText(row.research_storefront_status),
        directoryProfileUrl: optionalText(row.research_directory_profile),
        onlineShopUrl: optionalText(row.research_online_shop_url),
        checkedAt: optionalText(row.research_checked_at)
      }
    : undefined;

  return {
    id: row.vendor_id,
    name: row.vendor_name,
    location: addressLine1 && locality && postcode
      ? {
          name: row.vendor_name,
          addressLine1,
          locality,
          postcode,
          phone: optionalText(row.phone),
          publicEmail: optionalText(row.public_email),
          verified: false
        }
      : undefined,
    categoryCodes: [],
    researchCategory: isPartner ? undefined : subBranch,
    taxonomies: isPartner ? [] : publicVendorTaxonomies({ majorBranch, subBranch, categoryCodes: [] }),
    research,
    canonicalCount: 0,
    directoryStatus: isPartner ? "partner" : "research"
  };
}

async function readVendorSitemapInventory(): Promise<readonly PublicVendorDirectoryEntry[]> {
  if (!productionDatabaseConfigured()) return [];

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, {
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 1_000
  });

  const result = await uow.withTransaction(
    { marketId: "sparta", platformAccess: true },
    (tx) => tx.query<VendorSitemapRow>(`
      WITH primary_location AS MATERIALIZED (
        SELECT DISTINCT ON (vl.vendor_id)
               vl.vendor_id,
               vl.address_line1,
               vl.locality,
               vl.postcode,
               vl.phone,
               vl.public_email
        FROM vendor_locations vl
        WHERE vl.active=true
        ORDER BY vl.vendor_id,
                 vl.is_primary DESC,
                 vl.verified_at DESC NULLS LAST,
                 vl.created_at,
                 vl.id
      ), research_evidence AS MATERIALIZED (
        SELECT source_link.vendor_id,
               count(DISTINCT source_record.id)::integer AS source_count,
               array_agg(DISTINCT source_record.source_type ORDER BY source_record.source_type)
                 FILTER (WHERE source_record.source_type IS NOT NULL) AS source_types
        FROM vendor_research_source_links source_link
        JOIN vendor_research_source_records source_record
          ON source_record.id=source_link.source_id
        GROUP BY source_link.vendor_id
      )
      SELECT v.public_id AS vendor_id,
             v.trading_name AS vendor_name,
             v.status::text AS vendor_status,
             location.address_line1,
             location.locality,
             location.postcode,
             location.phone,
             location.public_email,
             vrp.source_kind AS research_source_kind,
             COALESCE(research_evidence.source_count,0)::integer AS research_source_count,
             COALESCE(research_evidence.source_types,ARRAY[]::text[]) AS research_source_types,
             vrp.major_branch AS research_major_branch,
             vrp.sub_branch AS research_sub_branch,
             vrp.marketplace_scope AS research_marketplace_scope,
             vrp.storefront_status AS research_storefront_status,
             vrp.directory_profile AS research_directory_profile,
             vrp.online_shop_url AS research_online_shop_url,
             vrp.checked_at::text AS research_checked_at
      FROM vendor_businesses v
      JOIN markets m ON m.id=v.market_id
      LEFT JOIN primary_location location ON location.vendor_id=v.id
      LEFT JOIN vendor_research_profiles vrp ON vrp.vendor_id=v.id
      LEFT JOIN research_evidence ON research_evidence.vendor_id=v.id
      WHERE (m.code=$1 OR m.id::text=$1)
        AND v.public_directory_visible=true
        AND (
          v.status='active'
          OR (v.status='invited' AND v.public_id LIKE 'vendor_research_%')
        )
      ORDER BY CASE WHEN v.status='active' THEN 0 ELSE 1 END,
               v.public_id
    `, ["sparta"]),
    { readOnly: true }
  );

  return result.rows.map(fromRow);
}

const cachedVendorSitemapInventory = unstable_cache(
  readVendorSitemapInventory,
  ["seo-vendor-sitemap-inventory-v1"],
  { revalidate: 900 }
);

export async function getPublicVendorSitemapInventory(): Promise<readonly PublicVendorDirectoryEntry[]> {
  return cachedVendorSitemapInventory();
}
