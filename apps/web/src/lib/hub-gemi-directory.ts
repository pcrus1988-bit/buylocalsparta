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
  hubSlug: string;
  seoApproved: boolean;
  distanceKm?: number;
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

function fromRow(row: HubCensusRow): HubCensusBusiness {
  const distance = row.hub_distance_km === null ? undefined : Number(row.hub_distance_km);
  return {
    gemiNumber: row.gemi_number,
    slug: row.public_slug,
    legalName: row.legal_name,
    city: row.city || undefined,
    municipality: row.municipality || undefined,
    prefecture: row.prefecture || undefined,
    postcode: row.postcode || undefined,
    category: CATEGORY_LABELS[row.sector_code ?? ""] ?? "Τοπική επιχείρηση",
    hubSlug: row.assigned_hub_slug,
    seoApproved: row.seo_approved === true,
    distanceKm: Number.isFinite(distance) ? distance : undefined
  };
}

const DIRECTORY_COLUMNS = [
  "gemi_number", "public_slug", "legal_name", "city", "municipality",
  "prefecture", "postcode", "sector_code", "assigned_hub_slug",
  "seo_approved", "hub_distance_km"
].join(",");

/**
 * Public projection from a PRIVATE registry census. Never expose the research
 * contacts, survey answers, suppression records, AFM, or claim applicants.
 * Published census does not imply a verified owner or commercial activity.
 */
export async function listPublicHubCensus(
  hubSlug: string,
  options: Readonly<{ after?: string; q?: string; limit?: number }> = {}
): Promise<Readonly<{ items: HubCensusBusiness[]; nextAfter?: string }>> {
  if (!getExpansionHubBySlug(hubSlug) || !productionDatabaseConfigured()) return { items: [] };
  const limit = Math.max(1, Math.min(48, Math.trunc(options.limit ?? 24)));
  const after = options.after && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.after)
    ? options.after.slice(0, 128) : "";
  const query = (options.q ?? "").trim().slice(0, 70);
  const pattern = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
  const result = await getProductionPostgresRuntime().sqlPool.query<HubCensusRow>(
    "SELECT " + DIRECTORY_COLUMNS +
    " FROM research_private.hub_gemi_directory " +
    " WHERE assigned_hub_slug=$1 AND assignment_status='assigned' " +
    " AND display_status='published' AND public_slug>$2 " +
    " AND ($3='' OR legal_name ILIKE $4 ESCAPE '\\') " +
    " AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h " +
    " WHERE h.gemi_number=research_private.hub_gemi_directory.gemi_number " +
    " AND h.hub_slug=$1 AND h.plan_code='claim' AND h.status='converted' " +
    " AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL) " +
    " ORDER BY public_slug ASC LIMIT $5",
    [hubSlug, after, query, pattern, limit + 1]
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
    " FROM research_private.hub_gemi_directory " +
    " WHERE assigned_hub_slug=$1 AND public_slug=$2 " +
    " AND assignment_status='assigned' AND display_status='published' LIMIT 1",
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
    "WHERE d.assigned_hub_slug=$1 AND d.public_slug=$2 AND d.display_status='published' " +
    "AND h.hub_slug=$1 AND h.plan_code='claim' AND h.status='converted' " +
    "AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL LIMIT 1",
    [hubSlug, slug]
  );
  return result.rows[0]?.public_slug
    ? "/hubs/" + hubSlug + "/business/" + result.rows[0].public_slug : undefined;
}
