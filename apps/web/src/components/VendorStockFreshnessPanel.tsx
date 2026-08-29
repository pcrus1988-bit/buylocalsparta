import type { VendorStockFreshnessSnapshot } from "../lib/vendor-stock-freshness";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

function when(value?: number): string {
  if (!value) return "Δεν έχει επιβεβαιωθεί";
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
}

function duration(seconds: number): string {
  if (!seconds) return "χωρίς έγκυρο όριο";
  const hours = Math.round(seconds / 3600);
  if (hours % 24 !== 0) return `${hours} ώρες`;
  const days = hours / 24;
  return days === 1 ? "1 ημέρα" : `${days} ημέρες`;
}

export function VendorStockFreshnessPanel({ snapshot }: { snapshot: VendorStockFreshnessSnapshot }) {
  if (!snapshot.available || snapshot.items.length === 0) return null;
  const stale = snapshot.items.filter((item) => !item.fresh);

  return <section className="shell vendor-section">
    <WorkspaceSectionHeading eyebrow="Διαθεσιμότητα" title="Πρόσφατη επιβεβαίωση αποθέματος" note="Το ΚΟΝΤΑ ΜΟΥ δεν διαφημίζει ως διαθέσιμο stock που έχει μείνει χωρίς πρόσφατη επιβεβαίωση. Αυτό προστατεύει από overselling και κρατά σωστά τα στοιχεία που βλέπουν πελάτες και Google." />
    <WorkspaceMetricStrip items={[
      { label: "Πρόσφατα", value: snapshot.freshCount, tone: snapshot.freshCount ? "positive" : "default" },
      { label: "Χρειάζονται επιβεβαίωση", value: snapshot.staleCount, tone: snapshot.staleCount ? "attention" : "positive" },
      { label: "Stock εκτός online διαθεσιμότητας", value: snapshot.staleSellableCount, tone: snapshot.staleSellableCount ? "attention" : "positive", hint: "Έχουν ποσότητα, αλλά η επιβεβαίωση έληξε" }
    ]} />

    {stale.length > 0
      ? <>
        <div className="workspace-inline-note" style={{ marginTop: 18 }}><strong>Τι χρειάζεται:</strong> έλεγξε την πραγματική ποσότητα και πάτησε «Αποθήκευση αποθέματος» στο προϊόν. Ακόμη κι αν η ποσότητα δεν άλλαξε, η αποθήκευση ανανεώνει την επιβεβαίωση.</div>
        <div className="workspace-queue-list" style={{ marginTop: 18 }}>
          {stale.map((item) => <article className="workspace-queue-card" key={item.offerId}>
            <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>Τελευταία επιβεβαίωση: {when(item.stockConfirmedAt)} · ισχύς {duration(item.freshnessTtlSeconds)}</small></div><span className="status-pill">Χρειάζεται επιβεβαίωση</span></div>
            <div className="workspace-queue-primary"><span>{item.availableToSell} διαθέσιμα τεμάχια στο τελευταίο καταγεγραμμένο stock</span></div>
            {item.merchantPauseActive && <div className="workspace-inline-note"><strong>Το προϊόν είναι επίσης κρυφό από εσένα.</strong> Επανέφερέ το από τον διακόπτη ορατότητας και επιβεβαίωσε το stock πριν θεωρηθεί ξανά διαθέσιμο.</div>}
          </article>)}
        </div>
        <div className="workspace-action-bar" style={{ marginTop: 18 }}><span>Η επιβεβαίωση γίνεται μέσα στον κατάλογο, χωρίς νέο προϊόν ή αίτημα Admin.</span><a className="button button-secondary" href="#live-catalog">Πήγαινε στο απόθεμα</a></div>
      </>
      : <div className="workspace-inline-note" style={{ marginTop: 18 }}><strong>Όλο το καταγεγραμμένο stock είναι πρόσφατα επιβεβαιωμένο.</strong> Δεν υπάρχει αυτή τη στιγμή προϊόν που να μπλοκάρεται μόνο λόγω παλιάς επιβεβαίωσης αποθέματος.</div>}
  </section>;
}
