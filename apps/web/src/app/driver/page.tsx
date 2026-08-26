import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { DeliveryDriverWorkspaceClient } from "../../components/DeliveryDriverWorkspaceClient";
import { deliveryDriverDispatchWorkspace } from "../../lib/delivery-dispatch-runtime";
import { getDeliveryDriverMobileMeta } from "../../lib/delivery-driver-mobile-runtime";
import { getDeliveryDriverPresenceState } from "../../lib/delivery-driver-presence";
import { getDeliveryDriverSession } from "../../lib/delivery-driver-session";

export const metadata: Metadata = {
  title: "Driver · KONTA MOY",
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};
export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const principal = await getDeliveryDriverSession();
  if (!principal) redirect("/driver/login");
  const workspace = await deliveryDriverDispatchWorkspace(principal);
  const [driver, meta] = await Promise.all([
    getDeliveryDriverPresenceState(principal),
    getDeliveryDriverMobileMeta(principal),
  ]);
  return <DeliveryDriverWorkspaceClient
    initial={{ ...workspace, driver, meta }}
    driverName={principal.displayName}
    partnerName={principal.partnerName}
  />;
}
