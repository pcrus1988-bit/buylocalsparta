# KONTA MOY accessibility manual verification matrix

KONTA MOY targets WCAG 2.2 Level AA as a product baseline. Automated browser checks are necessary, but they do not establish conformance on their own. Governance records must remain `not_tested` until there is criterion-level evidence from the required manual checks.

## Required test environments

- Keyboard only in Chromium and Firefox on desktop.
- NVDA with Chrome and Firefox on Windows.
- VoiceOver with Safari on macOS and iOS.
- TalkBack with Chrome on Android.
- Native browser/text enlargement to 200% and reflow at a 320 CSS-pixel viewport (400% equivalent for a 1280px reference width).
- Windows forced-colors / High Contrast Mode.
- `prefers-reduced-motion: reduce` and the KONTA MOY reduced-motion preference.
- WCAG text-spacing override: line height 1.5, paragraph spacing 2× font size, letter spacing 0.12em, word spacing 0.16em.

## Product scopes

Verify every applicable success criterion in each deployed scope:

- Public storefront and discovery.
- Customer account.
- Cart and checkout.
- Vendor workspace.
- Daily vendor workflow.
- Admin workspace.
- Driver experience, when deployed.
- Delivery Manager experience, when deployed.

For every criterion record: Pass / Fail / N/A, route and state, test method, browser/assistive technology, tester and date, evidence URL or capture, linked finding, remediation, and retest evidence.

## Manual checks that automation cannot replace

1. Keyboard order is logical; all controls are operable; no keyboard trap exists; skip navigation works.
2. Focus is always visible and is moved/restored correctly for dialogs, drawers, popovers, menus, validation errors and route transitions.
3. Landmarks, headings, lists, tables and regions communicate the same structure conveyed visually.
4. Link purpose, button names, icon controls and product actions make sense when announced out of visual context.
5. Forms expose labels, instructions, required state, autocomplete purpose, errors, corrections and success/status messages programmatically.
6. Meaningful images have equivalent alternative text; decorative imagery is ignored; product media does not encode essential information only visually.
7. Dynamic cart, search, filters, favourites, stock, delivery, checkout and order-status changes are announced without unexpectedly moving focus.
8. Content remains usable at 200% enlargement, narrow reflow, increased text spacing and mobile text scaling without clipped or overlapping controls.
9. Information does not rely only on colour; text and non-text contrast remain sufficient in normal, hover, focus, disabled and selected states.
10. Pointer targets and adjacent controls are large and separated enough for touch use; gestures have a simple alternative.
11. Animation, auto-updating content and time limits can be paused, stopped, extended or avoided where WCAG requires it.
12. Screen-reader reading order matches visual order and all key user journeys can be completed without sight.
13. Authentication, account recovery, checkout and payment flows avoid unnecessary cognitive tests and expose accessible error recovery.
14. Greek is the default document language and any passages in another language are marked where pronunciation depends on it.

## Release rule

A release must not be described as “WCAG 2.2 AA compliant” until every applicable Level A and AA criterion in every production scope has evidence and all blocking findings are closed and retested. The accessibility personalisation panel is an optional user aid; it must never be treated as a substitute for accessible application code.
