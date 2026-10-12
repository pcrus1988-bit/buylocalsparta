import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getExpansionHubBySlug } from "./expansion-hubs";

export type HubCensusBusiness = Readonly<{
  gemiNumber: string;
  slug: string;
  legalName: string;
  city?: string;
  municipality?: string;
  prefecture?: string;
  postcode?: string;
  category: string;
  sectorCode: string;
  // Only independent, reviewed premise-level geo evidence can produce a pin.
  coordinates?: Readonly<{ latitude: number; longitude: number }>;
  hubSlug: string;
  seoApproved: boolean;
  distanceKm?: number;
  locationBasis: "premise" | "municipality";
  registryVerifiedAt?: string;
  gemiActiveVerified: boolean;
}>;

type HubCensusRow = {
  gemi_number: string;
  public_slug: string;
  legal_name: string;
  city: string | null;
  municipality: string | null;
  prefecture: string | null;
  postcode: string | null;
  sector_code: string | null;
  assigned_hub_slug: string;
  seo_approved: boolean;
  hub_distance_km: number | string | null;
  publication_basis: "premise" | "municipality";
  registry_verified_at: string | null;
  gemi_active_verified: boolean;
  public_latitude: number | null;
  public_longitude: number | null;
};

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  food_groceries: "Τρόφιμα και είδη παντοπωλείου",
  retail_intermediation: "Εμπόριο και εμπορική διαμεσολάβηση",
  automotive_trade: "Αυτοκίνητο και μοτοσικλέτα",
  home_living: "Σπίτι και διακόσμηση",
  fashion_footwear: "Μόδα και υπόδηση",
  other_retail: "Λιανικό εμπόριο",
  diy_building: "Εργαλεία και δομικά υλικά",
  fuel_retail: "Καύσιμα",
  beauty_personal_care: "Ομορφιά και προσωπική φροντίδα",
  sports_books_hobby: "Αθλητισμός, βιβλία και χόμπι",
  pharmacy_medical: "Φαρμακείο και ιατρικά είδη",
  flowers_pets: "Άνθη και κατοικίδια",
  electronics: "Ηλεκτρονικά και τεχνολογία",
  jewellery_watches: "Κοσμήματα και ρολόγια",
  second_hand: "Μεταχειρισμένα είδη",
  other_non_food_retail: "Λοιπό μη διατροφικό εμπόριο"
};

export function hubCensusCategoryOptions(): ReadonlyArray<{ slug: string; label: string }> {
  return Object.entries(CATEGORY_LABELS).map(([slug, label]) => ({ slug, label }));
}

function fromRow(row: HubCensusRow): HubCensusBusiness {
  const distance = row.hub_distance_km === null ? undefined : Number(row.hub_distance_km);
  const latitude = row.public_latitude === null ? NaN : Number(row.public_latitude);
  const longitude = row.public_longitude === null ? NaN : Number(row.public_longitude);
  const hasReviewedPin = Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  return {
    gemiNumber: row.gemi_number,
    slug: row.public_slug,
    legalName: row.legal_name,
    city: row.city || undefined,
    municipality: row.municipality || undefined,
    prefecture: row.prefecture || undefined,
    postcode: row.postcode || undefined,
    category: CATEGORY_LABELS[row.sector_code ?? ""] ?? "Τοπική επιχείρηση",
    sectorCode: row.sector_code ?? "other_retail",
    coordinates: hasReviewedPin ? { latitude, longitude } : undefined,
    hubSlug: row.assigned_hub_slug,
    seoApproved: row.seo_approved === true,
    distanceKm: Number.isFinite(distance) ? distance : undefined,
    locationBasis: row.publication_basis,
    registryVerifiedAt: row.registry_verified_at || undefined,
    gemiActiveVerified: row.gemi_active_verified === true
  };
}

// Registry research listings never compete with a verified active vendor page.
// CLAIM profiles are filtered separately and older approved links redirect.
const ACTIVE_VENDOR_SUPPRESSION =
  " AND NOT EXISTS (SELECT 1 FROM public.vendor_businesses v " +
  " WHERE v.gemi_number=d.gemi_number AND v.status='active' " +
  " AND v.public_directory_visible=true) ";

const DIRECTORY_COLUMNS = [
  "gemi_number", "public_slug", "legal_name", "city", "municipality",
  "prefecture", "postcode", "sector_code",
  "CASE WHEN publication_basis='municipality' THEN directory_hub_slug ELSE assigned_hub_slug END AS assigned_hub_slug",
  "seo_approved", "hub_distance_km", "publication_basis", "registry_verified_at",
  "(registry_verification_ref ~ '^gemi-opendata-active:sha256:[a-f0-9]{64}

// Private, separately approved municipal directory grouping versus exact
// geocoded business assignment. Municipality pages never imply a 25-km radius.
const PUBLIC_HUB_MATCH =
  " ((d.publication_basis='premise' AND d.assigned_hub_slug=$1 AND d.assignment_status='assigned')" +
  " OR (d.publication_basis='municipality' AND d.directory_hub_slug=$1" +
  " AND d.registry_verified_at IS NOT NULL))" +
  " AND d.registry_verified_at IS NOT NULL" +
  " AND d.registry_verification_ref ~ '^gemi-opendata-active:sha256:[a-f0-9]{64}$' ";

/**
 * Public projection from a PRIVATE registry census. Never expose the research
 * contacts, survey answers, suppression records, AFM, or claim applicants.
 * Published census does not imply a verified owner or commercial activity.
 */
export async function listPublicHubCensus(
  hubSlug: string,
  options: Readonly<{ after?: string; q?: string; category?: string; limit?: number }> = {}
): Promise<Readonly<{ items: HubCensusBusiness[]; nextAfter?: string }>> {
  if (!getExpansionHubBySlug(hubSlug) || !productionDatabaseConfigured()) return { items: [] };
  const limit = Math.max(1, Math.min(48, Math.trunc(options.limit ?? 24)));
  const after = options.after && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.after)
    ? options.after.slice(0, 128) : "";
  const query = (options.q ?? "").trim().slice(0, 70);
  const category = options.category && Object.hasOwn(CATEGORY_LABELS, options.category) ? options.category : "";
  const pattern = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
  const result = await getProductionPostgresRuntime().sqlPool.query<HubCensusRow>(
    "SELECT " + DIRECTORY_COLUMNS +
    " FROM research_private.hub_gemi_directory d " +
    " WHERE " + PUBLIC_HUB_MATCH + " " +
    " AND display_status='published' AND public_slug>$2 " +
    " AND ($3='' OR legal_name ILIKE $4 ESCAPE '\\') " +
    " AND ($6='' OR sector_code=$6) " +
    " AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h " +
    " WHERE h.gemi_number=d.gemi_number " +
    " AND h.hub_slug=$1 AND h.plan_code='claim' AND h.status='converted' " +
    " AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL) " +
    ACTIVE_VENDOR_SUPPRESSION +
    " ORDER BY public_slug ASC LIMIT $5",
    [hubSlug, after, query, pattern, limit + 1, category]
  );
  const hasNext = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  return { items: rows.map(fromRow), nextAfter: hasNext ? rows[rows.length - 1]?.public_slug : undefined };
}

export async function getPublicHubCensus(
  hubSlug: string,
  slug: string
): Promise<HubCensusBusiness | undefined> {
  if (!getExpansionHubBySlug(hubSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 128 || !productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<HubCensusRow>(
    "SELECT " + DIRECTORY_COLUMNS +
    " FROM research_private.hub_gemi_directory d " +
    " WHERE " + PUBLIC_HUB_MATCH + " AND public_slug=$2 " +
    " AND display_status='published' " +
    ACTIVE_VENDOR_SUPPRESSION + " LIMIT 1",
    [hubSlug, slug]
  );
  return result.rows[0] ? fromRow(result.rows[0]) : undefined;
}

export function hubCensusBusinessPath(business: HubCensusBusiness): string {
  return "/hubs/" + business.hubSlug + "/business/" + business.slug;
}


/** Preserve old census links after a verified owner activates a CLAIM page. */
export async function convertedClaimUrlForGemiCensus(
  hubSlug: string, slug: string
): Promise<string | undefined> {
  if (!getExpansionHubBySlug(hubSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      !productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<{ public_slug: string }>(
    "SELECT h.public_slug FROM research_private.hub_gemi_directory d " +
    "JOIN public.hub_expansion_prospects h ON h.gemi_number=d.gemi_number " +
    "WHERE " + PUBLIC_HUB_MATCH + " AND d.public_slug=$2 AND d.display_status='published' " +
    "AND h.hub_slug=$1 AND h.plan_code='claim' AND h.status='converted' " +
    "AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL LIMIT 1",
    [hubSlug, slug]
  );
  return result.rows[0]?.public_slug
    ? "/hubs/" + hubSlug + "/business/" + result.rows[0].public_slug : undefined;
}


/** Existing verified sellers take precedence over a public GEMI research profile. */
export async function supersedingPartnerUrlForGemiCensus(
  hubSlug: string, slug: string
): Promise<string | undefined> {
  if (!getExpansionHubBySlug(hubSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 128 || !productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<{ target: string | null }>(
    "SELECT CASE WHEN m.code='sparta' THEN '/vendor/'||v.public_slug " +
    "WHEN h.id IS NOT NULL THEN '/hubs/'||h.hub_slug||'/business/'||v.public_slug " +
    "ELSE NULL END AS target " +
    "FROM research_private.hub_gemi_directory d " +
    "JOIN public.vendor_businesses v ON v.gemi_number=d.gemi_number " +
    "JOIN public.markets m ON m.id=v.market_id " +
    "LEFT JOIN public.hub_expansion_prospects h ON h.vendor_id=v.id " +
    "AND h.hub_slug=$1 AND h.status='converted' " +
    "AND h.plan_code IN ('presence','shop','growth','pro') AND h.owner_user_id IS NOT NULL " +
    "AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=h.owner_user_id " +
    "AND u.status='active' AND u.email_verified_at IS NOT NULL) " +
    "WHERE " + PUBLIC_HUB_MATCH + " AND d.public_slug=$2 AND d.display_status='published' " +
    "AND v.status='active' AND v.public_directory_visible=true " +
    "AND COALESCE(v.demo_mode,false)=false " +
    "AND v.public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' " +
    "ORDER BY (m.code='sparta') DESC LIMIT 1",
    [hubSlug, slug]
  );
  return result.rows[0]?.target ?? undefined;
}


/**
 * Allow the hub-level census directory to enter organic search only when at
 * least ten independently SEO-reviewed business pages exist in that HUB.
 * Individual pages remain governed by the separate seo_approved flag.
 */
export async function hubHasIndexReadyCensus(hubSlug: string): Promise<boolean> {
  if (!getExpansionHubBySlug(hubSlug) || !productionDatabaseConfigured()) return false;
  const result = await getProductionPostgresRuntime().sqlPool.query<{ ready: boolean }>(
    "SELECT count(*) >= 10 AS ready FROM (" +
    "SELECT 1 FROM research_private.hub_gemi_directory d " +
    "WHERE " + PUBLIC_HUB_MATCH + " " +
    "AND d.display_status='published' AND d.seo_approved=true " +
    "AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h " +
    "WHERE h.gemi_number=d.gemi_number AND h.hub_slug=$1 " +
    "AND h.plan_code='claim' AND h.status='converted' " +
    "AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL) " +
    ACTIVE_VENDOR_SUPPRESSION + "LIMIT 10" +
    ") eligible",
    [hubSlug]
  );
  return result.rows[0]?.ready === true;
}


export async function publicHubCensusCategoryCounts(
  hubSlug: string
): Promise<ReadonlyArray<{ slug: string; label: string; count: number }>> {
  if (!getExpansionHubBySlug(hubSlug) || !productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<{ sector_code: string; n: number | string }>(
    "SELECT d.sector_code,count(*)::integer AS n FROM research_private.hub_gemi_directory d " +
    "WHERE " + PUBLIC_HUB_MATCH + " AND d.display_status='published' " +
    "AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h " +
    "WHERE h.gemi_number=d.gemi_number AND h.hub_slug=$1 " +
    "AND h.plan_code='claim' AND h.status='converted' " +
    "AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL) " +
    ACTIVE_VENDOR_SUPPRESSION + "GROUP BY d.sector_code ORDER BY count(*) DESC LIMIT 32",
    [hubSlug]
  );
  return result.rows.filter(row => Object.hasOwn(CATEGORY_LABELS, row.sector_code))
    .map(row => ({ slug: row.sector_code, label: CATEGORY_LABELS[row.sector_code], count: Number(row.n) }));
}

) AS gemi_active_verified",
  "CASE WHEN d.publication_basis='premise' AND d.business_geo_verified_at IS NOT NULL" +
  " AND d.business_geo_reviewed_at IS NOT NULL AND d.business_geo_reviewer_id IS NOT NULL" +
  " AND d.business_geo_evidence_kind IN ('verified_premise_address','verified_registry_address')" +
  " THEN d.latitude ELSE NULL END AS public_latitude",
  "CASE WHEN d.publication_basis='premise' AND d.business_geo_verified_at IS NOT NULL" +
  " AND d.business_geo_reviewed_at IS NOT NULL AND d.business_geo_reviewer_id IS NOT NULL" +
  " AND d.business_geo_evidence_kind IN ('verified_premise_address','verified_registry_address')" +
  " THEN d.longitude ELSE NULL END AS public_longitude"
].join(",");

// Private, separately approved municipal directory grouping versus exact
// geocoded business assignment. Municipality pages never imply a 25-km radius.
const PUBLIC_HUB_MATCH =
  " ((d.publication_basis='premise' AND d.assigned_hub_slug=$1 AND d.assignment_status='assigned')" +
  " OR (d.publication_basis='municipality' AND d.directory_hub_slug=$1" +
  " AND d.registry_verified_at IS NOT NULL))" +
  " AND d.registry_verified_at IS NOT NULL" +
  " AND d.registry_verification_ref ~ '^gemi-opendata-active:sha256:[a-f0-9]{64}$' ";

/**
 * Public projection from a PRIVATE registry census. Never expose the research
 * contacts, survey answers, suppression records, AFM, or claim applicants.
 * Published census does not imply a verified owner or commercial activity.
 */
export async function listPublicHubCensus(
  hubSlug: string,
  options: Readonly<{ after?: string; q?: string; category?: string; limit?: number }> = {}
): Promise<Readonly<{ items: HubCensusBusiness[]; nextAfter?: string }>> {
  if (!getExpansionHubBySlug(hubSlug) || !productionDatabaseConfigured()) return { items: [] };
  const limit = Math.max(1, Math.min(48, Math.trunc(options.limit ?? 24)));
  const after = options.after && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.after)
    ? options.after.slice(0, 128) : "";
  const query = (options.q ?? "").trim().slice(0, 70);
  const category = options.category && Object.hasOwn(CATEGORY_LABELS, options.category) ? options.category : "";
  const pattern = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
  const result = await getProductionPostgresRuntime().sqlPool.query<HubCensusRow>(
    "SELECT " + DIRECTORY_COLUMNS +
    " FROM research_private.hub_gemi_directory d " +
    " WHERE " + PUBLIC_HUB_MATCH + " " +
    " AND display_status='published' AND public_slug>$2 " +
    " AND ($3='' OR legal_name ILIKE $4 ESCAPE '\\') " +
    " AND ($6='' OR sector_code=$6) " +
    " AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h " +
    " WHERE h.gemi_number=d.gemi_number " +
    " AND h.hub_slug=$1 AND h.plan_code='claim' AND h.status='converted' " +
    " AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL) " +
    ACTIVE_VENDOR_SUPPRESSION +
    " ORDER BY public_slug ASC LIMIT $5",
    [hubSlug, after, query, pattern, limit + 1, category]
  );
  const hasNext = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  return { items: rows.map(fromRow), nextAfter: hasNext ? rows[rows.length - 1]?.public_slug : undefined };
}

export async function getPublicHubCensus(
  hubSlug: string,
  slug: string
): Promise<HubCensusBusiness | undefined> {
  if (!getExpansionHubBySlug(hubSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 128 || !productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<HubCensusRow>(
    "SELECT " + DIRECTORY_COLUMNS +
    " FROM research_private.hub_gemi_directory d " +
    " WHERE " + PUBLIC_HUB_MATCH + " AND public_slug=$2 " +
    " AND display_status='published' " +
    ACTIVE_VENDOR_SUPPRESSION + " LIMIT 1",
    [hubSlug, slug]
  );
  return result.rows[0] ? fromRow(result.rows[0]) : undefined;
}

export function hubCensusBusinessPath(business: HubCensusBusiness): string {
  return "/hubs/" + business.hubSlug + "/business/" + business.slug;
}


/** Preserve old census links after a verified owner activates a CLAIM page. */
export async function convertedClaimUrlForGemiCensus(
  hubSlug: string, slug: string
): Promise<string | undefined> {
  if (!getExpansionHubBySlug(hubSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      !productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<{ public_slug: string }>(
    "SELECT h.public_slug FROM research_private.hub_gemi_directory d " +
    "JOIN public.hub_expansion_prospects h ON h.gemi_number=d.gemi_number " +
    "WHERE " + PUBLIC_HUB_MATCH + " AND d.public_slug=$2 AND d.display_status='published' " +
    "AND h.hub_slug=$1 AND h.plan_code='claim' AND h.status='converted' " +
    "AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL LIMIT 1",
    [hubSlug, slug]
  );
  return result.rows[0]?.public_slug
    ? "/hubs/" + hubSlug + "/business/" + result.rows[0].public_slug : undefined;
}


/** Existing verified sellers take precedence over a public GEMI research profile. */
export async function supersedingPartnerUrlForGemiCensus(
  hubSlug: string, slug: string
): Promise<string | undefined> {
  if (!getExpansionHubBySlug(hubSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 128 || !productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<{ target: string | null }>(
    "SELECT CASE WHEN m.code='sparta' THEN '/vendor/'||v.public_slug " +
    "WHEN h.id IS NOT NULL THEN '/hubs/'||h.hub_slug||'/business/'||v.public_slug " +
    "ELSE NULL END AS target " +
    "FROM research_private.hub_gemi_directory d " +
    "JOIN public.vendor_businesses v ON v.gemi_number=d.gemi_number " +
    "JOIN public.markets m ON m.id=v.market_id " +
    "LEFT JOIN public.hub_expansion_prospects h ON h.vendor_id=v.id " +
    "AND h.hub_slug=$1 AND h.status='converted' " +
    "AND h.plan_code IN ('presence','shop','growth','pro') AND h.owner_user_id IS NOT NULL " +
    "AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=h.owner_user_id " +
    "AND u.status='active' AND u.email_verified_at IS NOT NULL) " +
    "WHERE " + PUBLIC_HUB_MATCH + " AND d.public_slug=$2 AND d.display_status='published' " +
    "AND v.status='active' AND v.public_directory_visible=true " +
    "AND COALESCE(v.demo_mode,false)=false " +
    "AND v.public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' " +
    "ORDER BY (m.code='sparta') DESC LIMIT 1",
    [hubSlug, slug]
  );
  return result.rows[0]?.target ?? undefined;
}


/**
 * Allow the hub-level census directory to enter organic search only when at
 * least ten independently SEO-reviewed business pages exist in that HUB.
 * Individual pages remain governed by the separate seo_approved flag.
 */
export async function hubHasIndexReadyCensus(hubSlug: string): Promise<boolean> {
  if (!getExpansionHubBySlug(hubSlug) || !productionDatabaseConfigured()) return false;
  const result = await getProductionPostgresRuntime().sqlPool.query<{ ready: boolean }>(
    "SELECT count(*) >= 10 AS ready FROM (" +
    "SELECT 1 FROM research_private.hub_gemi_directory d " +
    "WHERE " + PUBLIC_HUB_MATCH + " " +
    "AND d.display_status='published' AND d.seo_approved=true " +
    "AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h " +
    "WHERE h.gemi_number=d.gemi_number AND h.hub_slug=$1 " +
    "AND h.plan_code='claim' AND h.status='converted' " +
    "AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL) " +
    ACTIVE_VENDOR_SUPPRESSION + "LIMIT 10" +
    ") eligible",
    [hubSlug]
  );
  return result.rows[0]?.ready === true;
}


export async function publicHubCensusCategoryCounts(
  hubSlug: string
): Promise<ReadonlyArray<{ slug: string; label: string; count: number }>> {
  if (!getExpansionHubBySlug(hubSlug) || !productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<{ sector_code: string; n: number | string }>(
    "SELECT d.sector_code,count(*)::integer AS n FROM research_private.hub_gemi_directory d " +
    "WHERE " + PUBLIC_HUB_MATCH + " AND d.display_status='published' " +
    "AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h " +
    "WHERE h.gemi_number=d.gemi_number AND h.hub_slug=$1 " +
    "AND h.plan_code='claim' AND h.status='converted' " +
    "AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL) " +
    ACTIVE_VENDOR_SUPPRESSION + "GROUP BY d.sector_code ORDER BY count(*) DESC LIMIT 32",
    [hubSlug]
  );
  return result.rows.filter(row => Object.hasOwn(CATEGORY_LABELS, row.sector_code))
    .map(row => ({ slug: row.sector_code, label: CATEGORY_LABELS[row.sector_code], count: Number(row.n) }));
}

