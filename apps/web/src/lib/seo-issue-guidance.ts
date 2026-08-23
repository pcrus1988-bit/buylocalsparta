export type SeoIssueGuidance = Readonly<{
  title: string;
  recommendation: string;
  nextStep: string;
  owner: "Content / SEO" | "Engineering" | "Content + Engineering";
}>;

const GUIDANCE: Readonly<Record<string, SeoIssueGuidance>> = {
  http_status: {
    title: "Restore a successful public response",
    recommendation: "The governed URL is not returning a 2xx response. Confirm that the public record still exists, the route is correct, and production routing/data are available.",
    nextStep: "Open the public page, correct the route or publication/runtime failure, then run a targeted recheck.",
    owner: "Content + Engineering"
  },
  redirected: {
    title: "Align the governed URL with the final destination",
    recommendation: "The declared URL redirects elsewhere. Decide whether the redirect is intentional; if so, update canonical/URL governance so the old route is no longer treated as the primary page.",
    nextStep: "Review canonical and redirect governance, then recheck the original route.",
    owner: "Content / SEO"
  },
  missing_title: {
    title: "Add a unique search title",
    recommendation: "The rendered HTML has no <title>. Give the page a useful, page-specific title through its governed metadata source rather than patching raw HTML.",
    nextStep: "Edit the page/entity SEO metadata and run a targeted recheck.",
    owner: "Content / SEO"
  },
  missing_canonical: {
    title: "Publish a self-consistent canonical",
    recommendation: "The rendered HTML has no canonical link. The canonical should come from the governed metadata layer and resolve to the intended public URL.",
    nextStep: "Repair metadata/canonical generation and run a targeted recheck.",
    owner: "Content + Engineering"
  },
  canonical_mismatch: {
    title: "Resolve the canonical conflict",
    recommendation: "The rendered canonical points somewhere other than the governed URL. Confirm which URL is authoritative and align the registry source, metadata and redirects.",
    nextStep: "Correct the authoritative canonical decision, then recheck this route and inspect it in Google if necessary.",
    owner: "Content / SEO"
  },
  unexpected_noindex: {
    title: "Remove an unintended noindex",
    recommendation: "Policy says this route may be indexed, but production HTML tells crawlers not to index it. Check global indexing state, entity overrides, quality gates and rendered robots metadata.",
    nextStep: "Fix the policy/render mismatch, then recheck before asking Google to inspect the URL.",
    owner: "Content + Engineering"
  },
  missing_h1: {
    title: "Add a clear primary heading",
    recommendation: "The rendered page has no H1. Add one meaningful page heading that describes the main subject without duplicating decorative headings.",
    nextStep: "Update the page/content template and run a targeted recheck.",
    owner: "Content / SEO"
  },
  multiple_h1: {
    title: "Review heading hierarchy",
    recommendation: "Multiple H1 headings are present. This is not always fatal, but the page should have a clear primary subject and a logical heading hierarchy.",
    nextStep: "Review the rendered content/template and simplify heading structure where appropriate, then recheck.",
    owner: "Content / SEO"
  },
  invalid_structured_data: {
    title: "Repair invalid JSON-LD",
    recommendation: "At least one application/ld+json block could not be parsed. Fix serialization in the governed page template; do not paste untrusted raw JSON into the page.",
    nextStep: "Repair the structured-data renderer and run a targeted production recheck.",
    owner: "Engineering"
  },
  missing_structured_data: {
    title: "Restore governed structured data",
    recommendation: "This product or vendor page is configured to emit structured data, but no application/ld+json block was observed in production.",
    nextStep: "Check the entity schema decision and public template, then run a targeted production recheck.",
    owner: "Content + Engineering"
  },
  missing_product_schema: {
    title: "Restore Product schema",
    recommendation: "The page has JSON-LD but no Product @type. Keep product identity, canonical URL and public offer data aligned with the governed product renderer.",
    nextStep: "Repair Product JSON-LD generation and recheck the public product URL.",
    owner: "Engineering"
  },
  missing_offer_schema: {
    title: "Restore Offer schema",
    recommendation: "The Product JSON-LD does not expose an Offer type. Confirm that an eligible public offer is represented with the same price, availability and seller semantics shown to crawlers.",
    nextStep: "Repair Offer JSON-LD generation and recheck the public product URL.",
    owner: "Content + Engineering"
  },
  missing_breadcrumb_schema: {
    title: "Restore BreadcrumbList schema",
    recommendation: "The product page is missing its governed BreadcrumbList structured data. Keep breadcrumb URLs aligned with the canonical product and category routes.",
    nextStep: "Repair breadcrumb JSON-LD generation and recheck the product route.",
    owner: "Engineering"
  },
  missing_local_business_schema: {
    title: "Restore LocalBusiness schema",
    recommendation: "The vendor dossier has JSON-LD but no LocalBusiness @type. Confirm the governed vendor renderer still emits the public business identity and approved location/contact fields.",
    nextStep: "Repair LocalBusiness JSON-LD generation and recheck the vendor route.",
    owner: "Content + Engineering"
  },
  unexpected_structured_data: {
    title: "Respect the schema suppression decision",
    recommendation: "Structured data is present even though the governed entity schema decision disables it. Align the public renderer with the current SEO entity control before changing the override.",
    nextStep: "Review the entity schema decision and renderer, then run a targeted recheck.",
    owner: "Content + Engineering"
  },
  unexpected_content_type: {
    title: "Return HTML for the public page",
    recommendation: "The governed public URL did not return an HTML document. Check route handlers, file/media collisions, content negotiation and deployment routing.",
    nextStep: "Repair the response type or URL governance, then run a targeted recheck.",
    owner: "Engineering"
  },
  request_failed: {
    title: "Restore crawler reachability",
    recommendation: "The crawler could not complete the HTTP request. Check production availability, TLS/DNS, timeouts and whether the route is intermittently failing.",
    nextStep: "Verify production reachability and retry the targeted recheck before changing issue lifecycle state.",
    owner: "Engineering"
  }
};

export function seoIssueGuidance(code: string): SeoIssueGuidance {
  return GUIDANCE[code] ?? {
    title: "Investigate the production evidence",
    recommendation: "Compare the governed policy with the latest HTTP, sitemap and Google evidence before changing the issue lifecycle.",
    nextStep: "Open the SEO page record, correct the underlying cause, then run a targeted recheck.",
    owner: "Content + Engineering"
  };
}
