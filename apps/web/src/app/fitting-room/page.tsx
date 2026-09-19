import type { Metadata } from "next";
import { getAccountSession } from "../../lib/account-session";
import { FittingRoomExperience } from "../../components/FittingRoomExperience";
import styles from "./page.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = Readonly<{ searchParams: SearchParams }>;

const DEFAULT_STYLE_VENDOR = "vendor_e8cb57b3c67b469d9a9d";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeVendor(value: string | undefined): string {
  const candidate = value?.trim() ?? "";
  return /^[A-Za-z0-9_-]{3,128}$/.test(candidate) ? candidate : DEFAULT_STYLE_VENDOR;
}

export const metadata: Metadata = {
  title: "Fitting Room · KONTA MOY",
  description: "Μπες στο Fitting Room του ΚΟΝΤΑ ΜΟΥ, πες μας τι σου αρέσει και φτιάξε ολοκληρωμένα looks που μπορείς να αλλάξεις, να αποθηκεύσεις και να μοιραστείς.",
  robots: { index: true, follow: true }
};

export default async function FittingRoomPage({ searchParams }: Props) {
  const params = await searchParams;
  const vendorId = safeVendor(first(params.vendor));
  const savedLookId = first(params.saved)?.trim();
  const principal = await getAccountSession();

  return (
    <main className={styles.page}>
      <FittingRoomExperience
        vendorId={vendorId}
        csrfToken={principal?.csrfToken}
        savedLookId={savedLookId}
      />
    </main>
  );
}
