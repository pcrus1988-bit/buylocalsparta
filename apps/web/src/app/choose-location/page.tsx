import type { Metadata } from "next";
import { LocationGatewayV2 } from "../../components/LocationGatewayV2";
import { assertExpansionHubMaster } from "../../lib/expansion-hubs";
import { getExpansionHubRuntimeSnapshot } from "../../lib/expansion-hub-runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Επίλεξε περιοχή | ΚΟΝΤΑ ΜΟΥ",
  description: "Επίλεξε την πόλη ή περιοχή σου και δες αν η τοπική αγορά ΚΟΝΤΑ ΜΟΥ είναι διαθέσιμη, ετοιμάζεται ή βρίσκεται στο πλάνο.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true
  }
};

export default async function ChooseLocationPage() {
  assertExpansionHubMaster();
  const runtime = await getExpansionHubRuntimeSnapshot();
  const publicRuntimeHubs = runtime.hubs.map((hub) => ({
    hubId: hub.hubId,
    lifecycleState: hub.lifecycleState,
    prospectCount: hub.prospectCount,
    researchStatus: hub.researchStatus,
    isLive: hub.isLive,
    isSpartaLegacy: hub.isSpartaLegacy
  }));
  return <LocationGatewayV2 runtimeHubs={publicRuntimeHubs} />;
}
