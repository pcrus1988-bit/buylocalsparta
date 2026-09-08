import { createHash } from "node:crypto";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_SHA256 = "20707245ca4586dd6f752013a5d0fea04a65c34651fffa539bc91c7176a5bcb6";
const GEMI_BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1";
const SOURCE_TYPE = "gemi_opendata_official";

const NAME_STOPWORDS = new Set([
  "ΑΕ", "ΑΒΕΕ", "ΙΚΕ", "ΕΠΕ", "ΟΕ", "ΕΕ", "ΜΟΝΟΠΡΟΣΩΠΗ", "ΜΟΝΟΠΡΟΣΩΠΟΣ",
  "ΑΝΩΝΥΜΗ", "ΕΤΑΙΡΕΙΑ", "ΕΤΑΙΡΙΑ", "ΕΜΠΟΡΙΚΗ", "ΒΙΟΤΕΧΝΙΚΗ", "ΕΙΣΑΓΩΓΙΚΗ",
  "ΕΞΑΓΩΓΙΚΗ", "ΙΔΙΩΤΙΚΗ", "ΕΠΙΧΕΙΡΗΣΗ", "ΥΠΗΡΕΣΙΩΝ", "ΠΑΡΟΧΗΣ", "ΚΑΙ", "ΣΙΑ",
  "ΑΦΟΙ", "ΑΦΩΝ", "CO", "COMPANY", "SA", "LTD", "MARKET", "STORE", "SHOP"
]);

const ADDRESS_STOPWORDS = new Set([
  "ΣΠΑΡΤΗ", "ΣΠΑΡΤΗΣ", "ΛΑΚΩΝΙΑ", "ΛΑΚΩΝΙΑΣ", "ΕΛΛΑΔΑ", "ΟΔΟΣ", "ΟΔΟΥ", "ΕΘΝΙΚΗ",
  "ΕΘΝΙΚΗΣ", "ΕΠΑΡΧΙΑΚΗ", "ΕΠΑΡΧΙΑΚΗΣ", "ΧΛΜ", "ΧΙΛΙΟΜΕΤΡΟ", "ΧΙΛΙΟΜΕΤΡΟΥ"
]);

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

type MatchMethod =
  | "EMAIL_PLUS_POSTCODE"
  | "HOST_PLUS_POSTCODE"
  | "EXACT_IDENTITY_NAME_PLUS_POSTCODE"
  | "DISTINCTIVE_NAME_PAIR_PLUS_ADDRESS"
  | "DISTINCTIVE_NAME_PLUS_NUMBERED_ADDRESS"
  | "NEAR_NAME_PLUS_NUMBERED_ADDRESS";

type CandidateMatch = {
  company: GemiCompany;
  score: number;
  method: MatchMethod;
  emailMatch: boolean;
  hostMatch: boolean;
  postcodeMatch: boolean;
  streetNumberMatch: boolean;
  addressOverlap: number;
  sharedNameTokens: string[];
  exactIdentityName: boolean;
  nearIdentityName: boolean;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet"
    }
  });
}

function authorized(request: Request): boolean {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return createHash("sha256").update(token).digest("hex") === TOKEN_SHA256;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("el-GR")
    .replace(/[^A-ZΑ-Ω0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: unknown, stopwords: Set<string>, minLength = 4): Set<string> {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= minLength && !/^\d+$/.test(token) && !stopwords.has(token))
  );
}

function identityName(value: unknown): string {
  return [...tokenSet(value, NAME_STOPWORDS, 3)].join(" ");
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

function companyNames(company: GemiCompany): string[] {
  return [company.coNameEl, ...(Array.isArray(company.coTitlesEl) ? company.coTitlesEl : [])]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function companyAddress(company: GemiCompany): string {
  return [company.street, company.streetNumber].filter(Boolean).join(" ").trim();
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

function intersection(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((token) => right.has(token)).sort();
}

function finalStreetNumber(value: unknown): string {
  const values = String(value ?? "").match(/\b\d{1,4}\b/g) ?? [];
  return values.at(-1) ?? "";
}

function candidateFor(prospect: ProspectRow, companies: GemiCompany[]): CandidateMatch | undefined {
  const prospectIdentity = identityName(prospect.trading_name);
  const prospectNameTokens = tokenSet(prospect.trading_name, NAME_STOPWORDS, 4);
  const prospectAddressTokens = tokenSet(prospect.address_line1, ADDRESS_STOPWORDS, 4);
  const prospectNumber = finalStreetNumber(prospect.address_line1);
  const prospectEmail = normalizeEmail(prospect.public_email);
  const prospectHosts = new Set([normalizeHost(prospect.online_shop_url)].filter(Boolean));

  const ranked = companies.flatMap((company): CandidateMatch[] => {
    const names = companyNames(company);
    if (!names.length) return [];

    const companyIdentities = names.map(identityName).filter(Boolean);
    const companyNameTokens = new Set(names.flatMap((name) => [...tokenSet(name, NAME_STOPWORDS, 4)]));
    const sharedNameTokens = intersection(prospectNameTokens, companyNameTokens);
    const exactIdentityName = Boolean(prospectIdentity && companyIdentities.includes(prospectIdentity));
    const nearIdentityName = !exactIdentityName && Boolean(prospectIdentity) && companyIdentities.some((name) => {
      const shorter = Math.min(name.length, prospectIdentity.length);
      const longer = Math.max(name.length, prospectIdentity.length);
      return shorter >= 7 && shorter / Math.max(1, longer) >= 0.78 && (name.includes(prospectIdentity) || prospectIdentity.includes(name));
    });

    const emailMatch = Boolean(prospectEmail && normalizeEmail(company.email) === prospectEmail);
    const companyHost = normalizeHost(company.url);
    const hostMatch = Boolean(companyHost && prospectHosts.has(companyHost));
    const postcodeMatch = Boolean(prospect.postcode && company.zipCode && prospect.postcode.trim() === String(company.zipCode).trim());

    const companyAddressTokens = tokenSet(companyAddress(company), ADDRESS_STOPWORDS, 4);
    const addressOverlap = overlap(prospectAddressTokens, companyAddressTokens);
    const companyNumber = String(company.streetNumber ?? "").match(/\d{1,4}/)?.[0] ?? finalStreetNumber(companyAddress(company));
    const streetNumberMatch = Boolean(prospectNumber && companyNumber && prospectNumber === companyNumber);
    const numberedAddress = streetNumberMatch && addressOverlap >= 0.5;
    const distinctivePair = sharedNameTokens.length >= 2;
    const oneStrongDistinctiveName = sharedNameTokens.some((token) => token.length >= 7);

    let method: MatchMethod | undefined;
    let score = 0;

    if (emailMatch && postcodeMatch) {
      method = "EMAIL_PLUS_POSTCODE";
      score = 1;
    } else if (hostMatch && postcodeMatch) {
      method = "HOST_PLUS_POSTCODE";
      score = 0.99;
    } else if (exactIdentityName && postcodeMatch) {
      method = "EXACT_IDENTITY_NAME_PLUS_POSTCODE";
      score = 0.98;
    } else if (distinctivePair && postcodeMatch && addressOverlap >= 0.5) {
      method = "DISTINCTIVE_NAME_PAIR_PLUS_ADDRESS";
      score = streetNumberMatch ? 0.99 : 0.97;
    } else if (oneStrongDistinctiveName && postcodeMatch && numberedAddress) {
      method = "DISTINCTIVE_NAME_PLUS_NUMBERED_ADDRESS";
      score = 0.97;
    } else if (nearIdentityName && postcodeMatch && numberedAddress) {
      method = "NEAR_NAME_PLUS_NUMBERED_ADDRESS";
      score = 0.96;
    }

    if (!method) return [];
    return [{
      company,
      score,
      method,
      emailMatch,
      hostMatch,
      postcodeMatch,
      streetNumberMatch,
      addressOverlap,
      sharedNameTokens,
      exactIdentityName,
      nearIdentityName
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
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", api_key: key },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GEMI HTTP ${response.status}: ${text.slice(0, 180)}`);
  return text ? JSON.parse(text) as unknown : {};
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
  const client = await getProductionPostgresRuntime().nativePool.connect();
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

      const payload = {
        provider: "ΓΕΜΗ OpenData",
        source_url: `${GEMI_BASE_URL}/companies/${encodeURIComponent(arGemi)}`,
        retrieved_at: new Date().toISOString(),
        match_method: item.match.method,
        score: item.match.score,
        signals: {
          email_match: item.match.emailMatch,
          host_match: item.match.hostMatch,
          postcode_match: item.match.postcodeMatch,
          street_number_match: item.match.streetNumberMatch,
          address_overlap: item.match.addressOverlap,
          shared_name_tokens: item.match.sharedNameTokens,
          exact_identity_name: item.match.exactIdentityName,
          near_identity_name: item.match.nearIdentityName
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

      const collision = await client.query(`
        SELECT 1 FROM vendor_research_source_links
        WHERE source_id=$1::uuid AND vendor_id<>$2::uuid LIMIT 1
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
            gemi_research='Official ΓΕΜΗ OpenData corroboration found via precision identity evidence',
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
      return json({ mode, unresolved: prospects.length, gemiReady: Boolean(await gemiApiKey()) });
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
        sample: matches.slice(0, 25).map(({ prospect, match }) => ({
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
            sharedNameTokens: match.sharedNameTokens,
            exactIdentityName: match.exactIdentityName,
            nearIdentityName: match.nearIdentityName
          }
        }))
      });
    }

    return json({ error: "unknown_mode" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}
