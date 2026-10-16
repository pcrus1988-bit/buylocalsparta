import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { SiteHeader } from "../../../../components/SiteHeader";
import { SiteFooter } from "../../../../components/SiteFooter";
import { PosoKaneiPreviewClient } from "../../../../components/PosoKaneiPreviewClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "KONTA MOY × PosoKanei — ιδιωτική προεπισκόπηση",
  description: "Δοκιμαστικά δεδομένα και υπολογισμοί τιμών. Όχι επίσημες τιμές καταστημάτων.",
  robots: {index:false,follow:false,noarchive:true,nosnippet:true}
};

export default async function PosoKaneiPrivatePreview() {
  const principal=await getAdminSession();
  if(!principal) redirect("/admin/login");
  if(!hasAdminPermission(principal,"catalog.read")) notFound();
  return <main>
    <SiteHeader compact />
    <PosoKaneiPreviewClient csrfToken={principal.csrfToken} />
    <SiteFooter />
  </main>;
}
