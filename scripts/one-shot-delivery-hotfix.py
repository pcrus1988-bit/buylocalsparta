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


# /admin/delivery and /driver both call ensureOutboundJobs. PostgreSQL was inferring
# the CASE expression as text even though delivery_stops.completed_at is timestamptz.
replace_once(
    "apps/web/src/lib/delivery-driver-runtime.ts",
    "CASE WHEN $8='completed' THEN $9 ELSE NULL END",
    "CASE WHEN $8='completed' THEN $9::timestamptz ELSE NULL::timestamptz END",
)

# Vendor-facing delivery workspace must never expose the customer's last-mile address.
replace_once(
    "apps/web/src/lib/delivery-driver-runtime.ts",
    'return {jobs:jobs.map(job=>({...job,stops:job.stops.map(stop=>stop.vendorId===principal.vendorId&&stop.kind==="vendor_return_dropoff"&&stop.status!=="completed"?{...stop,receiptQr:proofToken("return-receipt",job.id,stop.id)}:stop)}))};',
    'return {jobs:jobs.map(job=>({...job,stops:job.stops.map(stop=>{const safeStop=stop.kind.startsWith("customer")?{...stop,address:{}}:stop;return safeStop.vendorId===principal.vendorId&&safeStop.kind==="vendor_return_dropoff"&&safeStop.status!=="completed"?{...safeStop,receiptQr:proofToken("return-receipt",job.id,safeStop.id)}:safeStop;})}))};',
)

# Production vendor workflow: vendor prepares local delivery, but cannot complete it.
replace_once(
    "packages/postgres-runtime/src/vendor-operations.ts",
    'if(mode!=="pickup") throw new Error("Ready-for-pickup is only valid for pickup fulfilments");',
    'if(!["pickup","local_delivery"].includes(mode)) throw new Error("Ready-for-handover is valid only for pickup or KONTA MOY local delivery");',
)
replace_once(
    "packages/postgres-runtime/src/vendor-operations.ts",
    'await tx.query("UPDATE pickup_groups SET ready_at=COALESCE(ready_at,$2) WHERE fulfilment_order_id=$1",[id,new Date(now)]);',
    'if(mode==="pickup") await tx.query("UPDATE pickup_groups SET ready_at=COALESCE(ready_at,$2) WHERE fulfilment_order_id=$1",[id,new Date(now)]);',
)
replace_between(
    "packages/postgres-runtime/src/vendor-operations.ts",
    '      } else if(input.action==="delivered"){\n',
    '      } else throw new Error("Unsupported fulfilment action");',
    '      } else if(input.action==="delivered"){\n        throw new Error("Local delivery completion is confirmed by the delivery driver after scanning the customer QR.");\n',
)
replace_once(
    "packages/postgres-runtime/src/vendor-operations.ts",
    'if(mode==="local_delivery"&&["accepted","picking","packed","ready_for_handover"].includes(status))return["delivered"]',
    'if(mode==="local_delivery"&&["accepted","picking","packed"].includes(status))return["ready"]',
)

# Keep preview/in-memory behavior aligned with production semantics.
replace_once(
    "apps/web/src/lib/vendor-runtime.ts",
    'if (order.fulfilmentMode !== "pickup") throw new Error("Ready-for-pickup is only valid for pickup fulfilments");',
    'if (!["pickup", "local_delivery"].includes(order.fulfilmentMode)) throw new Error("Ready-for-handover is valid only for pickup or KONTA MOY local delivery");',
)
replace_once(
    "apps/web/src/lib/vendor-runtime.ts",
    'if (input.action === "delivered") {\n    if (!["confirmed", "partially_fulfilled"].includes(order.status)) throw new Error("Order must be confirmed before local delivery can complete");\n    if (order.fulfilmentMode !== "local_delivery") throw new Error("Vendor delivery confirmation is only allowed for local-delivery fulfilments; shipping delivery is carrier-confirmed");\n    return commerceRuntime.commerce.markDelivered(order.id, fulfilment.id, now);\n  }',
    'if (input.action === "delivered") {\n    throw new Error("Local delivery completion is confirmed by the delivery driver after scanning the customer QR.");\n  }',
)
replace_once(
    "apps/web/src/lib/vendor-runtime.ts",
    'if (mode === "local_delivery" && ["accepted", "picking", "packed", "ready_for_handover"].includes(status)) return ["delivered"];',
    'if (mode === "local_delivery" && ["accepted", "picking", "packed"].includes(status)) return ["ready"];',
)

# Lifecycle: customer pickup and platform local delivery are different handoff models.
local_delivery_ready = '''    } else if (input.action === "ready") {
      await client.query(`
        UPDATE order_lines SET status='accepted'
        WHERE id IN (SELECT order_line_id FROM fulfilment_order_lines WHERE fulfilment_order_id=$1)
          AND status='awaiting_vendor'
      `, [row.fulfilment_uuid]);
      if (row.mode === "pickup") {
        const pickup = await ensurePickupGroup(client, {
          fulfilmentUuid: row.fulfilment_uuid,
          fulfilmentId: row.fulfilment_id,
          vendorUuid: row.vendor_uuid,
          vendorId: row.vendor_id,
          vendorName: row.vendor_name,
          fulfilmentStatus: row.fulfilment_status,
          now
        });
        await insertTimelineOnce(client, {
          orderUuid: row.order_uuid,
          fulfilmentUuid: row.fulfilment_uuid,
          vendorUuid: row.vendor_uuid,
          eventType: "pickup.ready",
          actorType: "vendor",
          actorPublicId: principal.userId,
          message: `${row.vendor_name}: η παραγγελία είναι έτοιμη για παραλαβή.`,
          metadata: { fulfilmentId: row.fulfilment_id, pickupId: pickup.pickup_public_id },
          now
        });
        if (row.user_uuid) {
          const code = pickupShortCode(pickup.pickup_public_id, row.fulfilment_id);
          await notifyCustomerState(client, {
            userUuid: row.user_uuid,
            orderId: row.order_id,
            fulfilmentId: row.fulfilment_id,
            state: "ready",
            title: "Η παραγγελία σου είναι έτοιμη για παραλαβή",
            inAppBody: `${row.vendor_name}: δείξε το QR παραλαβής ή τον κωδικό ${code} στο κατάστημα.`,
            emailBody: [
              `Η παραγγελία ${row.order_id} είναι έτοιμη στο «${row.vendor_name}».`,
              "",
              "Οδηγίες παραλαβής:",
              "1. Άνοιξε την παραγγελία σου από το KONTA MOY.",
              "2. Δείξε στο κατάστημα το QR παραλαβής που εμφανίζεται στην οθόνη.",
              `3. Εναλλακτικός 6ψήφιος κωδικός: ${code}`,
              "",
              `QR & στοιχεία παραλαβής: ${publicBaseUrl()}/account/orders/${encodeURIComponent(row.order_id)}`,
              "",
              "Το κατάστημα ολοκληρώνει την παραλαβή με ασφαλή σάρωση του QR.",
              "",
              "KONTA MOY · Buy Local Sparta"
            ].join("\\n"),
            now
          });
        }
      } else if (row.mode === "local_delivery") {
        await insertTimelineOnce(client, {
          orderUuid: row.order_uuid,
          fulfilmentUuid: row.fulfilment_uuid,
          vendorUuid: row.vendor_uuid,
          eventType: "delivery.vendor_ready",
          actorType: "vendor",
          actorPublicId: principal.userId,
          message: `${row.vendor_name}: η παραγγελία είναι έτοιμη για παραλαβή από οδηγό ΚΟΝΤΑ ΜΟΥ.`,
          metadata: { fulfilmentId: row.fulfilment_id },
          now
        });
        if (row.user_uuid) {
          await notifyCustomerState(client, {
            userUuid: row.user_uuid,
            orderId: row.order_id,
            fulfilmentId: row.fulfilment_id,
            state: "ready_for_driver",
            title: "Η παραγγελία σου είναι έτοιμη για τον οδηγό",
            inAppBody: `${row.vendor_name}: η παραγγελία ετοιμάστηκε και περιμένει παραλαβή από οδηγό ΚΟΝΤΑ ΜΟΥ.`,
            emailBody: [
              `Η παραγγελία ${row.order_id} ετοιμάστηκε στο «${row.vendor_name}».`,
              "",
              "Δεν χρειάζεται να μεταβείς στο κατάστημα. Ο οδηγός ΚΟΝΤΑ ΜΟΥ θα την παραλάβει και η παρακολούθηση θα ενημερωθεί μετά τη σάρωση παραλαβής.",
              `Παρακολούθηση: ${publicBaseUrl()}/account/orders/${encodeURIComponent(row.order_id)}`,
              "",
              "KONTA MOY · Buy Local Sparta"
            ].join("\\n"),
            now
          });
        }
      } else {
        throw new Error("Ready action is not supported for this fulfilment mode");
      }
'''
replace_between(
    "apps/web/src/lib/order-lifecycle.ts",
    '    } else if (input.action === "ready") {\n',
    '    } else if (input.action === "delivered") {',
    local_delivery_ready,
)

# Daily Orders: never reveal customer PII; local delivery becomes ready for driver.
replace_once(
    "apps/web/src/components/VendorDailyOrdersClient.tsx",
    'const DELIVERY_REVEAL_STATUSES = new Set(["accepted", "picking", "packed", "ready_for_handover"]);',
    'const DELIVERY_REVEAL_STATUSES = new Set<string>();',
)
replace_once(
    "apps/web/src/components/VendorDailyOrdersClient.tsx",
    'if (item.mode === "pickup" && item.status === "ready_for_handover") return "ready";',
    'if ((item.mode === "pickup" || item.mode === "local_delivery") && item.status === "ready_for_handover") return "ready";',
)
replace_once(
    "apps/web/src/components/VendorDailyOrdersClient.tsx",
    ': actionLabel[action] ?? action}',
    ': action === "ready" && item.mode === "local_delivery" ? "Έτοιμο για οδηγό" : actionLabel[action] ?? action}',
)
replace_once(
    "apps/web/src/components/VendorDailyOrdersClient.tsx",
    '<Link href="/daily/scan" className={styles.scanButton}>Σάρωση QR παραλαβής</Link>',
    '<Link href="/daily/scan" className={styles.scanButton}>{item.mode === "local_delivery" ? "Σάρωση QR οδηγού" : "Σάρωση QR παραλαβής"}</Link>',
)

# Daily scanner handles both customer pickup QR and driver-presented custody QR.
replace_once(
    "apps/web/src/app/daily/scan/page.tsx",
    'export default async function DailyScanPage() {\n  if (!await getDailySession()) redirect("/daily/login");\n  return <VendorDailyScanner />;\n}',
    'export default async function DailyScanPage() {\n  const principal = await getDailySession();\n  if (!principal) redirect("/daily/login");\n  return <VendorDailyScanner csrfToken={principal.csrfToken} />;\n}',
)
replace_once(
    "apps/web/src/components/VendorDailyScanner.tsx",
    'export function VendorDailyScanner() {',
    'export function VendorDailyScanner({ csrfToken }: { csrfToken: string }) {',
)
scanner_open = '''  async function openToken(raw: string) {
    const token = pickupToken(raw);
    if (!token) return;
    stop();
    if (token.startsWith("kmd1.pickup.")) {
      setStatus("starting");
      try {
        const response = await fetch("/api/daily/delivery", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ token })
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Η επιβεβαίωση παραλαβής απέτυχε.");
        setMessage("Η παραλαβή από τον οδηγό επιβεβαιώθηκε.");
        router.push("/daily/orders?category=processing");
      } catch (cause) {
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "Η επιβεβαίωση παραλαβής απέτυχε.");
      }
      return;
    }
    router.push(`/daily/pickup?token=${encodeURIComponent(token)}`);
  }

'''
replace_between(
    "apps/web/src/components/VendorDailyScanner.tsx",
    '  function openToken(raw: string) {\n',
    '  async function refreshPermission() {',
    scanner_open,
)
replace_once(
    "apps/web/src/components/VendorDailyScanner.tsx",
    'if (result) openToken(result.getText());',
    'if (result) void openToken(result.getText());',
)
replace_once(
    "apps/web/src/components/VendorDailyScanner.tsx",
    'event.preventDefault(); openToken(manual);',
    'event.preventDefault(); void openToken(manual);',
)

# Defense in depth: these vendor endpoints no longer provide local-delivery customer PII.
Path("apps/web/src/app/api/daily/fulfilments/delivery-contact/route.ts").write_text('''import { requireDailySession } from "../../../../../lib/daily-session";

export async function POST(request: Request) {
  try {
    await requireDailySession(request, true);
    return Response.json({ error: "Η διεύθυνση πελάτη είναι διαθέσιμη μόνο στον ανατεθειμένο οδηγό και στους εξουσιοδοτημένους διαχειριστές παράδοσης." }, {
      status: 403,
      headers: { "cache-control": "no-store, private" }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_contact_denied" }, {
      status: 400,
      headers: { "cache-control": "no-store, private" }
    });
  }
}
''')
Path("apps/web/src/app/api/vendor/fulfilments/delivery-contact/route.ts").write_text('''import { requireVendorSession } from "../../../../../lib/vendor-session";

export async function POST(request: Request) {
  try {
    await requireVendorSession(request, true);
    return Response.json({ error: "Η διεύθυνση πελάτη είναι διαθέσιμη μόνο στον ανατεθειμένο οδηγό και στους εξουσιοδοτημένους διαχειριστές παράδοσης." }, {
      status: 403,
      headers: { "cache-control": "no-store, private" }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_contact_denied" }, {
      status: 400,
      headers: { "cache-control": "no-store, private" }
    });
  }
}
''')

# Regression guards for this exact incident.
driver_runtime = Path("apps/web/src/lib/delivery-driver-runtime.ts").read_text()
vendor_ops = Path("packages/postgres-runtime/src/vendor-operations.ts").read_text()
daily_orders = Path("apps/web/src/components/VendorDailyOrdersClient.tsx").read_text()
lifecycle = Path("apps/web/src/lib/order-lifecycle.ts").read_text()
scanner = Path("apps/web/src/components/VendorDailyScanner.tsx").read_text()
assert "THEN $9::timestamptz" in driver_runtime
assert 'local_delivery"&&["accepted","picking","packed"]' in vendor_ops
assert 'return["delivered"]' not in vendor_ops.split("function fulfilmentActions", 1)[-1]
assert 'const DELIVERY_REVEAL_STATUSES = new Set<string>();' in daily_orders
assert 'state: "ready_for_driver"' in lifecycle
assert 'token.startsWith("kmd1.pickup.")' in scanner
