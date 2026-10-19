# Greece hospitality POS shortlist — 19 October 2026

There is **no independently verified published market-share top ten** for installed
Greek hospitality POS products. The following entries are engineering
integration priorities, not a market-share ranking. Product presence is
supported by public first-party vendor pages, local payment-terminal
directories or vendor case studies.

| Priority | Product | Evidence of real Greek hospitality market | Integration route | What remains unverified |
|---|---|---|---|---|
| 1 | EPSILON NET PYLON Restaurant | Official product; Nexi WebECR listing | Vendor-approved local/ERP bridge | Public restaurant item-level paid-sale API, pricing and version |
| 2 | SOFTONE F&B | Official F&B product; ENTERSOFTONE POS communication products | Licensed SoftOne cloud/partner bridge | Access to **F&B** settled bar-order events, not just payment terminals |
| 3 | Wizcom inOrder | Vendor reports 1,700+ installations; efood/Wolt bridge | Wizcom-certified partner bridge | POS sales subscription/export mechanism and third-party permissions |
| 4 | Twinsoft OREXSYS | Cafe/bar/club POS and hotel interfaces | Vendor-certified local bridge | Permitted transaction source and fiscal mode |
| 5 | Megasoft PRISMA Win Restaurant-Café | Published actual hospitality customers and Web Services E-commerce | PRISMA Web Services where the specific licensed hospitality product supports them | Cash-paid bar sale events and vendor-approved price writes |
| 6 | Oracle MICROS Simphony | Official Greek representative Eurotel; Oracle STS Gen2 docs | Oracle STS Gen2 + subscriptions, merchant provisioned | Account-specific entitlement and precise deployment/version |
| 7 | Poseidon Anima Menu | Since 2004; hospitality and efood interfaces | Poseidon partner bridge | Approved item-level payment/sales interface |
| 8 | Semantic Garsonista | Official restaurant/bar/beach bar product; Nexi compatibility | Semantic-certified bridge | Public sales-event API, permissions, partner contract |
| 9 | Simply REST | Official Greek F&B POS offering; Simply POS/ADMATE WebECR | Simply-approved application-specific bridge | POS REST name is **not** evidence of a REST HTTP API; product/version mapping |
| 10 | FastOrder | Official hospitality ordering ecosystem with numerous bridges | FastOrder partner adapter | Whether a public sales webhook or partner SDK can be provisioned |

Official links:
- https://epsilonnet.gr/eidos-logismikou/efarmoges-estiasis-delivery/
- https://entersoftonefnb.gr/eurobank/tourismos/programma-parangeliolipsias/
- https://www.wizcom.gr/software/inorder
- https://www.twinsoftathens.gr/el-gr/twinsoft-athens-orexsys.html
- https://www.megasoft.gr/emporikes-efarmoges/emporikes-efarmoges-epipleon-diaxeiriseis/web-services-e-commerce
- https://docs.oracle.com/en/industries/food-beverage/simphony/omsstsg2api/index.html
- https://www.eurotel.gr/hospitality/partner/oracle-hospitality
- https://www.animamenu.gr/
- https://garsonista.gr/products/
- https://www.simplycloud.gr/
- https://www.fastorder.gr/integrations
- https://www.nexi.gr/el/erp%20providers/erp%20providers/

**Important:** Nexi's WebECR and TCP Socket compatibility list covers
Greek fiscal/payment-terminal integrations; it does not grant independent
third-party access to drink-level orders or authorize DrinkStock to modify
fiscal receipts. Likewise, there is an unrelated product named "Pylon" with
public API documentation; it must never be mistaken for EPSILON NET PYLON.

## Code available
- `src/lib/drinkstock-pos-contract.ts`: common normalized sale-event contract.
- `src/lib/drinkstock-pos-providers.ts`: ten registered provider targets,
  evidence, blocked live status and explicit capability-grant policy.
- `dashboard/[partnerId]/venues/[venueId]/integrations`: server-tenant-
  scoped POS integrations discovery page.
- Unit tests in the `test:hospitality` suite.

None of these are live partner connections. They cannot move a real market,
raise payment success, insert orders, issue receipts or write to a POS.

## Minimum acceptance matrix — every provider, independently
For each of the ten providers obtain vendor integration approval, a merchant
test instance or sandbox, and a licensed vendor API/bridge specification.
Run checks for:
1. Full menu read, price variants, VAT rates, modifier mapping.
2. Final paid in-venue sales ingest (cash/card/tip/service fee/discount), an
   honest payment verification source, void/refund and closed checks.
3. Event signatures or equivalent authenticated private channel, tenant-venue
   isolation, idempotency, replay resistance, delayed/offline delivery.
4. DrinkStock-origin outbound order only if the provider allows order writes.
5. Exact POS price-write support with optimistic concurrency / rollback or
   explicit observe-only mode. No mismatched guest/POS prices.
6. No duplicate fulfilment when the POS is both the source and recipient.
7. Certified Greek receipt/credit note workflow and AADE/myDATA reconciliation.
8. Verify stable sandbox run (including POS offline and reconnection), then
   a supervised real venue pilot before enabling the provider for production.

Rollout strategy: **Oracle Simphony** is the most directly documented
restaurant transaction API candidate. **Megasoft PRISMA** has published
e-commerce web services. The remaining Greek providers require documented
licensed interfaces through the vendor or reseller before any real connector
implementation can truthfully be called working.

Do not release a fictitious generic provider adapter that claims universal
compatibility. The provider registry is intentionally **not** evidence of
commercial end-to-end integration.

## First concrete API adapter

`src/lib/drinkstock-pos-oracle-menu.ts` now implements the official Oracle
Simphony Transaction Services Gen2 GET `/api/v1/menus/summary` endpoint with
server-supplied bearer ID token and per-revenue-center authorization headers,
HTTPS validation, timeout and bounded JSON response. A mocked-endpoint test
verifies the actual request shape and fail-closed denial behavior.

References:
- https://docs.oracle.com/en/industries/food-beverage/simphony/omsstsg2api/api-configuration-api-v1.html
- https://docs.oracle.com/en/industries/food-beverage/simphony/omsstsg2api/authenticate.html

This is **read-only adapter code tested against simulated HTTP responses**.
No Oracle production account has been linked and there is no evidence of a
successful live API call. Full Oracle checkout integration additionally
requires licensed API account setup, per-venue authorization, check
reconciliation and a separate approved POS payment/fiscal pathway.
