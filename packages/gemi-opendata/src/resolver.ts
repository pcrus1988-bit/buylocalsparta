import { GemiOpenDataClient, normalizeAfm, normalizeGemiNumber, type GemiCompany } from "./client.ts";

export const GEMI_VERIFICATION_STATUSES = [
  "PENDING_GEMI_OPENDATA",
  "SEARCHED",
  "CANDIDATE_MATCH",
  "VERIFIED_GEMI_OPENDATA",
  "NO_MATCH",
  "AMBIGUOUS_MATCH",
  "API_RETRY",
  "MANUAL_REVIEW"
] as const;
export type GemiVerificationStatus = typeof GEMI_VERIFICATION_STATUSES[number];

export type GemiProspectIdentity = Readonly<{
  prospectId: string;
  businessName: string;
  legalName?: string;
  gemiNumber?: string;
  afm?: string;
  town?: string;
  prefecture?: string;
}>;

export type GemiOfficialProvenance = Readonly<{
  sourceType: "GEMI_OPENDATA_OFFICIAL";
  sourceUrl: string;
  retrievedAt: string;
  matchMethod: "GEMI_EXACT" | "AFM_EXACT" | "NAME_CANDIDATE";
  matchRationale: string;
}>;

export type GemiResolution = Readonly<{
  status: GemiVerificationStatus;
  company?: GemiCompany;
  candidates?: readonly GemiCompany[];
  provenance?: GemiOfficialProvenance;
  notes: string;
}>;

export async function resolveProspectWithGemi(
  client: GemiOpenDataClient,
  prospect: GemiProspectIdentity,
  options: { retrievedAt?: string; signal?: AbortSignal } = {}
): Promise<GemiResolution> {
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  const gemi = normalizeGemiNumber(prospect.gemiNumber);
  if (gemi) {
    try {
      const company = await client.getCompany(gemi, options.signal);
      if (normalizeGemiNumber(company.arGemi) !== gemi) {
        return { status: "MANUAL_REVIEW", company, notes: "Official GEMI detail response did not preserve the requested GEMI identifier exactly." };
      }
      return verified(company, retrievedAt, "GEMI_EXACT", `Exact official GEMI lookup matched ${gemi}.`);
    } catch (error) {
      return failureResolution(error, `Official GEMI lookup failed for supplied GEMI ${gemi}.`);
    }
  }

  const afm = normalizeAfm(prospect.afm);
  if (afm) {
    try {
      const response = await client.searchCompanies({ afm, resultsSize: 25 }, options.signal);
      const exact = (response.searchResults ?? []).filter((company) => normalizeAfm(company.afm) === afm);
      if (exact.length === 1) return verified(exact[0]!, retrievedAt, "AFM_EXACT", `Exact official AFM search matched ${afm}.`);
      if (exact.length > 1) return { status: "AMBIGUOUS_MATCH", candidates: exact, notes: `Official AFM search returned ${exact.length} exact records; automatic legal-entity promotion blocked.` };
      return { status: "NO_MATCH", candidates: response.searchResults ?? [], notes: `No exact official GEMI record matched AFM ${afm}.` };
    } catch (error) {
      return failureResolution(error, `Official GEMI search failed for supplied AFM ${afm}.`);
    }
  }

  const name = searchName(prospect.legalName || prospect.businessName);
  if (!name) return { status: "MANUAL_REVIEW", notes: "No usable GEMI, AFM or business name is available for official matching." };

  try {
    const response = await client.searchCompanies({ name, resultsSize: 25 }, options.signal);
    const candidates = response.searchResults ?? [];
    if (!candidates.length) return { status: "NO_MATCH", candidates, notes: `Official GEMI name search returned no candidates for “${name}”.` };
    const ranked = rankNameCandidates(prospect, candidates);
    const top = ranked[0];
    if (!top) return { status: "NO_MATCH", candidates, notes: `Official GEMI name search returned no rankable candidates for “${name}”.` };
    const second = ranked[1];
    const uniqueStrongCandidate = top.score >= 0.8 && (!second || top.score - second.score >= 0.2);
    if (!uniqueStrongCandidate) {
      return { status: candidates.length > 1 ? "AMBIGUOUS_MATCH" : "CANDIDATE_MATCH", candidates: ranked.map((entry) => entry.company), notes: "Name-only matching is not authoritative enough for automatic legal-field promotion; manual identity review is required." };
    }
    return {
      status: "CANDIDATE_MATCH",
      company: top.company,
      candidates: ranked.map((entry) => entry.company),
      provenance: provenance(top.company, retrievedAt, "NAME_CANDIDATE", `Strong name/geography candidate score ${top.score.toFixed(2)}; manual confirmation required.`),
      notes: "Strong official GEMI candidate found, but no canonical identifier was available. Legal fields must not be promoted automatically."
    };
  } catch (error) {
    return failureResolution(error, `Official GEMI name search failed for “${name}”.`);
  }
}

function verified(company: GemiCompany, retrievedAt: string, method: GemiOfficialProvenance["matchMethod"], rationale: string): GemiResolution {
  return {
    status: "VERIFIED_GEMI_OPENDATA",
    company,
    provenance: provenance(company, retrievedAt, method, rationale),
    notes: `${rationale} Storefront evidence remains independent from this legal-entity record.`
  };
}

function provenance(company: GemiCompany, retrievedAt: string, method: GemiOfficialProvenance["matchMethod"], rationale: string): GemiOfficialProvenance {
  return {
    sourceType: "GEMI_OPENDATA_OFFICIAL",
    sourceUrl: `https://opendata-api.businessportal.gr/api/opendata/v1/companies/${encodeURIComponent(String(company.arGemi))}`,
    retrievedAt,
    matchMethod: method,
    matchRationale: rationale
  };
}

function failureResolution(error: unknown, prefix: string): GemiResolution {
  const retryable = typeof error === "object" && error !== null && "retryable" in error && (error as { retryable?: unknown }).retryable === true;
  return {
    status: retryable ? "API_RETRY" : "MANUAL_REVIEW",
    notes: `${prefix} ${error instanceof Error ? error.message : String(error)}`
  };
}

function searchName(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length >= 3 ? normalized : undefined;
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("el-GR")
    .replace(/[^A-ZΑ-Ω0-9]+/g, " ")
    .replace(/\b(ΑΕ|ΑΒΕΕ|ΙΚΕ|ΕΠΕ|ΟΕ|ΕΕ|ΜΟΝΟΠΡΟΣΩΠΗ|ΑΝΩΝΥΜΗ|ΕΤΑΙΡΕΙΑ|ΚΑΙ|ΣΙΑ)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rankNameCandidates(prospect: GemiProspectIdentity, companies: readonly GemiCompany[]): readonly { company: GemiCompany; score: number }[] {
  const desiredNames = [prospect.legalName, prospect.businessName].filter(Boolean).map(normalizeName).filter(Boolean);
  const desiredTown = normalizeName(prospect.town);
  const desiredPrefecture = normalizeName(prospect.prefecture);
  return companies
    .map((company) => {
      const companyNames = [company.coNameEl, ...(company.coTitlesEl ?? [])].map(normalizeName).filter(Boolean);
      let score = 0;
      if (desiredNames.some((wanted) => companyNames.includes(wanted))) score += 0.65;
      else if (desiredNames.some((wanted) => companyNames.some((candidate) => candidate.includes(wanted) || wanted.includes(candidate)))) score += 0.45;
      if (desiredTown && [company.city, company.municipality?.descr].map(normalizeName).includes(desiredTown)) score += 0.2;
      if (desiredPrefecture && normalizeName(company.prefecture?.descr) === desiredPrefecture) score += 0.15;
      return { company, score: Math.min(1, score) };
    })
    .sort((a, b) => b.score - a.score || String(a.company.arGemi).localeCompare(String(b.company.arGemi)));
}
