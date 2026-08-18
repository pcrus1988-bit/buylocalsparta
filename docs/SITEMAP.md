# Application Sitemap

This document lists **implemented routes only**. Product ideas and future capabilities are intentionally kept separate so this file never implies that a page or workflow exists when it does not.

## Public storefront

### Discovery
- `/` — Home
- `/shop` — Product catalogue
- `/category/[slug]` — Governed storefront category
- `/product/[id]` — Canonical product detail
- `/shops` — Merchant directory
- `/vendor/[id]` — Public merchant profile
- `/sitemap` — Human-readable site map

### Advice and customer help
- `/advice` — Browse public adviser profiles / start from a specific product or merchant
- `/ask-local` — Private customer request routed to an appropriate local merchant
- `/help` — Help centre

`/advice` and `/ask-local` are deliberately separate: Advice is a public discovery surface for people and expertise; Ask Local is the private request workflow.

### How the marketplace works
- `/how-it-works`
- `/fairness`
- `/delivery-pickup`
- `/payments-security`
- `/returns-refunds`
- `/privacy-controls`
- `/about`

### Merchant acquisition
- `/join` — Partnership proposition
- `/join/requirements` — Readiness checklist
- `/join/apply` — Governed application form; intentionally excluded from search indexing

## Customer utility and private routes

These routes are functional but are not XML-sitemap content:
- `/login`
- `/register`
- `/verify-email`
- `/cart`
- `/checkout`
- `/checkout/success`
- `/checkout/failure`
- `/account`
- `/account/orders/[id]`

## Vendor workspace

Private vendor routes:
- `/vendor`
- `/vendor/login`
- `/vendor/catalog`
- `/vendor/advice`
- `/vendor/shipping`
- `/vendor/returns`
- `/vendor/trust`
- `/vendor/finance`
- `/vendor/analytics`

The public `/vendor/[id]` profile shares the namespace but is a separate, indexable storefront route. Robots rules therefore block private vendor pages explicitly rather than blocking `/vendor` as a whole.

## Admin workspace

Private admin routes:
- `/admin`
- `/admin/login`
- `/admin/vendors`
- `/admin/research-vendors`
- `/admin/matching`
- `/admin/categories`
- `/admin/content`
- `/admin/orders`
- `/admin/shipping`
- `/admin/trust`
- `/admin/reviews`
- `/admin/recalls`
- `/admin/privacy`
- `/admin/finance`
- `/admin/tax`
- `/admin/fairness`
- `/admin/analytics`
- `/admin/maintenance`
- `/admin/operations`
- `/admin/activation`

## Technical routes

`/api/**` routes are application interfaces, not user navigation or search-index content. They must never be presented as ordinary links.

## Future capabilities — not current routes

The broader product blueprint includes additional capabilities such as richer profile/address management, consultation scheduling, additional carrier adapters, team/role administration, richer CMS surfaces, and deeper provider integrations. Unless a route appears in one of the implemented sections above, it must not be represented in customer navigation as an available page.
