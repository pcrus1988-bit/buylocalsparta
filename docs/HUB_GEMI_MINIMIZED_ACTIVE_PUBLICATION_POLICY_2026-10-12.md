# GEMI minimized public company directory — 12 October 2026

Owner instructions: publish verified, ACTIVE GEMI companies in the correct HUB/category; do not expose any vendor email or phone; instead link both fields to official GEMI company publicity. Unclaimed GEMI directory records are informational, not merchants.

Official API: https://opendata-api.businessportal.gr/api/opendata/v1/companies/{arGemi}
Official public record: https://publicity.businessportal.gr/company/{arGemi}

## Allowed on an unclaimed public profile
Verified legal company name, GEMI number, date/status of official GEMI verification, city/municipality and preexisting category corroborated by a live KAD, reviewed municipality HUB grouping (no claim of precise premises location), optionally postcode, owner/plan CLAIM links, official source, and contact for correction/objection. Never project raw email, telephone, AFM, person relationships, private source evidence, full premises street address or survey information.

GEMI autoRegistered=false means incomplete self-registration, NOT inactive. Display only facts that were individually and exactly checked against the official GEMI API: number, normalized Greek legal name, active status, postal code, municipality and at least one current KAD. Missing fields are not inferred.

## Independent gates
Only records with official active evidence, valid HUB/grouping, valid category, current source, no active vendor/CLAIM duplicate, separate privacy/legal-scope reviewer, editorial reviewer, evidence note and SEO quality qualification can publish. Unreviewed research prospects are never made visible.

A first minimal corporate pilot can be assessed only where official legalType=ΑΕ and no natural-person/contact fields are used. Record automation as automation, not a fake human reviewer. Other forms, sole traders, one-person companies, ambiguous personal records and suppressed contacts remain pending. The European Commission explains company data are generally outside GDPR but individual-identifying company information can still be personal data:
https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/application-regulation/do-data-protection-rules-apply-data-about-company_en
This is not a general GDPR legal opinion. Support correction/objection and clarify non-affiliation.

## Atomic release constraint
The existing hub_gemi_directory_seo_requires_public constraint forbids seo_approved=true on an unpublished row. Fix the previous contradictory release runner by setting display_status=published and seo_approved=true ATOMICALLY, only after all distinct substantive evidence and review gates have passed. Public profile and sitemap must require the same official ACTIVE provenance.

Before production publication, deploy the source-link/no-contacts profile, confirm it returns 200 with correct canonical, and verify category grouping. Do not activate sales checkout or pretend that owner CLAIM is verified.
