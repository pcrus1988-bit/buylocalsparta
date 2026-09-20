import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getAccountSession } from "../../lib/account-session";
import { resolveHubContext } from "../../lib/hub-resolver";
import { HUB_LOCALITY_COOKIE } from "../../lib/primary-location-gateway";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { FittingRoomExperience } from "../../components/FittingRoomExperience";
import styles from "./page.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = Readonly<{ searchParams: SearchParams }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeVendor(value: string | undefined): string | undefined {
  const candidate = value?.trim() ?? "";
  if (!candidate) return undefined;
  return /^[A-Za-z0-9_-]{3,128}$/.test(candidate) ? candidate : undefined;
}

export async function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/fitting-room", {
    title: "Fitting Room · KONTA MOY",
    description: "Μπες στο Fitting Room του ΚΟΝΤΑ ΜΟΥ, πες μας τι σου αρέσει και φτιάξε ολοκληρωμένα looks που μπορείς να αλλάξεις, να αποθηκεύσεις και να μοιραστείς."
  });
}

export default async function FittingRoomPage({ searchParams }: Props) {
  const params = await searchParams;
  const vendorId = safeVendor(first(params.vendor));
  const savedLookId = first(params.saved)?.trim();
  const cookieStore = await cookies();
  const hub = resolveHubContext({
    pathname: "/fitting-room",
    selectedSlug: cookieStore.get(HUB_LOCALITY_COOKIE)?.value
  }).hub;
  const principal = await getAccountSession();

  return (
    <main className={styles.page}>
      <div className={styles.announcement}>KONTA MOY FITTING ROOM · Your look, your choices.</div>
      <SiteHeader />
      <FittingRoomExperience
        vendorId={vendorId}
        hubSlug={hub.slug}
        hubName={hub.nameEl}
        csrfToken={principal?.csrfToken}
        savedLookId={savedLookId}
      />
      <SiteFooter />
    </main>
  );
}
