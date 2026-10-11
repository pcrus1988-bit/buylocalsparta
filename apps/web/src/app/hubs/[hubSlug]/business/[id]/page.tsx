import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteHeader } from "../../../../../components/SiteHeader";
import { SiteFooter } from "../../../../../components/SiteFooter";
import { HubClaimPublicContent } from "../../../../../components/HubClaimPublicContent";
import { listPublicHubClaimMedia } from "../../../../../lib/hub-claim-media-runtime";
import { getPublicHubClaim } from "../../../../../lib/hub-claim-runtime";
import { hubClaimPublicPath } from "../../../../../lib/hub-claim-public-url";

type Params = { params: Promise<{ hubSlug: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { hubSlug, id } = await params;
  const profile = await getPublicHubClaim(hubSlug, id);
  if (!profile) return { title: "Καταχώριση μη διαθέσιμη · KONTA MOY", robots: { index: false, follow: false } };
  const canonical = hubClaimPublicPath(profile);
  const description = profile.businessName + " · " + profile.category + " στο KONTA MOY HUB " + profile.hubCity + ". Επαληθευμένη δωρεάν καταχώριση επιχείρησης.";
  return {
    title: profile.businessName + " · HUB " + profile.hubCity + " · KONTA MOY",
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title: profile.businessName + " · KONTA MOY", description, url: canonical, type: "website" }
  };
}

export default async function PublicHubClaimPage({ params }: Params) {
  const { hubSlug, id } = await params;
  const profile = await getPublicHubClaim(hubSlug, id);
  if (!profile) notFound();
  if (id !== profile.slug) permanentRedirect(hubClaimPublicPath(profile));
  const photos = await listPublicHubClaimMedia(profile.id);
  return <main>
    <SiteHeader compact />
    <section className="shell"><HubClaimPublicContent profile={profile} media={photos} /></section>
    <SiteFooter />
  </main>;
}
