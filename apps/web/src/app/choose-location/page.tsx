import type { Metadata } from "next";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { SiteFooter } from "../../components/SiteFooter";
import { LocationGatewayV2, type LocationGatewayRuntimeHubV2 } from "../../components/LocationGatewayV2";
import { assertExpansionHubMaster } from "../../lib/expansion-hubs";
import { getExpansionHubRuntimeSnapshot } from "../../lib/expansion-hub-runtime";

export const dynamic = "force-dynamic";

// The location selector is an independently indexable public landing page.
// Keep its canonical and robots metadata under the shared global SEO policy.
export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/choose-location", {
    title: "Επίλεξε περιοχή",
    description: "Βρες την πόλη ή την περιοχή σου στην Ελλάδα και ανακάλυψε πού είναι διαθέσιμη η τοπική αγορά ΚΟΝΤΑ ΜΟΥ, ποια νέα HUB ετοιμάζονται και πώς μπορείς να συμμετέχεις.",
    canonicalPath: "/choose-location"
  });
}

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

  return (
    <>
      <LocationGatewayV2 runtimeHubs={publicRuntimeHubs} />
      <SiteFooter />
    </>
  );
}
