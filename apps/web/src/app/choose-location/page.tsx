import type { Metadata } from "next";
import { LocationGatewayV2, type LocationGatewayRuntimeHubV2 } from "../../components/LocationGatewayV2";
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

  // Only the three fields required to derive the customer-facing availability state
  // cross the server/client boundary. Prospect counts, research state and internal
  // legacy flags stay server-side and are never serialized into the public page.
  const publicRuntimeHubs = runtime.hubs.map((hub) => ({
    hubId: hub.hubId,
    lifecycleState: hub.lifecycleState,
    isLive: hub.isLive
  })) as unknown as readonly LocationGatewayRuntimeHubV2[];

  return <LocationGatewayV2 runtimeHubs={publicRuntimeHubs} />;
}
