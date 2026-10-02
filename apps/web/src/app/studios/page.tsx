import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { StudioHubUniverse } from "../../components/StudioHubUniverse";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { STUDIO_DESTINATIONS } from "../../lib/studio-registry";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/studios", {
    title: "KONTA MOY Studios · Διαδραστική καθοδήγηση αγορών",
    description:
      "Μπες στα KONTA MOY Studios: Sport & Fit, Paint & Build, Style και Color Finder σε μία κοινή διαδραστική εμπειρία."
  });
}

export default function StudiosPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "https://kontamou.site/studios#page",
    url: "https://kontamou.site/studios",
    name: "KONTA MOY Studios",
    description:
      "Διαδραστικά Studios που συνδέουν τις ανάγκες του χρήστη με πραγματικά διαθέσιμα προϊόντα του KONTA MOY.",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: STUDIO_DESTINATIONS.map((studio, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: studio.title,
        url: `https://kontamou.site${studio.href}`
      }))
    }
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }}
      />
      <StudioHubUniverse />
      <SiteFooter />
    </main>
  );
}
