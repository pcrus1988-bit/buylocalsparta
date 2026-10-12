import type { Metadata } from "next";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { SiteFooter } from "../../components/SiteFooter";
import { LocationGatewayV2, type LocationGatewayRuntimeHubV2 } from "../../components/LocationGatewayV2";
import { assertExpansionHubMaster } from "../../lib/expansion-hubs";
import { getExpansionHubById } from "../../lib/hub-resolver";
import { getExpansionHubRuntimeSnapshot } from "../../lib/expansion-hub-runtime";
import { listPublicClaimHubSlugs } from "../../lib/hub-claim-runtime";
import { listVerifiedHubPartnerSlugs } from "../../lib/hub-verified-partners";

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

  // CLAIM and activated paid-plan presence are directory-only, never proof that
  // local shopping or checkout infrastructure is ready for customers.
  const [claimHubSlugs, partnerHubSlugs] = await Promise.all([
    listPublicClaimHubSlugs().catch((error) => {
      console.error(JSON.stringify({ event: "hubs.claim_directory_lookup_failed", message: String(error) }));
      return [] as string[];
    }),
    listVerifiedHubPartnerSlugs().catch((error) => {
      console.error(JSON.stringify({ event: "hubs.partner_directory_lookup_failed", message: String(error) }));
      return [] as string[];
    })
  ]);
  const directoryPresence = new Set([...claimHubSlugs, ...partnerHubSlugs]);
  const publicRuntimeHubs: readonly LocationGatewayRuntimeHubV2[] = runtime.hubs.map((hub) => ({
    hubId: hub.hubId,
    lifecycleState: hub.lifecycleState,
    isLive: hub.isLive,
    // Compatibility field for directory activation; includes all verified HUB plans.
    hasClaimPresence: directoryPresence.has(getExpansionHubById(hub.hubId)?.slug ?? "")
  }));

  return (
    <>
      <LocationGatewayV2 runtimeHubs={publicRuntimeHubs} />
      <SiteFooter />
    </>
  );
}
