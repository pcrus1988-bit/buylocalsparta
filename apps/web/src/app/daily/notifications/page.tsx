import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorDailyBottomNav } from "../../../components/VendorDailyBottomNav";
import { getDailySession } from "../../../lib/daily-session";
import { synchronizeOperationalEvents, vendorAdviceWorkspace } from "../../../lib/vendor-backoffice-service";
import { vendorOrderNotificationWorkspace } from "../../../lib/order-sla";
import { productionDatabaseConfigured } from "../../../lib/postgres-runtime";

export const metadata: Metadata = { title: "KONTA MOY Daily · Ειδοποιήσεις", robots: { index: false, follow: false } };

const when = (value: string | number) => new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens"
}).format(new Date(value));

function payloadString(payload: Record<string, unknown> | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function DailyNotificationsPage() {
  const principal = await getDailySession();
  if (!principal) redirect("/daily/login");
  synchronizeOperationalEvents();

  const [advice, sla] = await Promise.all([
    vendorAdviceWorkspace(principal),
    productionDatabaseConfigured() ? vendorOrderNotificationWorkspace(principal) : Promise.resolve({ metrics: { requiringAction: 0, breached: 0, escalated: 0, unread: 0 }, cases: [], notifications: [] })
  ]);

  const events = [
    ...sla.notifications.map((item) => {
      const orderId = payloadString(item.payload, "orderId");
      return {
        id: `sla:${item.id}`,
        title: item.title,
        body: item.body,
        at: new Date(item.createdAt).getTime(),
        read: Boolean(item.readAt),
        href: orderId ? `/daily/orders?order=${encodeURIComponent(orderId)}` : "/daily/orders",
        label: item.eventType
      };
    }),
    ...advice.notifications.map((item) => ({
      id: `advice:${item.id}`,
      title: item.title,
      body: item.body,
      at: item.createdAt ?? 0,
      read: false,
      href: "/daily/ask-local",
      label: "Ask Local"
    }))
  ].sort((a, b) => b.at - a.at);

  return <main style={{ minHeight: "100dvh", background: "#f5f3ed", color: "#171914", paddingBottom: 104 }}>
    <header style={{ position: "sticky", top: 0, zIndex: 30, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(245,243,237,.95)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(23,25,20,.08)" }}>
      <Link href="/daily" style={{ color: "inherit", textDecoration: "none" }}><span style={{ display: "block", fontSize: 11, letterSpacing: ".14em", fontWeight: 900 }}>KONTA MOY</span><strong>Daily · Alerts</strong></Link>
      <Link href="/daily/notifications/settings" style={{ color: "inherit", textDecoration: "none", border: "1px solid rgba(23,25,20,.15)", borderRadius: 12, padding: "8px 10px", fontSize: 13, fontWeight: 850 }}>Ρυθμίσεις</Link>
    </header>

    <div style={{ width: "min(100%,720px)", margin: "0 auto", padding: "18px 14px" }}>
      <section>
        <span style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 900, opacity: .55 }}>Event timeline</span>
        <h1 style={{ margin: "4px 0 6px", fontSize: 30, letterSpacing: "-.045em" }}>Ιστορικό ειδοποιήσεων</h1>
        <p style={{ margin: 0, opacity: .64, lineHeight: 1.45 }}>Κάθε συμβάν είναι πατήσιμο και σε οδηγεί στην αντίστοιχη παραγγελία ή στο Ask Local.</p>
      </section>

      <section style={{ display: "grid", gap: 9, marginTop: 18 }}>
        {events.length === 0 ? <div style={{ padding: 18, borderRadius: 18, background: "#fff", border: "1px solid rgba(23,25,20,.08)", opacity: .62 }}>Δεν υπάρχουν ειδοποιήσεις.</div> :
          events.map((event) => <Link key={event.id} href={event.href} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "14px 15px", borderRadius: 18, background: "#fff", border: "1px solid rgba(23,25,20,.08)", color: "inherit", textDecoration: "none" }}>
            <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                {!event.read && <span style={{ width: 8, height: 8, borderRadius: 999, background: "#d93b32" }} />}
                <strong style={{ fontSize: 15 }}>{event.title}</strong>
              </div>
              <p style={{ margin: 0, fontSize: 13, opacity: .66 }}>{event.body}</p>
              <small style={{ opacity: .45 }}>{event.at ? when(event.at) : ""} · {event.label}</small>
            </div><span aria-hidden="true" style={{ fontSize: 25, opacity: .3 }}>›</span>
          </Link>)}
      </section>
    </div>

    <VendorDailyBottomNav active="notifications" unread={sla.metrics.unread} />
  </main>;
}
