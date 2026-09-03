# ΓΕΜΗ OpenData — privacy processing record

Last reviewed: 2026-09-03

## Processing activity

Partner application, business-identity enrichment and verification using public ΓΕΜΗ OpenData after an applicant enters a Greek ΑΦΜ in `/join/apply`.

## Controller

ΚΟΝΤΑ ΜΟΥ / SP BUSINESS LAB, using the controller details published in `/privacy`.

## Data subjects

- applicants who are natural persons or sole traders;
- representatives/contact persons whose professional details may be present in an application;
- natural persons whose contact data may be included in public registry fields used for the application.

The workflow must not treat public availability as removing GDPR protection where a field relates to an identifiable natural person.

## Source

Publicly accessible ΓΕΜΗ OpenData provided through the official Business Portal OpenData API.

Attribution: Κεντρική Υπηρεσία ΓΕΜΗ / Κεντρική Ένωση Επιμελητηρίων Ελλάδος — Ανοιχτά Δεδομένα ΓΕΜΗ, Open Data Commons Attribution License (ODC-BY 1.0).

## Purpose

- prefill a partner application from the applicant-provided ΑΦΜ;
- verify the legal identity of the business;
- reduce manual entry and transcription errors;
- preserve source/provenance evidence for Admin verification;
- support fraud/abuse prevention and integrity of partner onboarding.

A ΓΕΜΗ match does not prove applicant ownership or authority to represent the business and must never automatically grant vendor access.

## Data categories

The public lookup/cache is restricted to onboarding-relevant normalized fields:

- ΑΦΜ;
- ΓΕΜΗ number;
- legal name;
- trading name;
- company status;
- legal type;
- registered address, city/municipality/prefecture and postcode;
- public email, phone and URL where supplied by the registry;
- lookup status and last-check timestamp.

Representatives, registry documents and unnecessary raw response fields are outside the normalized onboarding cache and should not be added without a separate necessity/privacy review.

## Legal basis

- GDPR Article 6(1)(b): steps taken at the applicant's request before entering a contract, for the applicant-initiated onboarding lookup and application processing.
- GDPR Article 6(1)(f): legitimate interests may apply to proportionate security, fraud prevention, integrity and verification controls. Necessity and balancing should be revisited if the processing scope expands.

Consent is not used as the legal basis for the registry lookup required to process the application. The form checkbox records that the applicant received the privacy notice. Optional analytics/marketing consent remains separate.

## Transparency

The applicant receives just-in-time notice beside the ΑΦΜ lookup before the request is sent. `/privacy#gemi` identifies the public source, the categories of data, purposes, legal bases, attribution, provenance model, accuracy boundary and rights.

The application UI distinguishes ΓΕΜΗ-sourced contact values from applicant-provided overrides and displays when the registry data was checked.

## Data minimisation and security

- `GEMI_OPENDATA_API_KEY` is server-only and must never use a `NEXT_PUBLIC_*` name.
- the browser receives only normalized onboarding-relevant data, never the API credential or full raw registry payload;
- cache entries expire automatically and are used to avoid unnecessary repeat provider calls;
- logs must not contain the API credential;
- the provider key must be rotated if exposure is suspected;
- public lookup and provider calls remain rate-limited.

## Accuracy and provenance

ΓΕΜΗ is the primary source for fields labelled as registry-sourced. Applicants may provide different marketplace contact/storefront details where appropriate. Such overrides must retain applicant-provided provenance and remain subject to verification.

## Retention

- registry lookup cache: short-lived operational cache according to the configured TTL;
- partner application fields and registry provenance: only as long as necessary for application/onboarding, security, dispute handling and applicable legal obligations;
- unsuccessful/abandoned flows: follow the applicable application/privacy retention schedule and should not become permanent prospect profiles solely because a lookup occurred.

## Marketing boundary

A public ΓΕΜΗ email address or phone number is not treated as consent for direct marketing. Any marketing use must have its own lawful basis and comply with the applicable Greek electronic communications/direct-marketing rules.

## Review triggers

Reassess this record before any of the following:

- using ΓΕΜΗ to mass-enrich pre-claim vendor pages;
- retrieving representatives, filings/documents or additional natural-person fields;
- automated scoring or rejection based on registry data;
- using public registry contact data for outbound marketing;
- materially extending cache/retention periods;
- sharing ΓΕΜΗ-derived data with new recipients or processors.
