# MERIDIO · a KONTA MOY universe application

**Intended URL:** https://meridio.kontamou.site

This folder is deliberately outside the root npm workspaces (`apps/*` and `packages/*`). MERIDIO can be deployed as an independent Vercel project with root directory `products/meridio`, framework `Other` (null), output directory `public`, with no shared production environment credentials.

## Mission

MERIDIO is a digital infrastructure platform for shared ownership, utilization, administration, and governance of real-world physical assets. It is not merely an investment portal, crowdfunding site, rental marketplace, or MDIO-token interface.

Asset worlds: real estate, hospitality, mobility, energy, agriculture, equipment, culture, sport/leisure, land and infrastructure.

## Initial release boundary

The initial release is a deliberately public **prelaunch informational experience** with accessible interactive asset-world exploration and explicit financial/legal non-offering language.

- No authentication, user records, assets or investment opportunities are connected to the production marketplace.
- No real asset, ownership interest, return projection or token is advertised.
- No forms record personal information; the contact link opens the sender's email client.
- No payments, reservations, identity verification, governance actions or token minting are live.
- `robots` prevents indexing until legal/product review and publication approval.
- No dependency is added to KONTA MOY's production build, database, SSO or payment logic.

## Architecture intent

Maintain independent deployments and data boundaries while reusing *reviewed* patterns/contracts from KONTA MOY:

1. **Identity & eligibility:** explicit consent, separate MERIDIO roles; SSO must be designed and authorized before linking KONTA MOY identity.
2. **Assets & evidence:** verified asset registry, document provenance, ownership structure, auditable state transitions.
3. **Participation & ledger:** lawful rights model and append-only, reconciled ledger; prevent direct balance editing.
4. **Utilization:** rights-aware scheduling, quotas, access and fulfillment processes.
5. **Finance:** jurisdictional legal analysis, segregated financial rails, taxes and statements.
6. **Governance:** proposals, voting eligibility, weighting, quorum, immutable decision history.
7. **Restricted marketplace:** transfers only where permitted by applicable law and contract.
8. **MDIO token:** separate exploratory workstream, inactive until explicit legal/security approval.

Never copy KONTA MOY production personal data, vendors, balances, orders or secrets. Never imply that fractional ownership or financial returns are universally lawful. Do not enable investments or tokens merely by implementing buttons.

## Next increments

- Replace static app with independently versioned application runtime and tests.
- Produce jurisdiction-specific regulatory design (Greece / EU), legal entity models, KYC/AML requirements and privacy documentation.
- Define asset, opportunity, participation, rights, utilization, accounting, governance and immutable audit schemas.
- Build admin-side evidence verification and approval workflow before onboarding anything public.
- Implement isolated authentication, RBAC/RLS, rate limiting, observability and security tests.
- Build read-only real opportunity registry after governance approval; transactional functionality remains gated.
- Upgrade SEO from noindex only once content accuracy, consumer disclosures and compliance have been approved.

## Operations

Static runtime: `public/index.html`, `public/styles.css`, `public/app.js`. Health metadata: `/health.json`.
Domain must be mapped to the separate Vercel project, not to the main marketplace project.
