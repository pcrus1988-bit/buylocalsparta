import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { DeliveryDriverInsightsClient } from "../../components/DeliveryDriverInsightsClient";
import { DeliveryDriverWorkspaceClient } from "../../components/DeliveryDriverWorkspaceClient";
import styles from "../../components/DeliveryOperations.module.css";
import { deliveryDriverDispatchWorkspace } from "../../lib/delivery-dispatch-runtime";
import { getDeliveryDriverMobileMeta } from "../../lib/delivery-driver-mobile-runtime";
import { deliveryDriverOperationsSnapshot } from "../../lib/delivery-operations-reporting";
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
  const [workspace, driver, meta, insights] = await Promise.all([
    deliveryDriverDispatchWorkspace(principal),
    getDeliveryDriverPresenceState(principal),
    getDeliveryDriverMobileMeta(principal),
    deliveryDriverOperationsSnapshot(principal, 30),
  ]);
  return <>
    <DeliveryDriverWorkspaceClient
      initial={{ ...workspace, driver, meta }}
      driverName={principal.displayName}
      partnerName={principal.partnerName}
    />
    <section className={styles.shell}><DeliveryDriverInsightsClient initial={insights} /></section>
  </>;
}
