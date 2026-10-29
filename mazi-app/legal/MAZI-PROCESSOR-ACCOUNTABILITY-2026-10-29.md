# MAZI — GDPR Processor, Recipient, Transfer and DPA Audit Protocol
**Date:** 29.10.2026 · **Status:** operational control, NOT legal sign-off.

## Legal framework
The processing inventory must track every actual third-party recipient, processor and relevant subprocessor. GDPR Article 28 applies where a vendor processes personal data on the controller's behalf; independent or joint controllers require the legally appropriate arrangements rather than a fictitious processor DPA. Articles 30 and 44–49 require accurate recipient and international-transfer mapping. A hosted EU data centre alone does not prove all support, logs or access stays within the EEA.
Official references:
- https://eur-lex.europa.eu/legal-content/EL/TXT/?uri=CELEX:32016R0679
- https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en

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

## Release and safeguarding
Legal-and-retention approval requires the already established 12-domain retention inventory AND the most recent evidence-based 7-domain external processing inventory. An earlier signed approval ceases to be effective for readiness if either domain is reopened. The actual invitation issuance endpoint must recheck both. This is a technical fail-closed safeguard, not a professional legal opinion.

No processor agreements are digitally signed by this system. No data is erased, no third-party services are automatically enabled, and no legal compliance certification is generated. Real-world contract inspection, active cookie and transfer review, supplier breach procedures, and qualified Greek counsel approval are still required.
