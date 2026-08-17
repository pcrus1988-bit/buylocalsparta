# Buy Local Sparta — Threat Model

**Build:** 0.14.0
**Target:** OWASP ASVS 5.0 Level 2 baseline for the web application.
**Status:** implementation threat model, not a penetration-test report.

## Protected assets

The highest-value assets are customer identities and addresses; merchant private business/financial information; canonical product safety data; inventory and reservations; orders and returns; payment/provider references; supplier procurement, invoices and settlement state; private advice conversations; administrator privileges; audit/security evidence; and the integrity of Fair Vendor Exposure decisions.

Card PAN/CVV data is deliberately outside the application trust boundary and must remain inside the licensed payment provider's tokenized components.

## Trust boundaries

1. **Browser ↔ web application/API.** Untrusted customer, merchant and admin input crosses an internet-facing boundary.
2. **Application ↔ PostgreSQL/RLS.** Application public IDs resolve to internal UUIDs; vendor/actor/market context is applied transaction-locally before protected SQL.
3. **Web requests ↔ workers/outbox.** Customer requests commit domain state; asynchronous providers/search/notifications operate later and idempotently.
4. **Application ↔ object storage/scanner.** Uploaded files remain private until malware, rights and moderation gates pass.
5. **Application ↔ PSP, courier, calendar and messaging providers.** Every provider event is untrusted until signature/idempotency/state validation succeeds.
6. **Platform staff ↔ privileged finance/compliance operations.** Admin access is role-scoped, audited and subject to maker/checker separation where money is released.

## Priority abuse cases and controls

| Threat | Current control | Production gate / residual risk |
|---|---|---|
| Credential stuffing / brute force | Password hashing, bounded login recovery, IP + identity rate limits, security events | Distributed Redis/edge limiter, breached-password service, MFA/passkeys, external monitoring |
| Session theft | Opaque server-side session, HttpOnly + SameSite cookie, Secure under HTTPS, short sensitive-action boundary | Production HTTPS/HSTS validation, session revocation UX, device/anomaly review |
| CSRF | Session-bound CSRF proof on mutations; SameSite cookie | Browser/security review of every future state-changing route |
| XSS / clickjacking | Output escaping, CSP, `frame-ancestors 'none'`, X-Frame-Options, nosniff | Remove development `unsafe-inline` by nonce/hash in production Next.js build; penetration test |
| IDOR / vendor data leakage | Server RBAC, vendor isolation, database RLS scope, role-scoped vendor payloads | Live PostgreSQL adversarial RLS tests against every protected repository |
| SQL injection | Parameterized repository SQL and typed domain validation | Live DB integration and SAST/DAST; review any future dynamic SQL |
| SSRF via Ask Local URL | URL is evidence/context, not blindly fetched in current runtime | Any future metadata fetcher requires scheme/domain policy, DNS/IP rebinding protection and egress controls |
| Malicious upload | Signed/private upload architecture, content metadata, malware/rights/moderation gates | Production S3-compatible storage, malware scanner, re-encoding, bucket policy and CDN validation |
| Viva webhook replay/spoofing/out-of-order delivery | Verification-key handshake, authoritative Retrieve Transaction reconciliation, unique provider-event IDs, monotonic payment transitions and reversal dedupe | Validate the configured Viva portal webhook over TLS and exercise real demo credentials before production |
| Payment replay / duplicate provider-order creation | Durable two-phase Viva creation attempt, unique provider correlation/order references, automatic retry blocked on unknown provider outcomes | Live Viva demo test plus reconciliation runbook drill before production |
| Refund retry / uncertain provider outcome | Stable BLS refund idempotency key, provider reversal identity dedupe, `processing` → `manual_review` on uncertainty, no blind provider retry | Live demo refund/reversal webhook test and privileged reconciliation procedure |
| Capture after customer cancellation | Monotonic reconciliation detects captured+cancelled and issues one stable `late-capture:<order>` full-refund attempt; unresolved outcomes surface in Admin health | Exercise cancellation/capture race against Viva demo environment before production |
| Inventory race / oversell | Reservation model plus PostgreSQL row-locking functions | Live PostgreSQL concurrent checkout tests |
| Fairness manipulation | Bot-filtered qualified exposure semantics, deterministic deficit rotation, audit, appeals, override expiry | Production bot/abuse telemetry and periodic statistical audit |
| False stock / fulfilment gaming | Explicit freshness TTL, rejection/failure eligibility rules, audit trail | Operational SLA policy, merchant appeal process and monitoring |
| Payout fraud / insider abuse | Maker/checker, immutable fee snapshots, payout references, audit | Admin MFA, beneficiary-change cooling period/provider verification, finance penetration review |
| Privilege escalation | Explicit platform/vendor roles and permissions; security-read separated from finance | Periodic access review; live integration tests; admin MFA |
| Sensitive-data leakage in logs | Privacy-minimised analytics, masked notification attempts, sanitized security events | Central log redaction rules and production log-retention review |
| DoS / expensive endpoint abuse | Route-specific fixed-window limits, 1 MB JSON cap, worker isolation | Distributed limiter/WAF/CDN, autoscaling and load testing |
| Dependency/provider outage | Liveness/readiness separation; non-critical providers degrade rather than falsely fail checkout | External uptime monitoring, circuit breakers and incident drills |

## Security-event policy

Security telemetry records bounded metadata only: event type, severity, request ID, route/method, one-way correlation hash, optional stable actor ID and sanitized details. It must never become a secondary store for passwords, authorization headers, cookies, raw email addresses, telephone numbers, session tokens, arbitrary request bodies or raw client IPs.

Default retention in the current design is **90 days** and is implemented as append-only evidence followed by explicit retention deletion. PostgreSQL RLS exposes these rows only to authorized platform scope.

## Readiness semantics

`/api/health/live` answers only whether the process can serve. `/api/health/ready` additionally evaluates critical dependencies. Failure of a non-critical provider (for example optional notification delivery) produces `degraded` while keeping readiness true. A critical catalogue/search dependency produces an unhealthy/503 readiness result. The Admin health view remains available for investigation even while public readiness is unhealthy.

## Required pre-production security evidence

Before public launch, this document must be supplemented by a real threat-model workshop, live PostgreSQL RLS/IDOR tests, authenticated penetration testing, dependency/container scanning, production CSP review without unnecessary inline allowances, provider webhook signature tests, upload malware/evasion testing, payment/refund abuse tests, admin MFA and privileged-access review, restore/incident exercises, and a documented remediation register.
