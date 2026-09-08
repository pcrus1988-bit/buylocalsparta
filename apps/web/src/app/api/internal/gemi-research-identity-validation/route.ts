import { createHash } from "node:crypto";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_SHA256 = "56814238c24635db8b1e087e3b2239fa2006416e8f38391cfe04da6630a28535";
const GEMI_BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1";
const SOURCE_TYPE = "gemi_opendata_official";

type ProspectRow = {
  vendor_id: string;
  public_id: string;
  trading_name: string;
  address_line1: string | null;
  locality: string | null;
  postcode: string | null;
  public_email: string | null;
  directory_profile: string | null;
  online_shop_url: string | null;
};

type GemiCompany = {
  arGemi?: string | number;
  afm?: string;
  coNameEl?: string;
  coTitlesEl?: string[];
  municipality?: { id?: string | number; descr?: string };
  prefecture?: { id?: string | number; descr?: string };
  city?: string;
  street?: string;
  streetNumber?: string;
  zipCode?: string;
  email?: string;
  url?: string;
  status?: { id?: string | number; descr?: string };
  legalType?: { id?: string | number; descr?: string };
  [key: string]: unknown;
};

type GemiSearchResponse = {
  searchMetadata?: { totalCount?: number; resultsOffset?: number; resultsSize?: string | number };
  searchResults?: GemiCompany[];
  [key: string]: unknown;
};

type CandidateMatch = {
  company: GemiCompany;
  score: number;
  method: "EMAIL_PLUS_LOCALITY" | "HOST_PLUS_LOCALITY" | "ADDRESS_PLUS_NAME_TOKEN" | "EXACT_NAME_PLUS_POSTCODE" | "NEAR_NAME_PLUS_ADDRESS";
  exactName: boolean;
  nearName: boolean;
  emailMatch: boolean;
  hostMatch: boolean;
  postcodeMatch: boolean;
  streetNumberMatch: boolean;
  addressOverlap: number;
  nameTokenMatches: string[];
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet" } });
}

function authorized(request: Request): boolean {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const digest = createHash("sha256").update(token).digest("hex");
  return digest === TOKEN_SHA256;
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("el-GR")
    .replace(/[^A-ZΑ-Ω0-9]+/g, " ")
    .replace(/\b(ΑΕ|ΑΒΕΕ|ΙΚΕ|ΕΠΕ|ΟΕ|ΕΕ|ΜΟΝΟΠΡΟΣΩΠΗ|ΑΝΩΝΥΜΗ|ΕΤΑΙΡΕΙΑ|ΕΜΠΟΡΙΚΗ|ΒΙΟΤΕΧΝΙΚΗ|ΕΙΣΑΓΩΓΙΚΗ|ΕΞΑΓΩΓΙΚΗ|ΚΑΙ|ΣΙΑ|ΑΦΟΙ|CO|COMPANY|SA|LTD)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeHost(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function addressTokens(value: unknown): Set<string> {
  return new Set(
    normalizeName(value)
      .split(" ")
      .filter((token) => token.length >= 4 && !/^\d+$/.test(token) && !["ΣΠΑΡΤΗ", "ΣΠΑΡΤΗΣ", "ΛΑΚΩΝΙΑ", "ΛΑΚΩΝΙΑΣ"].includes(token))
  );
}

function significantNameTokens(value: unknown): Set<string> {
  return new Set(
    normalizeName(value)
      .split(" ")
      .filter((token) => token.length >= 5 && !/^\d+$/.test(token))
  );
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

function sharedTokens(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((token) => right.has(token)).sort();
}

function companyNames(company: GemiCompany): string[] {
  return [company.coNameEl, ...(Array.isArray(company.coTitlesEl) ? company.coTitlesEl : [])]
    .map(normalizeName)
    .filter(Boolean);
}

function companyAddress(company: GemiCompany): string {
  return [company.street, company.streetNumber].filter(Boolean).join(" ").trim();
}

function streetNumber(value: unknown): string {
  const matches = String(value ?? "").match(/\b\d{1,4}\b/g) ?? [];
  return matches.at(-1) ?? "";
}

function candidateFor(prospect: ProspectRow, companies: GemiCompany[]): CandidateMatch | undefined {
  const wantedName = normalizeName(prospect.trading_name);
  const wantedEmail = normalizeEmail(prospect.public_email);
  const wantedHosts = new Set([normalizeHost(prospect.online_shop_url), normalizeHost(prospect.directory_profile)].filter(Boolean));
  const wantedAddressTokens = addressTokens(prospect.address_line1);
  const wantedNameTokens = significantNameTokens(prospect.trading_name);
  const wantedStreetNumber = streetNumber(prospect.address_line1);

  const ranked = companies.flatMap((company): CandidateMatch[] => {
    const names = companyNames(company);
    if (!names.length) return [];

    const exactName = Boolean(wantedName && names.includes(wantedName));
    const nearName = !exactName && wantedName.length >= 8 && names.some((name) => {
      const shorter = Math.min(name.length, wantedName.length);
      const longer = Math.max(name.length, wantedName.length);
      return shorter / Math.max(1, longer) >= 0.72 && (name.includes(wantedName) || wantedName.includes(name));
    });

    const companyEmail = normalizeEmail(company.email);
    const companyHost = normalizeHost(company.url);
    const emailMatch = Boolean(wantedEmail && companyEmail && wantedEmail === companyEmail);
    const hostMatch = Boolean(companyHost && wantedHosts.has(companyHost));
    const postcodeMatch = Boolean(prospect.postcode && company.zipCode && prospect.postcode.trim() === String(company.zipCode).trim());
    const companyAddressTokens = addressTokens(companyAddress(company));
    const overlap = tokenOverlap(wantedAddressTokens, companyAddressTokens);
    const companyStreetNumber = String(company.streetNumber ?? "").match(/\d{1,4}/)?.[0] ?? streetNumber(companyAddress(company));
    const streetNumberMatch = Boolean(wantedStreetNumber && companyStreetNumber && wantedStreetNumber === companyStreetNumber);
    const companyNameTokens = new Set(names.flatMap((name) => [...significantNameTokens(name)]));
    const nameTokenMatches = sharedTokens(wantedNameTokens, companyNameTokens);
    const addressStrong = overlap >= 0.75 || (streetNumberMatch && overlap >= 0.5);

    let method: CandidateMatch["method"] | undefined;
    let score = 0;

    if (emailMatch && (postcodeMatch || addressStrong)) {
      method = "EMAIL_PLUS_LOCALITY";
      score = addressStrong ? 1 : 0.99;
    } else if (hostMatch && (postcodeMatch || addressStrong)) {
      method = "HOST_PLUS_LOCALITY";
      score = addressStrong ? 0.99 : 0.98;
    } else if (addressStrong && postcodeMatch && nameTokenMatches.length >= 1) {
      method = "ADDRESS_PLUS_NAME_TOKEN";
      score = streetNumberMatch ? 0.97 : 0.95;
    } else if (exactName && postcodeMatch) {
      method = "EXACT_NAME_PLUS_POSTCODE";
      score = 0.95;
    } else if (nearName && addressStrong) {
      method = "NEAR_NAME_PLUS_ADDRESS";
      score = 0.95;
    }

    if (!method) return [];
    return [{
      company,
      score,
      method,
      exactName,
      nearName,
      emailMatch,
      hostMatch,
      postcodeMatch,
      streetNumberMatch,
      addressOverlap: overlap,
      nameTokenMatches
    }];
  }).sort((a, b) => b.score - a.score || String(a.company.arGemi ?? "").localeCompare(String(b.company.arGemi ?? "")));

  const top = ranked[0];
  if (!top) return undefined;
  const second = ranked[1];
  if (second && second.score >= top.score - 0.03) return undefined;
  return top;
}

async function gemiApiKey(): Promise<string | undefined> {
  const direct = process.env.GEMI_OPENDATA_API_KEY?.trim();
  if (direct) return direct;
  const result = await getProductionPostgresRuntime().nativePool.query<{ decrypted_secret: string | null }>(
    "SELECT bls_private.get_gemi_opendata_api_key() AS decrypted_secret"
  );
  return result.rows[0]?.decrypted_secret?.trim() || undefined;
}

async function gemiGet(path: string, params: Record<string, string | number | boolean> = {}) {
  const key = await gemiApiKey();
  if (!key) throw new Error("GEMI credential unavailable");
  const url = new URL(`${GEMI_BASE_URL}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", api_key: key },
      signal: controller.signal,
      cache: "no-store"
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`GEMI HTTP ${response.status}: ${text.slice(0, 180)}`);
    return text ? JSON.parse(text) as unknown : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function unresolvedProspects(): Promise<ProspectRow[]> {
  const result = await getProductionPostgresRuntime().nativePool.query<ProspectRow>(`
    SELECT v.id::text AS vendor_id,
           v.public_id,
           v.trading_name,
           location.address_line1,
           location.locality,
           location.postcode,
           location.public_email,
           vrp.directory_profile,
           vrp.online_shop_url
    FROM vendor_businesses v
    JOIN markets m ON m.id=v.market_id AND m.code='sparta'
    JOIN vendor_research_profiles vrp ON vrp.vendor_id=v.id
    LEFT JOIN LATERAL (
      SELECT vl.address_line1,vl.locality,vl.postcode,vl.public_email
      FROM vendor_locations vl
      WHERE vl.vendor_id=v.id AND vl.active=true
      ORDER BY vl.is_primary DESC,vl.created_at,vl.id
      LIMIT 1
    ) location ON true
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT sr.source_type)::integer AS source_types
      FROM vendor_research_source_links sl
      JOIN vendor_research_source_records sr ON sr.id=sl.source_id
      WHERE sl.vendor_id=v.id
    ) evidence ON true
    WHERE v.status='invited'
      AND v.public_directory_visible=true
      AND v.public_id LIKE 'vendor_research_%'
      AND COALESCE(evidence.source_types,0) < 2
    ORDER BY v.public_id
  `);
  return result.rows;
}

async function persistMatches(matches: Array<{ prospect: ProspectRow; match: CandidateMatch }>) {
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  let linked = 0;
  let collisions = 0;
  try {
    await client.query("BEGIN");
    const market = await client.query<{ id: string }>("SELECT id::text FROM markets WHERE code='sparta' LIMIT 1");
    const marketId = market.rows[0]?.id;
    if (!marketId) throw new Error("Sparta market not found");

    for (const item of matches) {
      const company = item.match.company;
      const arGemi = String(company.arGemi ?? "").replace(/\D/g, "");
      if (!arGemi) continue;
      const sourceUrl = `${GEMI_BASE_URL}/companies/${encodeURIComponent(arGemi)}`;
      const payload = {
        provider: "ΓΕΜΗ OpenData",
        source_url: sourceUrl,
        retrieved_at: new Date().toISOString(),
        match_method: item.match.method,
        score: item.match.score,
        signals: {
          exact_name: item.match.exactName,
          near_name: item.match.nearName,
          email_match: item.match.emailMatch,
          host_match: item.match.hostMatch,
          postcode_match: item.match.postcodeMatch,
          street_number_match: item.match.streetNumberMatch,
          address_overlap: item.match.addressOverlap,
          name_token_matches: item.match.nameTokenMatches
        },
        company: {
          arGemi,
          afm: company.afm ?? null,
          coNameEl: company.coNameEl ?? null,
          coTitlesEl: company.coTitlesEl ?? [],
          municipality: company.municipality ?? null,
          prefecture: company.prefecture ?? null,
          city: company.city ?? null,
          street: company.street ?? null,
          streetNumber: company.streetNumber ?? null,
          zipCode: company.zipCode ?? null,
          status: company.status ?? null,
          legalType: company.legalType ?? null,
          url: company.url ?? null,
          email: company.email ?? null
        }
      };
      const source = await client.query<{ id: string }>(`
        INSERT INTO vendor_research_source_records (market_id,source_type,source_key,title,checked_at,payload)
        VALUES ($1::uuid,$2,$3,$4,current_date,$5::jsonb)
        ON CONFLICT (market_id,source_type,source_key)
        DO UPDATE SET title=EXCLUDED.title,checked_at=EXCLUDED.checked_at,payload=EXCLUDED.payload,updated_at=now()
        RETURNING id::text
      `, [marketId, SOURCE_TYPE, arGemi, company.coNameEl || `ΓΕΜΗ ${arGemi}`, JSON.stringify(payload)]);
      const sourceId = source.rows[0]?.id;
      if (!sourceId) continue;

      const collision = await client.query<{ vendor_id: string }>(`
        SELECT vendor_id::text
        FROM vendor_research_source_links
        WHERE source_id=$1::uuid AND vendor_id<>$2::uuid
        LIMIT 1
      `, [sourceId, item.prospect.vendor_id]);
      if (collision.rows.length) {
        collisions += 1;
        continue;
      }

      const link = await client.query(`
        INSERT INTO vendor_research_source_links (source_id,vendor_id,link_role)
        VALUES ($1::uuid,$2::uuid,'evidence')
        ON CONFLICT (source_id,vendor_id) DO NOTHING
      `, [sourceId, item.prospect.vendor_id]);
      if (link.rowCount) linked += 1;

      await client.query(`
        UPDATE vendor_research_profiles
        SET candidate_gemi=COALESCE(NULLIF(candidate_gemi,''),$2),
            candidate_vat=COALESCE(NULLIF(candidate_vat,''),NULLIF($3,'')),
            candidate_legal_name=COALESCE(NULLIF(candidate_legal_name,''),NULLIF($4,'')),
            gemi_research='Official ΓΕΜΗ OpenData corroboration found via strong identity evidence',
            verification_action='Review official ΓΕΜΗ candidate before legal-field promotion',
            checked_at=current_date,
            updated_at=now()
        WHERE vendor_id=$1::uuid
      `, [item.prospect.vendor_id, arGemi, company.afm ?? "", company.coNameEl ?? ""]);
    }

    await client.query("COMMIT");
    return { linked, collisions };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "production") return json({ error: "not_found" }, 404);
  if (!authorized(request)) return json({ error: "forbidden" }, 403);
  if (!productionDatabaseConfigured()) return json({ error: "database_unavailable" }, 503);

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "status";

  try {
    if (mode === "status") {
      const prospects = await unresolvedProspects();
      const key = await gemiApiKey();
      return json({ mode, unresolved: prospects.length, gemiReady: Boolean(key), environment: process.env.VERCEL_ENV });
    }

    if (mode === "scan-prefecture") {
      const prefecture = url.searchParams.get("prefecture")?.trim();
      if (!prefecture) return json({ error: "prefecture_required" }, 400);
      const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0);
      const commit = url.searchParams.get("commit") === "1";
      const raw = await gemiGet("/companies", {
        prefectures: prefecture,
        isActive: true,
        resultsSortBy: "+coName",
        resultsOffset: offset,
        resultsSize: 200
      }) as GemiSearchResponse;
      const companies = Array.isArray(raw.searchResults) ? raw.searchResults : [];
      const prospects = await unresolvedProspects();
      const matches = prospects.flatMap((prospect) => {
        const match = candidateFor(prospect, companies);
        return match ? [{ prospect, match }] : [];
      });
      const persisted = commit ? await persistMatches(matches) : { linked: 0, collisions: 0 };
      return json({
        mode,
        prefecture,
        offset,
        commit,
        providerTotal: raw.searchMetadata?.totalCount ?? null,
        providerResults: companies.length,
        unresolvedBefore: prospects.length,
        candidateMatches: matches.length,
        linked: persisted.linked,
        collisions: persisted.collisions,
        nextOffset: companies.length === 200 ? offset + 200 : null,
        sample: matches.slice(0, 20).map(({ prospect, match }) => ({
          vendorId: prospect.public_id,
          vendorName: prospect.trading_name,
          vendorAddress: prospect.address_line1,
          vendorEmail: prospect.public_email,
          gemi: String(match.company.arGemi ?? ""),
          gemiName: match.company.coNameEl ?? match.company.coTitlesEl?.[0] ?? null,
          gemiAddress: companyAddress(match.company),
          gemiPostcode: match.company.zipCode ?? null,
          gemiEmail: match.company.email ?? null,
          gemiUrl: match.company.url ?? null,
          method: match.method,
          score: match.score,
          signals: {
            emailMatch: match.emailMatch,
            hostMatch: match.hostMatch,
            postcodeMatch: match.postcodeMatch,
            streetNumberMatch: match.streetNumberMatch,
            addressOverlap: match.addressOverlap,
            nameTokenMatches: match.nameTokenMatches
          }
        }))
      });
    }

    return json({ error: "unknown_mode" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}
