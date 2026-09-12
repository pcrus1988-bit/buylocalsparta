# Vendor operating model for hub expansion

## Decision

KONTA MOY remains one platform. Sparta is the managed flagship market and expansion hubs use self-governed vendors. Business logic is shared; permissions and data scope change by operating context.

- `MANAGED`: backwards-compatible default for the existing Sparta vendor runtime.
- `SELF_GOVERNED`: explicit opt-in for an expansion vendor after its market/hub/location scope is resolved.

No vendor operating model grants platform-governance authority.

## Reuse before rebuilding

The current system already has several seams that should be reused:

1. Vendor sessions already resolve an authenticated `vendorId` and require a `vendor_*` role.
2. PostgreSQL vendor operations already filter catalogue, inventory, order lines and fulfilments by the authenticated vendor.
3. Canonical products and vendor offers are already separate concepts. Expansion vendors should manage their own offer facts while canonical identity stays governed centrally.
4. Existing fulfilment/order state machines should be reused. A self-governed vendor controls only its own fulfilment segment.
5. Existing Admin catalogue, SEO, finance, fairness, safety and compliance governance remain the authority layer rather than being copied into `/vendor`.
6. Existing `/vendor` and `/daily` surfaces remain the management and operational UIs; expansion adds capabilities rather than a second application.

## Required request context

Every vendor-side service call that can mutate or reveal scoped data should eventually receive or resolve:

- `vendorId`
- `marketId`
- optional `hubId`
- optional `locationId`
- `operatingModel`
- authenticated vendor staff roles
- derived vendor capabilities

Scope enforcement belongs in services/database access. UI hiding is not an authorization boundary.

## Vendor capability boundary

`SELF_GOVERNED` may expose own-shop operations such as profile management, product submissions/import, vendor offers, pricing, inventory, orders, fulfilment, shipping, vendor delivery, AADE self-service, customer communication, promotions, compliance submissions, staff management, analytics and SEO source-data improvement.

The following remain platform governance and are intentionally not `VendorCapability` values:

- canonical identity, merge and deduplication
- fair-exposure algorithm and eligibility
- vendor eligibility/suspension
- hub activation and marketplace geography
- canonical URL, index/noindex, sitemap and structured-data rules
- safety holds and recalls
- platform ledger and settlement rules
- final dispute authority
- platform campaigns
- fraud/abuse controls

## Migration strategy

1. Introduce the shared operating-context/capability vocabulary without changing Sparta behaviour.
2. Centralize legacy Sparta market defaults behind one helper rather than scattering `"sparta"` literals.
3. Add persisted vendor market/hub/location/operating-model fields in a dedicated migration after the active schema line stabilizes.
4. Resolve the operating context after vendor session authentication and pass it through vendor services.
5. Gate expansion-only UI/actions on capabilities, while keeping the same underlying services for Admin and Vendor.
6. Add database/RLS and service tests proving cross-vendor and cross-market access fails closed.
7. Activate `SELF_GOVERNED` per expansion vendor/hub only after its required modules are ready.

## Non-negotiable compatibility rule

Missing operating-model data must resolve to `MANAGED` + the current Sparta market during the transition. Expansion must be explicit; it must never be inferred from a shop name, postcode or city string. This prevents accidental behaviour changes for the live Sparta marketplace.
