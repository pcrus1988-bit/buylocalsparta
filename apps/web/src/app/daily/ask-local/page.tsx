import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyAskLocalV2 } from "../../../components/VendorDailyAskLocalV2";
import { getDailySession } from "../../../lib/daily-session";
import { expireVendorAskLocalOffers, vendorAskLocalOfferStates, vendorPurchasableAskLocalProducts } from "../../../lib/ask-local-lifecycle-service";
import { synchronizeOperationalEvents, vendorAdviceWorkspace } from "../../../lib/vendor-backoffice-service";
import { vendorAskLocalRichContext } from "../../../lib/vendor-ask-local-rich-context";

export const metadata: Metadata = { title: "KONTA MOY Daily · Ask Local", robots: { index: false, follow: false } };

export default async function DailyAskLocalPage() {
  const principal = await getDailySession();
  if (!principal) redirect("/daily/login");
  synchronizeOperationalEvents();
  await expireVendorAskLocalOffers(principal);
  const [advice, offerProducts, offerStates, richRequests] = await Promise.all([
    vendorAdviceWorkspace(principal),
    vendorPurchasableAskLocalProducts(principal),
    vendorAskLocalOfferStates(principal),
    vendorAskLocalRichContext(principal)
  ]);
  return <VendorDailyAskLocalV2 initial={{ ...advice, offerProducts, offerStates, richRequests }} />;
}
