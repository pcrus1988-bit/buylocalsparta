import type { Metadata } from "next";
import { DailyNotificationFloat, type DailyFloatingNotification } from "../../components/DailyNotificationFloat";
import { ScopedPwaInstallClient } from "../../components/ScopedPwaInstallClient";
import { getDailySession } from "../../lib/daily-session";
import { vendorAdviceWorkspace } from "../../lib/vendor-backoffice-service";
import { vendorOrderNotificationWorkspace } from "../../lib/order-sla";
import { productionDatabaseConfigured } from "../../lib/postgres-runtime";

export const metadata: Metadata = {
  applicationName: "KONTA MOY Daily",
  manifest: "/daily/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KONTA MOY Daily",
    statusBarStyle: "default"
  },
  formatDetection: { telephone: false }
};

function payloadString(payload: Record<string, unknown> | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function DailyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const principal = await getDailySession();
  let floatingEvents: ReadonlyArray<DailyFloatingNotification> = [];
  let floatingUnread = 0;

  if (principal) {
    const [advice, sla] = await Promise.all([
      vendorAdviceWorkspace(principal),
      productionDatabaseConfigured()
        ? vendorOrderNotificationWorkspace(principal)
        : Promise.resolve({ metrics: { requiringAction: 0, breached: 0, escalated: 0, unread: 0 }, cases: [], notifications: [] })
    ]);

    floatingEvents = [
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
    ].sort((a, b) => b.at - a.at).slice(0, 6);

    floatingUnread = sla.notifications.filter((item) => !item.readAt).length + advice.notifications.length;
  }

  return <>
    {children}
    {principal && <DailyNotificationFloat events={floatingEvents} unread={floatingUnread} />}
    <ScopedPwaInstallClient appName="Daily" serviceWorkerPath="/daily-sw.js" scope="/daily" placement="daily" />
  </>;
}
