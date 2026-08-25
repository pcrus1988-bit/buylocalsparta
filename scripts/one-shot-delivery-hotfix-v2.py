from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, got {count}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))


def replace_between(path: str, start_marker: str, end_marker: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"Start marker not found in {path}: {start_marker!r}")
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        raise SystemExit(f"End marker not found in {path}: {end_marker!r}")
    p.write_text(text[:start] + replacement + text[end:])


# The full vendor orders workspace must follow the same KONTA MOY last-mile privacy boundary
# as Daily: stores prepare and hand over, while the assigned driver receives destination PII.
replace_once(
    "apps/web/src/components/VendorOrdersClient.tsx",
    'const deliveryRevealStatuses = new Set(["accepted", "picking", "packed", "ready_for_handover"]);',
    'const deliveryRevealStatuses = new Set<string>();',
)
replace_once(
    "apps/web/src/components/VendorOrdersClient.tsx",
    '<p><strong>Στοιχεία παράδοσης:</strong> για τοπική παράδοση εμφανίζονται μόνο όταν τα ζητήσεις για ενεργή ανάθεση. Η πρόσβαση καταγράφεται και τα στοιχεία χρησιμοποιούνται αποκλειστικά για τη συγκεκριμένη παράδοση.</p>',
    '<p><strong>Στοιχεία παράδοσης:</strong> στην τοπική παράδοση ΚΟΝΤΑ ΜΟΥ η διεύθυνση και το τηλέφωνο του πελάτη δεν εμφανίζονται στο κατάστημα. Είναι διαθέσιμα μόνο στον ανατεθειμένο οδηγό και στους εξουσιοδοτημένους διαχειριστές παράδοσης.</p>',
)
replace_once(
    "apps/web/src/components/VendorOrdersClient.tsx",
    '{busy === `${item.id}:${action}` ? "Ενημέρωση…" : actionLabel[action] ?? vendorStatusLabel(action)}',
    '{busy === `${item.id}:${action}` ? "Ενημέρωση…" : action === "ready" && item.mode === "local_delivery" ? "Έτοιμο για οδηγό" : actionLabel[action] ?? vendorStatusLabel(action)}',
)

# Update the repository privacy contract test: the old policy explicitly permitted vendor
# disclosure. KONTA MOY platform last-mile now forbids vendor destination disclosure entirely.
verify = Path("scripts/verify-fulfilment-data-minimization.ts")
text = verify.read_text()
old = '''requireText(vendorRuntime, 'if (!["accepted", "picking", "packed", "ready_for_handover"].includes(fulfilmentStatus))', "Vendor delivery reveal must be limited to active accepted fulfilments");
requireText(vendorRuntime, 'accessRoute = "/api/vendor/fulfilments/delivery-contact"', "Shared delivery reveal must default to the vendor route while allowing the Daily route to be recorded accurately");
requireText(vendorRuntime, 'type: "personal_data.revealed"', "Vendor delivery reveal must create a personal-data access event");
requireText(vendorRuntime, 'purpose: "order_fulfilment"', "Vendor delivery reveal must record its fulfilment purpose");
requireText(vendorRuntime, 'dataClasses: "identity,contact,address"', "Vendor delivery reveal must record disclosed data classes");
requireText(vendorDeliveryRoute, "requireVendorSession(request, true)", "Vendor delivery reveal endpoint must require authenticated CSRF-protected vendor access");
requireText(vendorDeliveryRoute, '\"cache-control\": \"no-store, private\"', "Vendor delivery contact responses must not be cached");
requireText(vendorOrdersClient, "Εμφάνιση στοιχείων παράδοσης", "Vendor must explicitly request local-delivery personal data");
requireText(vendorOrdersClient, "Η πρόσβαση καταγράφεται", "Vendor UI must tell the operator that personal-data access is logged");
requireText(vendorOrdersClient, 'delete next[fulfilmentId]', "Revealed delivery data must be removable from vendor client state after use/status change");

requireText(dailyDeliveryRoute, "requireDailySession(request, true)", "Daily delivery reveal endpoint must require authenticated CSRF-protected Daily access");
requireText(dailyDeliveryRoute, 'vendorLocalDeliveryContact(principal, fulfilmentId, "/api/daily/fulfilments/delivery-contact")', "Daily must reuse the shared delivery reveal policy and record its own access route");
requireText(dailyDeliveryRoute, '\"cache-control\": \"no-store, private\"', "Daily delivery contact responses must not be cached");
requireText(dailyOrdersClient, 'fetch("/api/daily/fulfilments/delivery-contact"', "Daily must fetch delivery data only after an explicit operator action");
requireText(dailyOrdersClient, "Δεν φορτώνονται αυτόματα", "Daily must explain that delivery personal data is not preloaded");
requireText(dailyOrdersClient, "Η πρόσβαση καταγράφεται", "Daily must disclose that personal-data access is logged");
requireText(dailyOrdersClient, 'delete next[item.id]', "Daily must remove revealed delivery data from client state after completion/rejection");
'''
new = '''requireText(vendorDeliveryRoute, "requireVendorSession(request, true)", "Vendor delivery-contact endpoint must remain authenticated and CSRF protected even when disclosure is denied");
requireText(vendorDeliveryRoute, "διαθέσιμη μόνο στον ανατεθειμένο οδηγό", "Vendor delivery-contact endpoint must deny customer destination disclosure");
requireText(vendorDeliveryRoute, '\"cache-control\": \"no-store, private\"', "Vendor delivery-contact denial responses must not be cached");
requireText(vendorOrdersClient, 'const deliveryRevealStatuses = new Set<string>();', "Vendor workspace must never make KONTA MOY local-delivery destination PII revealable");
requireText(vendorOrdersClient, "δεν εμφανίζονται στο κατάστημα", "Vendor workspace must explain the platform-driver privacy boundary");

requireText(dailyDeliveryRoute, "requireDailySession(request, true)", "Daily delivery-contact endpoint must remain authenticated and CSRF protected even when disclosure is denied");
requireText(dailyDeliveryRoute, "διαθέσιμη μόνο στον ανατεθειμένο οδηγό", "Daily delivery-contact endpoint must deny customer destination disclosure");
requireText(dailyDeliveryRoute, '\"cache-control\": \"no-store, private\"', "Daily delivery-contact denial responses must not be cached");
requireText(dailyOrdersClient, 'const DELIVERY_REVEAL_STATUSES = new Set<string>();', "Daily must never make KONTA MOY local-delivery destination PII revealable");
'''
if old not in text:
    raise SystemExit("Could not find the legacy vendor/Daily delivery disclosure test contract")
verify.write_text(text.replace(old, new, 1))

# The runtime helper may remain for historical migrations/diagnostics, but no vendor-facing route
# is allowed to invoke it. This ensures the deny-by-default boundary is encoded in the test.
text = verify.read_text()
text = text.replace(
    'const [addressService, checkoutRoute, checkoutClient, guardMigration, vendorRuntime, vendorOrdersClient, vendorDeliveryRoute, vendorOperations, dailyOrdersClient, dailyDeliveryRoute, boxNowRuntime, boxNowLabelRoute] = await Promise.all([',
    'const [addressService, checkoutRoute, checkoutClient, guardMigration, vendorRuntime, vendorOrdersClient, vendorDeliveryRoute, vendorOperations, dailyOrdersClient, dailyDeliveryRoute, boxNowRuntime, boxNowLabelRoute] = await Promise.all([',
    1,
)
verify.write_text(text)

print("Updated vendor/Daily platform-delivery privacy contract.")
