import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeliveryDriverWorkspaceClient } from "../../components/DeliveryDriverWorkspaceClient";
import { deliveryDriverDispatchWorkspace } from "../../lib/delivery-dispatch-runtime";
import { getDeliveryDriverMobileMeta } from "../../lib/delivery-driver-mobile-runtime";
import { getDeliveryDriverPresenceState } from "../../lib/delivery-driver-presence";
import { getDeliveryDriverSession } from "../../lib/delivery-driver-session";

export const metadata: Metadata = {
  title: "Driver · KONTA MOY",
  robots: { index: false, follow: false, nocache: true },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
};
export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const principal = await getDeliveryDriverSession();
  if (!principal) redirect("/driver/login");
  const [workspace, driver, meta] = await Promise.all([
    deliveryDriverDispatchWorkspace(principal),
    getDeliveryDriverPresenceState(principal),
    getDeliveryDriverMobileMeta(principal),
  ]);
  return <DeliveryDriverWorkspaceClient
    initial={{ ...workspace, driver, meta }}
    driverName={principal.displayName}
    partnerName={principal.partnerName}
  />;
}
