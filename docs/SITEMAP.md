# Application Sitemap

## Customer

Home → Shop → Categories (`/category/home-living`, `/category/fashion`, `/category/beauty`, `/category/kids`, `/category/technology`, `/category/gifts`) → Search → Collections → Brand → Canonical Product  
Shops & People (`/shops`) → Vendor Profile (`/vendor/[id]`) → Primary Location → Adviser / Published Merchant Story  
Advice → Advice Hub → Guides → Ask Question → Chat → Consultation Booking  
Ask Local → Paste Link → Confirm Match → Request → Private Offer → Checkout  
Cart → Fulfilment Choices → Checkout → Payment → Confirmation → Consolidated Tracking  
Login → Account → Orders → Order Detail / Pre-handover Cancellation → Saved Products → Saved Searches → Notifications → Recommendations → Recently Viewed → Privacy Controls → Profile/Addresses/Returns/Messages/Appointments/Tax Documents (remaining production surfaces)  
Trust → How It Works → Seller Disclosure → Delivery → Returns/Guarantee → Payments → Privacy/Cookies → Accessibility → Complaints/Recalls  
Merchant Acquisition → Why Join → Plans → Application → Onboarding → Merchant Terms → Login

## Vendor workspace

Vendor Login → Today Dashboard → Assigned Orders (accept/reject/pickup-ready/local delivery) → Inventory → Products/CSV Import → Media/Compliance → Advice/Appointments/Notifications → Analytics → Supplier Invoices/Settlements → Returns/Repair/Replacement → BOX NOW Shipping/Labels → Public Storefront Profile

Remaining production Vendor surfaces: team/role administration, multi-location settings and additional carrier/provider adapters beyond the first BOX NOW integration.

## Admin

Admin Login → Command Centre → Vendors/KYB → Product Matching / Canonical Creation → Trust / Media / Compliance → Orders / Returns → Reviews → Privacy → Categories → CMS / SEO → Recalls → Finance / Payables / Maker-Checker Settlements → Fairness Appeals → Market Analytics → Maintenance / Search Jobs → Operations / Readiness / Security / Audit

Implemented production Next.js Admin surfaces: `/admin`, `/admin/vendors`, `/admin/matching`, `/admin/trust`, `/admin/orders`, `/admin/reviews`, `/admin/privacy`, `/admin/categories`, `/admin/content`, `/admin/recalls`, `/admin/finance`, `/admin/fairness`, `/admin/analytics`, `/admin/maintenance`, `/admin/operations`, `/admin/shipping`.

Remaining production Admin work is primarily persistence/provider depth rather than missing top-level surfaces: PostgreSQL-backed shared state, richer record-detail/editing UX, public CMS rendering, durable distributed workers/search provider, production file/media processing, notification/provider operations and live operational integrations.

- `/admin/activation` — platform-only staging/launch activation evidence by provider/build/environment.
