"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CustomerAppointmentAdviser, CustomerAppointmentView } from "../lib/customer-appointments-runtime";

const ACTIVE = new Set(["pending", "confirmed", "rescheduled"]);
const statusLabels: Record<CustomerAppointmentView["status"], string> = {
  pending: "Αναμονή επιβεβαίωσης",
  confirmed: "Επιβεβαιωμένο",
  rescheduled: "Νέα ώρα επιβεβαιωμένη",
  completed: "Ολοκληρώθηκε",
  cancelled: "Ακυρώθηκε",
  no_show: "Μη εμφάνιση"
};
const channelLabels = { in_person: "Στο κατάστημα", phone: "Τηλεφωνικά" } as const;

function when(value: number): string {
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
}

function localInput(value: number): string {
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function CustomerAppointmentsClient({
  csrfToken,
  initial,
  advisers,
  preferredVendorId
}: {
  csrfToken: string;
  initial: readonly CustomerAppointmentView[];
  advisers: readonly CustomerAppointmentAdviser[];
  preferredVendorId?: string;
}) {
  const router = useRouter();
  const initialAdviser = advisers.find((item) => item.vendorId === preferredVendorId) ?? advisers[0];
  const [adviserId, setAdviserId] = useState(initialAdviser?.id ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [channel, setChannel] = useState<"in_person" | "phone">("in_person");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const selectedAdviser = useMemo(() => advisers.find((item) => item.id === adviserId), [advisers, adviserId]);
  const activeCount = initial.filter((item) => ACTIVE.has(item.status)).length;

  async function post(key: string, url: string, body: Record<string, unknown>) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν μπορέσαμε να ενημερώσουμε το ραντεβού.");
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν μπορέσαμε να ενημερώσουμε το ραντεβού.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAdviser || !startsAt) return;
    const success = await post("create", "/api/account/appointments", {
      vendorId: selectedAdviser.vendorId,
      adviserId: selectedAdviser.id,
      startsAt: new Date(startsAt).getTime(),
      durationMinutes: Number(durationMinutes),
      channel,
      notes
    });
    if (success) {
      setStartsAt("");
      setNotes("");
    }
  }

  function changeAdviser(nextId: string) {
    setAdviserId(nextId);
    const next = advisers.find((item) => item.id === nextId);
    if (channel === "phone" && !next?.phoneAvailable) setChannel("in_person");
  }

  return <>
    {error && <div className="shell form-error" role="alert"><strong>Το ραντεβού δεν ενημερώθηκε.</strong> {error}</div>}

    <section className="shell customer-account-page" style={{ paddingTop: 10 }}>
      <div className="customer-account-stats">
        <article><span>Ενεργά</span><strong>{activeCount}</strong></article>
        <article><span>Σύμβουλοι</span><strong>{advisers.length}</strong></article>
        <article><span>Συνολικά</span><strong>{initial.length}</strong></article>
      </div>
    </section>

    <section className="shell customer-account-page">
      <div className="customer-page-heading"><div><div className="eyebrow">Νέο ραντεβού</div><h2>Διάλεξε άνθρωπο και ώρα</h2></div><p>Η ώρα δεσμεύεται άμεσα στο ΚΟΝΤΑ ΜΟΥ. Δεν δημιουργούμε αυτόματα εξωτερικό Meet/Viber/WhatsApp link. Στα τηλεφωνικά ραντεβού καλείς εσύ το κατάστημα στην προγραμματισμένη ώρα από το δημόσιο τηλέφωνο της σελίδας του· δεν κοινοποιούμε ιδιωτικά στοιχεία λογαριασμού στον vendor για αυτόν τον σκοπό.</p></div>
      {advisers.length === 0 ? <div className="empty-state"><h2>Δεν υπάρχουν ακόμη ενεργοί σύμβουλοι για online ραντεβού.</h2><p>Μπορείς να στείλεις ιδιωτικό αίτημα μέσω Ask Local.</p><Link className="button" href="/account/ask-local">Ask Local</Link></div> : <form className="customer-preferences-form" onSubmit={submitBooking}>
        <label><span>Σύμβουλος</span><select value={adviserId} onChange={(event) => changeAdviser(event.target.value)} required>{advisers.map((adviser) => <option value={adviser.id} key={adviser.id}>{adviser.displayName} · {adviser.vendorName}</option>)}</select></label>
        {selectedAdviser && <p className="form-help">{selectedAdviser.jobTitle ? `${selectedAdviser.jobTitle} · ` : ""}{selectedAdviser.specialties.length ? selectedAdviser.specialties.join(" · ") : selectedAdviser.vendorName}</p>}
        <div className="customer-form-grid">
          <label><span>Ημερομηνία & ώρα</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
          <label><span>Διάρκεια</span><select value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)}><option value="30">30 λεπτά</option><option value="45">45 λεπτά</option><option value="60">60 λεπτά</option></select></label>
          <label><span>Τρόπος</span><select value={channel} onChange={(event) => setChannel(event.target.value as "in_person" | "phone")}><option value="in_person">Στο κατάστημα</option><option value="phone" disabled={!selectedAdviser?.phoneAvailable}>Τηλεφωνικά{selectedAdviser?.phoneAvailable ? "" : " · μη διαθέσιμο"}</option></select></label>
        </div>
        {selectedAdviser && !selectedAdviser.phoneAvailable && <p className="form-help">Το συγκεκριμένο κατάστημα δεν έχει δημοσιευμένο τηλέφωνο, επομένως το ραντεβού μπορεί να γίνει μόνο στο κατάστημα.</p>}
        {channel === "phone" && selectedAdviser?.phoneAvailable && <p className="form-help">Στην ώρα του ραντεβού άνοιξε τα <Link className="text-link" href={`/vendor/${encodeURIComponent(selectedAdviser.vendorId)}#store-info`}>δημόσια στοιχεία επικοινωνίας του {selectedAdviser.vendorName}</Link> και κάλεσε το κατάστημα.</p>}
        <label><span>Τι θέλεις να συζητήσεις; <small>(προαιρετικό)</small></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Π.χ. χρειάζομαι βοήθεια να επιλέξω σωστό μέγεθος / συμβατότητα…" /></label>
        <button className="button" disabled={Boolean(busy) || !startsAt || !selectedAdviser}>{busy === "create" ? "Δέσμευση…" : "Κλείσε το ραντεβού"}</button>
      </form>}
    </section>

    <section className="shell customer-account-page" style={{ paddingBottom: 56 }}>
      <div className="customer-page-heading"><div><div className="eyebrow">Τα ραντεβού μου</div><h2>Προγραμματισμένες επαφές</h2></div><p>Μπορείς να ακυρώσεις ή να αλλάξεις ώρα όσο το ραντεβού παραμένει ενεργό. Η νέα ώρα ελέγχεται ξανά για σύγκρουση.</p></div>
      {initial.length === 0 ? <div className="empty-state"><h2>Δεν έχεις κλείσει ακόμη ραντεβού.</h2><p>Όταν κλείσεις το πρώτο, η πορεία του θα εμφανιστεί εδώ.</p></div> : <div className="workspace-queue-list">{initial.map((appointment) => {
        const active = ACTIVE.has(appointment.status);
        const duration = Math.max(30, Math.round((appointment.endsAt - appointment.startsAt) / 60_000));
        return <article className="workspace-queue-card" key={appointment.id}>
          <div className="workspace-queue-head"><div><strong>{appointment.adviserName}</strong><small>{appointment.vendorName} · {channelLabels[appointment.channel]}</small></div><span className="vendor-merchant-status">{statusLabels[appointment.status]}</span></div>
          <p><strong>{when(appointment.startsAt)}</strong> · {duration} λεπτά{appointment.productTitle ? ` · ${appointment.productTitle}` : ""}</p>
          {appointment.channel === "phone" && <p className="workspace-queue-summary">Στην προγραμματισμένη ώρα, <Link className="text-link" href={`/vendor/${encodeURIComponent(appointment.vendorId)}#store-info`}>άνοιξε τα δημόσια στοιχεία του καταστήματος και κάλεσέ το</Link>.</p>}
          {appointment.notes && <p className="workspace-queue-summary">{appointment.notes}</p>}
          {active && <div className="workspace-action-bar"><button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => void post(`cancel:${appointment.id}`, "/api/account/appointments/action", { appointmentId: appointment.id, action: "cancel" })}>{busy === `cancel:${appointment.id}` ? "Ακύρωση…" : "Ακύρωση"}</button><details className="workspace-tool-panel"><summary>Αλλαγή ώρας</summary><form className="workspace-tool-body" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const value = String(form.get("startsAt") ?? "");
            void post(`reschedule:${appointment.id}`, "/api/account/appointments/action", { appointmentId: appointment.id, action: "reschedule", startsAt: new Date(value).getTime(), durationMinutes: Number(form.get("durationMinutes")) });
          }}><label><span>Νέα ώρα</span><input name="startsAt" type="datetime-local" defaultValue={localInput(appointment.startsAt)} required /></label><label><span>Διάρκεια</span><select name="durationMinutes" defaultValue={String([30,45,60].includes(duration) ? duration : 30)}><option value="30">30 λεπτά</option><option value="45">45 λεπτά</option><option value="60">60 λεπτά</option></select></label><button className="button" disabled={Boolean(busy)}>{busy === `reschedule:${appointment.id}` ? "Αποθήκευση…" : "Αποθήκευση νέας ώρας"}</button></form></details></div>}
        </article>;
      })}</div>}
    </section>
  </>;
}