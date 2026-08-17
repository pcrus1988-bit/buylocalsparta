# Buy Local Sparta — Accessibility Standard

**Target:** WCAG 2.2 AA
**Build:** 0.14.0

Accessibility is part of the definition of done for the customer storefront, merchant workspace and platform backoffice. The automated checks in this repository are regression guards; they are **not** a substitute for a human WCAG audit.

## Implemented structural controls

- Semantic `main` landmark with a keyboard-reachable skip link.
- Explicit primary-navigation accessible names.
- Visible `:focus-visible` treatment for keyboard users.
- `prefers-reduced-motion` handling.
- Form-label association and fallback ARIA naming for generated controls.
- Live status/error semantics for dynamic status regions.
- Column scope for generated table headers and descriptive table labels where context is available.
- Greek/English `lang` metadata on localized public pages.
- UI parser checks for every generated development interface so malformed inline JavaScript does not silently break accessible behavior.

`npm run test:a11y` renders the customer, vendor, admin, merchant-onboarding and localized public pages and verifies the structural controls above. It intentionally fails if a page loses its skip target, main landmark, navigation label, focus treatment or reduced-motion rule.

## Human acceptance matrix required before launch

The following remains a launch gate and cannot be proven by static tests alone:

1. **Keyboard only:** search, filter, add to cart, checkout, account, chat, appointment, return, vendor order processing and Admin operations without a pointer.
2. **Screen readers:** NVDA + Firefox/Chrome on Windows, JAWS where commercially available, and VoiceOver + Safari on macOS/iOS.
3. **Zoom/reflow:** 200% and 400% browser zoom, narrow mobile viewport, no horizontal loss of essential controls/content except legitimate data tables.
4. **Contrast/non-color cues:** text, focus, validation, status, charts/KPIs and disabled states.
5. **Forms and errors:** programmatic labels, instructions, required fields, error summaries, inline errors and focus movement after failed checkout/onboarding actions.
6. **Dynamic updates:** search-result counts, cart changes, notifications, chat, fulfilment status, loading and errors announced without unexpected focus changes.
7. **Touch/mobile:** target sizes and spacing for daily vendor operations on a phone.
8. **Media:** meaningful alt text, decorative-image handling, captions/transcripts for editorial video and no auto-playing motion/audio.
9. **Documents:** customer-facing tax/return/legal documents must be accessible or have an equivalent accessible HTML route/support path.
10. **Authentication:** no inaccessible CAPTCHA-only dependency; recovery and MFA flows require accessible alternatives.

## Development rule

New UI work must preserve existing landmarks and keyboard semantics. A visually polished component is not complete when it can only be operated by mouse/touch. If a third-party payment, maps, calendar or support widget cannot meet the accessibility target, the integration must provide an accessible alternative path rather than hiding the defect.
