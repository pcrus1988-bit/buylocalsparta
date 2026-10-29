# MAZI — GDPR Processor, Recipient, Transfer and DPA Audit Protocol
**Date:** 29.10.2026 · **Status:** operational control, NOT legal sign-off.

## Legal framework
The processing inventory must track every actual third-party recipient, processor and relevant subprocessor. GDPR Article 28 applies where a vendor processes personal data on the controller's behalf; independent or joint controllers require the legally appropriate arrangements rather than a fictitious processor DPA. Articles 30 and 44–49 require accurate recipient and international-transfer mapping. A hosted EU data centre alone does not prove all support, logs or access stays within the EEA.
Official references:
- https://eur-lex.europa.eu/legal-content/EL/TXT/?uri=CELEX:32016R0679
- https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en

## Verified processing region requiring specific review
On 29 October 2026 the connected MAZI production Supabase project's own project details returned **us-east-1 (USA)**. This is an infrastructure finding, not evidence that any transfer mechanism was contractually verified. The MAZI register therefore rejects an EEA-only database/Auth/Storage declaration until a later verified region migration and an explicit code/policy update. The controller and legal counsel must review Chapter V safeguards, subprocessor access and regions.

Relevant public contractual documents (their publication does NOT establish execution, applicable plans, or completed transfer compliance):
- Supabase DPA Version 1, 1 August 2026: https://supabase.com/legal/customer-resources/data-processing-addendum
- Vercel DPA updated 17 March 2026: https://vercel.com/legal/dpa — check applicability to the actual team's subscription.
- Resend DPA updated 31 December 2025: https://resend.com/legal/dpa — verify the actual account agreement, service and subprocessor scope.

## Seven functional domains
1. Hosting/runtime/CDN (check actual Vercel configuration, providers, access logs and support locations).
2. Database, Auth and Storage (check actual Supabase contracts, backups, support and credentials governance).
3. Transactional email (identify actual provider, such as Resend, SMTP, recipients, logging and subprocessors).
4. Monitoring/analytics/telemetry (verify actual pixels, logs, session recording, cookie exposure and any recipients).
5. Payments/financial systems (distinguish currently inactive features and independent-controller payment arrangements).
6. Third-party integrations (GEMI/KYB, social networks, connectors and actual data flows).
7. Backups, exports and external archives (actual cloud storage, access, region, expiry and restores).

## Evidence requirements
For each active domain the operator must retain separately: (1) real data processing purposes, categories and party roles, (2) a binding agreement and applicable Article 28 requirements, (3) instructions/confidentiality, (4) security, incident and DSAR assistance, (5) subprocessor agreements, changes and authorization, (6) actual countries, access and Chapter V mechanism including transfer-impact assessment where applicable, (7) data return/deletion and backup life cycle, (8) dated controller and competent counsel review. Enter opaque document/ticket references only, never raw contracts, personal records, emails or credentials in the dashboard.

Inactive optional domains must have evidence of actual absence of data processing; core hosting, database and transactional email cannot be declared inactive. Provider examples are not claims of active deployment.

## Internal review freshness policy
A verified processor review is eligible to unlock the legal and invitation gate only for **90 calendar days from the documented actual review date** (Athens calendar). This is a stricter, self-imposed operational re-verification cadence, not a time limit prescribed by GDPR. A provider change, discovered change in actual role, region, subprocessors, DPA version or processing scope calls for immediate reopening regardless of age. Historical evidence remains append-only; expired declarations cannot reopen invitations.

## Release and safeguarding
Legal-and-retention approval requires the already established 12-domain retention inventory AND the most recent evidence-based 7-domain external processing inventory. An earlier signed approval ceases to be effective for readiness if either domain is reopened. The actual invitation issuance endpoint must recheck both. This is a technical fail-closed safeguard, not a professional legal opinion.

No processor agreements are digitally signed by this system. No data is erased, no third-party services are automatically enabled, and no legal compliance certification is generated. Real-world contract inspection, active cookie and transfer review, supplier breach procedures, and qualified Greek counsel approval are still required.
