import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminGiftCardsClient } from "../../../components/AdminGiftCardsClient";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../lib/admin-session";
import { adminGiftCards, giftCardsLiveEnabled } from "../../../lib/gift-card-service";

export const metadata: Metadata = { title: "Admin · Gift Cards", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!principal.roles.includes("super_admin")) redirect("/admin");
  const cards = await adminGiftCards(principal).catch(() => []);
  return <main className="vendor-app admin-app"><AdminWorkspaceHeader csrfToken={principal.csrfToken} /><section className="shell vendor-hero vendor-hero-compact"><div><div className="eyebrow">Finance · Stored value</div><h1>Local Gift Cards</h1><p className="lead">Ελεγχόμενη έκδοση και παρακολούθηση stored value. Δημόσια αγορά/checkout παραμένει feature-gated μέχρι να εγκριθεί ο PSP και ο φορολογικός χειρισμός.</p></div></section><section className="shell vendor-section"><AdminGiftCardsClient initial={cards} csrfToken={principal.csrfToken} liveEnabled={giftCardsLiveEnabled()} /></section></main>;
}
