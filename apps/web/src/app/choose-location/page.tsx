import type { Metadata } from "next";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { SiteFooter } from "../../components/SiteFooter";
import { LocationGatewayV2, type LocationGatewayRuntimeHubV2 } from "../../components/LocationGatewayV2";
import { assertExpansionHubMaster } from "../../lib/expansion-hubs";
import { getExpansionHubById } from "../../lib/hub-resolver";
import { getExpansionHubRuntimeSnapshot } from "../../lib/expansion-hub-runtime";
import { listPublicClaimHubSlugs } from "../../lib/hub-claim-runtime";

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

  // CLAIM directory presence must not mark the shopping/checkout market as live.
  // Use one bounded DISTINCT lookup for all hubs, not a per-hub database query.
  let claimHubSlugs: string[] = [];
  try {
    claimHubSlugs = await listPublicClaimHubSlugs();
  } catch (error) {
    console.error(JSON.stringify({ event: "hubs.claim_directory_lookup_failed", message: error instanceof Error ? error.message : String(error) }));
  }
  const claimPresence = new Set(claimHubSlugs);
  const publicRuntimeHubs: readonly LocationGatewayRuntimeHubV2[] = runtime.hubs.map((hub) => ({
    hubId: hub.hubId,
    lifecycleState: hub.lifecycleState,
    isLive: hub.isLive,
    hasClaimPresence: claimPresence.has(getExpansionHubById(hub.hubId)?.slug ?? "")
  }));

  return (
    <>
      <LocationGatewayV2 runtimeHubs={publicRuntimeHubs} />
      <SiteFooter />
    </>
  );
}
