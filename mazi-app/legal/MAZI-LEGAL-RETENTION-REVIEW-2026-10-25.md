# MAZI — Legal, privacy and retention review (PROPOSED · 2026-10-25)

**Status: DRAFT FOR CONTROLLER + GREEK/EU COUNSEL REVIEW — NOT AN ADOPTED PRIVACY POLICY.** Do not record `legal_and_retention=verified` until decisions below are approved and the corresponding operational deletion/export procedures are tested. In case of legal hold, regulatory duty or pending dispute, preserve only the necessary records under restricted access and document the exception.

## Legal documents and controller
- Current public documents: `https://mazi.kontamou.site/privacy`, `https://mazi.kontamou.site/invitation-terms`, `https://mazi.kontamou.site/charter`.
- Controller identified in MAZI Privacy as SP BUSINESS LAB / KONTA MOY. Confirm legal identity, contact channels, processor contracts (Supabase/Vercel/email provider), hosting/transfers, legal grounds, and whether a DPIA/LIA is required.
- **Invitation terms version** `mazi-invitation-terms-v1`: nonfinancial pilot only. The €250/month membership programme, HUB PRO/marketing benefits, 10-day notice, governance and development-support commitments will require independently approved future contracts and explicit affirmative acceptance before any charge/award.
- Public privacy text currently promises a **specific retention timetable before launch**. It must be updated when the schedule below is finally approved; a GitHub draft alone is not sufficient publication.
- Data subject requests: `info@kontamou.site` (confirm it receives requests, can be triaged privately and can respond within GDPR deadlines, normally one month subject to lawful extension). Define contact verification, access/correction/export, restriction, deletion, objection and suppression as applicable. No bulk disclosure to unverified requesters.

## Proposed retention matrix — not active until independently approved
| Data group | Typical tables | Proposed expiry trigger and period | Required disposition | Exceptions/notes |
|---|---|---|---|---|
| Never-accepted / declined interest | mazi_interest_applications and followups | 12 months after final decision, or last meaningful interaction where lawful | Delete or irreversibly anonymize applicant PII, retain minimal decision evidence if legally justified | Audit-event references and immutability constraints require specific approved workflow |
| Pending interest (abandoned) | mazi_interest_applications | 12 months since submission without activity | Review and delete/minimize | No silent auto-approval |
| Expired unused invitations | mazi_invitations | 90 days after expiry/revocation | Remove personally identifying invite metadata when no dispute | Keep minimal fraud-prevention / do-not-resend state where justified |
| Former nonfinancial members | mazi_members, membership_applications, acceptance records | 24 months after membership closure, subject to obligations | Anonymize community content, remove unnecessary identifiers, retain contract proof as necessary | Existing constraints/immutable audit require reviewed implementation |
| Community posts, chat and inquiries | mazi_chat_messages, forum_threads/replies, inquiry_messages, listing_inquiries | 90 days after verified account closure or requested erasure where lawful | Delete/minimize content and third-party personal data | Moderation/report legal holds; preserve contributions needed by other parties only when justified |
| Content moderation | mazi_community_reports, audit decisions | 12 months after final resolution | Minimize reporter/member identity | Longer only for substantiated disputes |
| Server access/security logs | operational logs outside app DB | 90 days rolling, unless incident | Expire via vendor log retention controls | Verify Vercel/Supabase/provider actual product retention; cannot promise a duration beyond your control |
| Identity and invitation audit | mazi_audit_events, mazi_interest_events, registry_rechecks, invitation_acceptances | up to 3 years after lawful closure (proposed) | Minimize identifiers / archive restricted evidence | Check Greek limitation periods and necessity; triggers currently enforce immutability |
| Future billed transactions and awarded grants | financial records, if activated later | Follow statutory accounting/tax retention independently (commonly years, not a uniform MAZI default) | Retain legally required documents, restrict access | **Not active now**; do not apply short pilot retention to regulated accounting |

Periods are proposals for review, **not** automatic deletion jobs and **not** binding legal claims. A live purge must never be switched on before all foreign keys, audit immutability constraints, legal hold/claim preservation, third-party references and processor backups are tested against anonymized fixtures and approved.

## Implementation checklist for approval
1. Review Art. 13/14 GDPR disclosures: exact controller contact, purposes, legal grounds, recipients/processors, international transfers, rights, retention and complaint authority.
2. Validate each proposed retention period and whether the underlying lawful basis survives refusal, resignation, dispute or pending finance. Record the approved schedule version and effective date.
3. Document a deletion/anonymization workflow, reversible hold approvals, data export/rectification and audit trail; test on a legally authorized real request only. Existing append-only data cannot be deleted without a separately assessed safe migration.
4. Verify confirmation and record of the invitation-terms version, non-prechecked acceptances and the separation of pilot from paid membership/funding.
5. Confirm DSAR inbox monitoring, identity verification, one-month response monitoring, processor DPAs, incident reporting procedure and backup retention.
6. Publish approved privacy notice and its effective date (not a draft), document immutable approval evidence by Super Admin with counsel review reference; notify affected members if material terms change. Only then mark the launch gate verified.

**No legal interpretation in this document should be treated as counsel sign-off.**