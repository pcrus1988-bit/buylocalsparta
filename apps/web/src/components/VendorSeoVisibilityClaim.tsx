import type { VendorSeoVisibility } from "../lib/seo-vendor-visibility";
import styles from "./VendorSeoVisibilityClaim.module.css";

type Props = Readonly<{
  vendorId: string;
  vendorName: string;
  visibility: VendorSeoVisibility;
}>;

const number = new Intl.NumberFormat("el-GR");
const date = new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formattedDay(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : date.format(parsed);
}

export function VendorSeoVisibilityClaim({ vendorId, vendorName, visibility }: Props) {
  const latest = [visibility.latestSearchConsoleDay, visibility.latestAnalyticsDay]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const latestLabel = formattedDay(latest);
  const claimHref = `/join?vendor=${encodeURIComponent(vendorId)}&source=seo_visibility`;

  return (
    <aside className={styles.banner} aria-label={`Ορατότητα της σελίδας ${vendorName} στη Google`}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <span className={styles.kicker}>Πραγματικά δεδομένα ορατότητας</span>
          <strong>Αυτή η σελίδα ήδη βρίσκει κοινό στη Google.</strong>
          <p>
            Αυτόν τον μήνα εμφανίστηκε <b>{number.format(visibility.googleImpressions)}</b> φορές στα αποτελέσματα Google
            {visibility.organicVisits > 0 ? <> και έφερε <b>{number.format(visibility.organicVisits)}</b> οργανικές επισκέψεις στο ΚΟΝΤΑ ΜΟΥ</> : null}.
          </p>
          <small>
            Google Search Console{visibility.organicVisits > 0 ? " + Google Analytics" : ""}
            {latestLabel ? ` · δεδομένα έως ${latestLabel}` : ""}. Οι αριθμοί ενημερώνονται αυτόματα.
          </small>
        </div>
        <div className={styles.action}>
          <span>Είσαι η επιχείρηση;</span>
          <a className="button" href={claimHref}>Ενεργοποίησε τη σελίδα</a>
        </div>
      </div>
    </aside>
  );
}
