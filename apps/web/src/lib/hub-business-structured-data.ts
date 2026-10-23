/**
 * Structured-data projection for real HUB business dossiers.
 * Avoid turning municipality-only GEMI records into imaginary physical stores.
 * No query, contact lookup, or private information is performed here.
 */
export type HubBusinessSchemaInput = Readonly<{
  url: string;
  name: string;
  kind: "claimed" | "verified_partner" | "unclaimed_registry";
  category?: string;
  description?: string;
  city?: string;
  region?: string;
  addressLine?: string;
  postcode?: string;
  telephone?: string;
  website?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  gemiNumber?: string;
  reviewedAt?: string;
  officialRegistryUrl?: string;
}>;

const ORIGIN = "https://kontamou.site";
const clean = (v?: string): string | undefined => {
  const s = v?.trim();
  return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined" ? s : undefined;
};

function externalHttps(value?: string): string | undefined {
  try {
    const v = clean(value);
    if (!v) return undefined;
    const url = new URL(v);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash
      ? url.toString() : undefined;
  } catch { return undefined; }
}

function canonicalUrl(value: string): string {
  const parsed = new URL(value, `${ORIGIN}/`);
  if (parsed.origin !== ORIGIN || !/^\/hubs\/[a-z0-9-]+\/business\/[a-z0-9-]+$/.test(parsed.pathname)
      || parsed.search || parsed.hash) throw new Error("HUB_SCHEMA_CANONICAL_INVALID");
  return parsed.toString();
}

function validGemi(value?: string): string | undefined {
  const candidate = clean(value);
  return candidate && /^[0-9]{8,20}$/.test(candidate) ? candidate : undefined;
}

function validatedReview(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= Date.UTC(2000,0,1)
    && timestamp <= Date.now() + 5 * 60_000 ? new Date(timestamp).toISOString() : undefined;
}

export function hubBusinessStructuredData(input: HubBusinessSchemaInput) {
  const url = canonicalUrl(input.url);
  const name = clean(input.name);
  if (!name) throw new Error("HUB_SCHEMA_BUSINESS_NAME_REQUIRED");

  const address = clean(input.addressLine);
  const city = clean(input.city);
  const postcode = clean(input.postcode);
  const isVerifiedPremise = input.kind === "claimed" && Boolean(address && city && postcode);
  const businessId = `${url}#business`;
  const profileId = `${url}#profile-page`;
  const links = [input.website, input.instagramUrl, input.facebookUrl, input.officialRegistryUrl]
    .map(externalHttps).filter((v): v is string => Boolean(v));
  const gemi = validGemi(input.gemiNumber);
  const reviewDate = input.kind === "unclaimed_registry" ? validatedReview(input.reviewedAt) : undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": profileId,
        url,
        name: `${name} · ΚΟΝΤΑ ΜΟΥ`,
        inLanguage: "el-GR",
        isPartOf: { "@id": `${ORIGIN}/#website` },
        publisher: { "@id": `${ORIGIN}/#organization` },
        mainEntity: { "@id": businessId },
        lastReviewed: reviewDate
      },
      {
        "@type": isVerifiedPremise ? "LocalBusiness" : "Organization",
        "@id": businessId,
        name,
        url,
        description: clean(input.description),
        mainEntityOfPage: { "@id": profileId },
        knowsAbout: clean(input.category),
        ...(isVerifiedPremise ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: address,
            addressLocality: city,
            addressRegion: clean(input.region),
            postalCode: postcode,
            addressCountry: "GR"
          }
        } : {}),
        ...(input.kind === "claimed" && clean(input.telephone) ? { telephone: clean(input.telephone) } : {}),
        ...(gemi ? { identifier: { "@type": "PropertyValue", propertyID: "ΓΕΜΗ", value: gemi } } : {}),
        ...(links.length ? { sameAs: [...new Set(links)] } : {})
      }
    ]
  } as const;
}

export function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
