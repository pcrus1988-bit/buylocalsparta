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
