import type { Metadata } from "next";
import { VendorDailyPushBridgeClient } from "../../../components/VendorDailyPushBridgeClient";
import { dailyPushPublicConfiguration } from "../../../lib/daily-push";

export const metadata: Metadata = {
  title: "KONTA MOY Daily · Push activation",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function DailyPushBridgePage() {
  const configuration = await dailyPushPublicConfiguration();
  return <VendorDailyPushBridgeClient configured={configuration.configured} publicKey={configuration.publicKey} />;
}
