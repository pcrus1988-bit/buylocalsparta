# KONTA MOY Daily — operations & activation

KONTA MOY Daily is the restricted day-to-day vendor surface under `/daily`. It is intentionally separate from the full `/vendor` backoffice.

## Access boundary

Vendor owners may use Daily with their existing vendor account. Entrusted employees must be created from **Vendor → KONTA MOY Daily** (`/vendor/daily-access`).

A Daily employee is stored as a normal `users` identity for auditability, but is **not** added to `vendor_users` and receives no persisted `vendor_user_roles`. The dedicated Daily session projects only the operational capabilities needed by the reused fulfilment and advice services. Consequently a Daily employee credential is not valid for `/vendor/login`.

Daily sessions use:

- cookie: `bls_daily_session`
- independent token-signing domain (`daily:`)
- independent CSRF domain (`daily-csrf:`)
- `vendor_daily_sessions` persistence
- immediate session revocation when Daily access is revoked or the password is changed

All Daily writes use `/api/daily/*` endpoints and validate the Daily session/CSRF boundary.

## SLA model

Order SLA execution is tied to `vendor_commercial_agreements` through `vendor_order_sla_policies`.

Each SLA case snapshots the policy that was effective when the case opened, so later policy edits do not rewrite historical obligations. Acceptance and preparation are separate stages. Daily displays the same due time, breach state and escalation state used by the Admin/vendor notification centre.

If an active agreement has no executable SLA policy, the monitor uses the visible operational fallback defined in `apps/web/src/lib/order-sla.ts`. This fallback is a safety mechanism, not a substitute for an agreed vendor SLA. Admin should configure each active agreement in **Admin → Finance → SLA συμφωνιών** whenever explicit timings have been agreed.

## Web Push

Browser subscriptions are stored in `vendor_daily_push_subscriptions` and are scoped to both vendor and user. Push delivery mirrors only vendor-targeted `transactional` or `service` in-app notifications; marketing messages are not automatically mirrored.

The service worker is `/daily-sw.js` with scope `/daily/`. Notification clicks may only deep-link into `/daily` routes.

Server delivery uses VAPID. Configuration is resolved in this order:

1. server environment variables, when both VAPID keys are present;
2. encrypted Supabase Vault secrets;
3. if neither source contains a key pair and `BLS_WEB_PUSH_VAULT_AUTOPROVISION` is not `false`, the server generates one P-256 VAPID pair under a PostgreSQL advisory lock and stores it in Supabase Vault.

Optional environment values:

```text
BLS_WEB_PUSH_PUBLIC_KEY=<base64url P-256 public key>
BLS_WEB_PUSH_PRIVATE_KEY=<base64url P-256 private key>
BLS_WEB_PUSH_SUBJECT=mailto:<operational-contact>
BLS_WEB_PUSH_VAULT_AUTOPROVISION=false   # only when automatic Vault provisioning must be disabled
```

The private key is never returned by Daily APIs and is never stored in ordinary application tables. Vault-backed secrets use the names `bls_web_push_public_key`, `bls_web_push_private_key` and `bls_web_push_subject`. Environment values take precedence so operators may rotate/move the key material without changing application code.

Application runtime roles do not receive general Supabase Vault access. Migration 84 exposes only two `bls_private` SECURITY DEFINER functions with a fixed search path: one can read only those three Daily VAPID secrets, and one can create only those three exact secret names. Anonymous/authenticated Supabase roles cannot execute the functions, while direct Vault usage/read/create remains denied to the application runtime groups.

A device is not considered push-enabled merely because browser notification permission is granted. Daily reports background push as active only when a VAPID configuration is available and the current Daily user has a persisted PushSubscription.

## Delivery lifecycle

The secured `/api/cron/order-sla` route runs the SLA monitor and the Daily Web Push delivery pass. Push delivery:

1. mirrors eligible vendor in-app events into deduplicated `push` notifications;
2. claims queued work with `FOR UPDATE SKIP LOCKED`;
3. sends to active Daily devices;
4. records masked delivery attempts;
5. retries transient failures with backoff;
6. disables stale subscriptions on HTTP 404/410.

## Database migrations

The integrated schema sequence is:

- `0078_customer_comms_ask_local_workflow.sql` — pre-existing live migration
- `0079_vendor_platform_billing.sql`
- `0080_vendor_order_sla_notifications.sql`
- `0081_vendor_daily_access_push.sql`
- `0082_order_sla_trigger_search_path.sql`
- `0083_daily_sla_fk_indexes.sql`
- `0084_daily_vapid_vault_bridge.sql`

Do not reuse migration number 78 for the SLA migration; the live database already used 78 for Customer 360 / Ask Local workflow work.

## Activation checklist

Before promoting Daily to production:

- database readiness reports schema 84;
- every vendor that has agreed explicit SLA timings has a policy attached to its active agreement;
- VAPID configuration resolves successfully from environment or the scoped Supabase Vault bridge;
- a real Daily employee credential is created from the vendor owner page;
- verify that the same credential is rejected by `/vendor/login`;
- register at least one physical phone from `/daily/notifications`;
- test new-order, SLA-warning, SLA-breach and Ask Local push delivery with the Daily PWA closed;
- test QR scanning and the explicit handover confirmation on a physical phone;
- confirm revoking Daily access terminates sessions and disables that employee's push subscriptions.
