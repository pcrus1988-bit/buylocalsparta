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
    <WorkspaceSectionHeading eyebrow="Διαθεσιμότητα" title="Πρόσφατη επιβεβαίωση αποθέματος" note="Όταν το απόθεμα δεν έχει επιβεβαιωθεί πρόσφατα, το προϊόν δεν εμφανίζεται ως διαθέσιμο. Έτσι αποφεύγονται παραγγελίες για ποσότητες που μπορεί να μην υπάρχουν πλέον." />
    <WorkspaceMetricStrip items={[
      { label: "Πρόσφατα", value: snapshot.freshCount, tone: snapshot.freshCount ? "positive" : "default" },
      { label: "Χρειάζονται επιβεβαίωση", value: snapshot.staleCount, tone: snapshot.staleCount ? "attention" : "positive" },
      { label: "Προϊόντα προσωρινά μη διαθέσιμα", value: snapshot.staleSellableCount, tone: snapshot.staleSellableCount ? "attention" : "positive", hint: "Έχουν ποσότητα, αλλά χρειάζεται νέα επιβεβαίωση" }
    ]} />

    {stale.length > 0
      ? <>
        <div className="workspace-inline-note" style={{ marginTop: 18 }}><strong>Τι χρειάζεται:</strong> έλεγξε την πραγματική ποσότητα και πάτησε «Αποθήκευση αποθέματος» στο προϊόν. Ακόμη κι αν η ποσότητα δεν άλλαξε, η αποθήκευση ανανεώνει την επιβεβαίωση.</div>
        <div className="workspace-queue-list" style={{ marginTop: 18 }}>
          {stale.map((item) => <article className="workspace-queue-card" key={item.offerId}>
            <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>Τελευταία επιβεβαίωση: {when(item.stockConfirmedAt)} · ισχύς {duration(item.freshnessTtlSeconds)}</small></div><span className="status-pill">Χρειάζεται επιβεβαίωση</span></div>
            <div className="workspace-queue-primary"><span>{item.availableToSell} διαθέσιμα τεμάχια στο τελευταίο καταγεγραμμένο απόθεμα</span></div>
            {item.merchantPauseActive && <div className="workspace-inline-note"><strong>Το προϊόν είναι επίσης κρυφό από εσένα.</strong> Επανέφερέ το από τον διακόπτη εμφάνισης και επιβεβαίωσε το απόθεμα πριν θεωρηθεί ξανά διαθέσιμο.</div>}
            {!item.merchantPauseActive && item.offerStatus !== "approved" && <div className="workspace-inline-note"><strong>Το προϊόν χρειάζεται επίσης επανέγκριση.</strong> Μπορείς να επιβεβαιώσεις το απόθεμα τώρα, αλλά η δημόσια πώληση θα επιστρέψει μόνο αφού εγκριθεί η επανενεργοποίηση.</div>}
          </article>)}
        </div>
        <div className="workspace-action-bar" style={{ marginTop: 18 }}><span>Η επιβεβαίωση γίνεται μέσα στον κατάλογο. Αίτημα προς το ΚΟΝΤΑ ΜΟΥ χρειάζεται μόνο όταν το προϊόν εμφανίζεται στην ξεχωριστή ενότητα επανέγκρισης.</span><a className="button button-secondary" href="#live-catalog">Πήγαινε στο απόθεμα</a></div>
      </>
      : <div className="workspace-inline-note" style={{ marginTop: 18 }}><strong>Όλο το καταγεγραμμένο απόθεμα είναι πρόσφατα επιβεβαιωμένο.</strong> Δεν υπάρχει αυτή τη στιγμή προϊόν που να μπλοκάρεται μόνο λόγω παλιάς επιβεβαίωσης αποθέματος.</div>}
  </section>;
}
