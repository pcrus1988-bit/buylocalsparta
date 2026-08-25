"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Advice = {
  csrfToken: string;
  conversations: ReadonlyArray<{ id: string; state: string; canonicalVariantId?: string; messages: ReadonlyArray<{ id: string; senderType: string; body: string; createdAt?: number }> }>;
  counteroffers: ReadonlyArray<{ id: string; status: string; canonicalVariantId?: string; need?: unknown }>;
  offerProducts: ReadonlyArray<{ canonicalVariantId: string; vendorOfferId: string; title: string; availableToSell: number }>;
  offerStates: ReadonlyArray<{ requestId: string; status: string; expiresAt: number; productTitle?: string }>;
};

const when = (value?: number) => value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";

function needSummary(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["description", "query", "need", "title", "message"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return "Αίτημα πελάτη";
}

function eurosToMinor(value: FormDataEntryValue | null): number {
  const amount = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

export function VendorDailyAskLocalV2({ initial }: { initial: Advice }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const openRequests = initial.counteroffers.filter((item) => !["closed", "expired", "accepted", "rejected", "declined"].includes(item.status));

  async function post(path: string, body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια δεν ολοκληρώθηκε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια δεν ολοκληρώθηκε");
    } finally {
      setBusy("");
    }
  }

  async function askClarification(requestId: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const question = String(data.get("question") ?? "").trim();
    await post("/api/daily/advice/clarifications", { requestId, question }, `clarification:${requestId}`);
  }

  async function sendOffer(requestId: string, hasCanonical: boolean, form: HTMLFormElement) {
    const data = new FormData(form);
    const priceMinor = eurosToMinor(data.get("price"));
    const fulfilmentPromise = String(data.get("fulfilmentPromise") ?? "").trim();
    const validityHours = Number(data.get("validityHours"));
    const canonicalVariantId = hasCanonical ? undefined : String(data.get("canonicalVariantId") ?? "").trim();
    await post("/api/daily/advice/offers", {
      requestId,
      priceMinor,
      fulfilmentPromise,
      canonicalVariantId,
      expiresAt: Date.now() + validityHours * 60 * 60 * 1000
    }, `offer:${requestId}`);
  }

  async function reply(conversationId: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const body = String(data.get("body") ?? "").trim();
    await post("/api/daily/advice/messages", { conversationId, body }, `reply:${conversationId}`);
  }

  return <main style={{ minHeight: "100dvh", background: "#f6f4ee", paddingBottom: 34 }}>
    <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 18px", background: "rgba(246,244,238,.94)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(23,25,20,.09)" }}>
      <div><span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".15em" }}>KONTA MOY</span><strong style={{ fontSize: 20 }}>Daily · Ask Local</strong></div>
      <Link href="/daily" style={{ color: "inherit", textDecoration: "none", border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: "9px 12px", fontWeight: 800 }}>Πίσω</Link>
    </header>

    <div style={{ width: "min(100% - 32px, 820px)", margin: "0 auto", paddingTop: 24, display: "grid", gap: 24 }}>
      <section>
        <div style={{ marginBottom: 12 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".13em", textTransform: "uppercase", opacity: .55 }}>Assigned requests</span><h1 style={{ margin: "4px 0", fontSize: 30, letterSpacing: "-.04em" }}>Ask Local</h1><p style={{ margin: 0, opacity: .62 }}>Σύνδεσε κάθε γενική προσφορά με το πραγματικό προϊόν του καταστήματος. Έτσι, όταν ο πελάτης πατήσει αποδοχή, συνεχίζει αμέσως σε ασφαλές checkout με τη συμφωνημένη τιμή.</p></div>
        {error && <p role="alert" style={{ padding: 12, borderRadius: 12, background: "#fff0ee", color: "#8d2119", fontWeight: 700 }}>{error}</p>}
        {openRequests.length ? <div style={{ display: "grid", gap: 10 }}>{openRequests.map((request) => {
          const state = initial.offerStates.find((item) => item.requestId === request.id);
          const hasCanonical = Boolean(request.canonicalVariantId);
          return <article key={request.id} style={{ background: "white", border: "1px solid rgba(23,25,20,.09)", borderRadius: 18, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}><strong>{hasCanonical ? "Αίτημα για συγκεκριμένο προϊόν" : "Γενικό αίτημα"}</strong><span style={{ fontSize: 12, fontWeight: 800, background: "#f0eee6", borderRadius: 999, padding: "5px 9px" }}>{request.status}</span></div>
            <p style={{ margin: "10px 0 0", opacity: .72 }}>{needSummary(request.need)}</p>
            {request.status === "needs_info" && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#fff7e9", fontWeight: 700 }}>Περιμένουμε απάντηση από τον πελάτη.</div>}
            {request.status === "awaiting_vendor" && <details style={{ marginTop: 14, borderTop: "1px solid rgba(23,25,20,.09)", paddingTop: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>Ζήτησε διευκρίνιση</summary>
              <form style={{ display: "grid", gap: 10, marginTop: 12 }} onSubmit={(event) => { event.preventDefault(); void askClarification(request.id, event.currentTarget); }}>
                <textarea name="question" minLength={3} maxLength={2000} required rows={3} placeholder="π.χ. Ποια διάσταση χρειάζεστε;" style={{ border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: 12, font: "inherit" }} />
                <button type="submit" disabled={Boolean(busy)} style={{ minHeight: 46, border: "1px solid rgba(23,25,20,.16)", borderRadius: 13, background: "white", padding: "0 16px", font: "inherit", fontWeight: 800 }}>{busy === `clarification:${request.id}` ? "Αποστολή…" : "Αποστολή ερώτησης"}</button>
              </form>
            </details>}
            {request.status === "awaiting_vendor" && <details open={!hasCanonical} style={{ marginTop: 14, borderTop: "1px solid rgba(23,25,20,.09)", paddingTop: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>Στείλε ιδιωτική προσφορά</summary>
              <form style={{ display: "grid", gap: 10, marginTop: 12 }} onSubmit={(event) => { event.preventDefault(); void sendOffer(request.id, hasCanonical, event.currentTarget); }}>
                {!hasCanonical ? <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Προϊόν που προσφέρεις</span><select name="canonicalVariantId" required defaultValue="" style={{ minHeight: 46, border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: "0 12px", font: "inherit" }}><option value="" disabled>Επίλεξε προϊόν με επιβεβαιωμένο απόθεμα</option>{initial.offerProducts.map((product) => <option key={product.vendorOfferId} value={product.canonicalVariantId}>{product.title} · διαθέσιμα {product.availableToSell}</option>)}</select><small style={{ opacity: .62 }}>Η σύνδεση αυτή είναι υποχρεωτική για να μπορεί η αποδοχή να γίνει online αγορά.</small></label> : null}
                <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Τιμή ανά τεμάχιο (€)</span><input name="price" inputMode="decimal" required placeholder="24,90" style={{ minHeight: 46, border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: "0 12px", font: "inherit" }} /></label>
                <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Τι περιλαμβάνει / πώς θα εκπληρωθεί</span><textarea name="fulfilmentPromise" minLength={3} maxLength={500} required rows={3} placeholder="π.χ. Διαθέσιμο σήμερα για παραλαβή από το κατάστημα." style={{ border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: 12, font: "inherit" }} /></label>
                <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Ισχύς προσφοράς</span><select name="validityHours" defaultValue="24" style={{ minHeight: 46, border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: "0 12px", font: "inherit" }}><option value="1">1 ώρα</option><option value="6">6 ώρες</option><option value="24">24 ώρες</option><option value="48">48 ώρες</option><option value="168">7 ημέρες</option></select></label>
                <button type="submit" disabled={Boolean(busy) || (!hasCanonical && initial.offerProducts.length === 0)} style={{ minHeight: 46, border: 0, borderRadius: 13, background: "#171914", color: "white", padding: "0 16px", font: "inherit", fontWeight: 800 }}>{busy === `offer:${request.id}` ? "Αποστολή…" : "Αποστολή προσφοράς"}</button>
              </form>
            </details>}
            {request.status === "offered" && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#f4f7f1" }}><strong>Η προσφορά στάλθηκε.</strong><div style={{ marginTop: 5, opacity: .72 }}>{state?.productTitle ? `Προϊόν: ${state.productTitle}. ` : ""}{state?.expiresAt ? `Λήγει ${when(state.expiresAt)}.` : "Περιμένουμε την απόφαση του πελάτη."}</div><button type="button" disabled={Boolean(busy)} onClick={() => void post("/api/daily/advice/offers/reopen", { requestId: request.id }, `reopen:${request.id}`)} style={{ marginTop: 9, border: 0, background: "transparent", padding: 0, textDecoration: "underline", font: "inherit", fontWeight: 700, cursor: "pointer" }}>{busy === `reopen:${request.id}` ? "Ανάκληση…" : "Ανάκληση και νέα προσφορά"}</button></div>}
          </article>;
        })}</div> : <div style={{ padding: 18, borderRadius: 18, background: "white", border: "1px solid rgba(23,25,20,.09)", opacity: .65 }}>Δεν υπάρχουν ανοιχτά Ask Local αιτήματα.</div>}
      </section>

      <section>
        <div style={{ marginBottom: 12 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".13em", textTransform: "uppercase", opacity: .55 }}>Messages</span><h2 style={{ margin: "4px 0", fontSize: 24 }}>Συνομιλίες</h2></div>
        {initial.conversations.length ? <div style={{ display: "grid", gap: 12 }}>{initial.conversations.map((conversation) => <article key={conversation.id} style={{ background: "white", border: "1px solid rgba(23,25,20,.09)", borderRadius: 18, padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><strong>Συνομιλία</strong><span style={{ fontSize: 12, fontWeight: 800 }}>{conversation.state}</span></div><div style={{ display: "grid", gap: 8, marginTop: 12 }}>{conversation.messages.map((message) => <div key={message.id} style={{ padding: 10, borderRadius: 12, background: message.senderType === "vendor" ? "#edf4ee" : "#f4f2ec" }}><strong style={{ fontSize: 12 }}>{message.senderType === "vendor" ? "Κατάστημα" : "Πελάτης"}</strong><div>{message.body}</div>{message.createdAt ? <small style={{ opacity: .55 }}>{when(message.createdAt)}</small> : null}</div>)}</div><form style={{ display: "flex", gap: 8, marginTop: 12 }} onSubmit={(event) => { event.preventDefault(); void reply(conversation.id, event.currentTarget); }}><input name="body" required minLength={1} maxLength={2000} placeholder="Γράψε απάντηση…" style={{ flex: 1, minWidth: 0, minHeight: 44, border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: "0 12px", font: "inherit" }} /><button type="submit" disabled={Boolean(busy)} style={{ border: 0, borderRadius: 12, background: "#171914", color: "white", padding: "0 14px", fontWeight: 800 }}>Αποστολή</button></form></article>)}</div> : <div style={{ padding: 18, borderRadius: 18, background: "white", border: "1px solid rgba(23,25,20,.09)", opacity: .65 }}>Δεν υπάρχουν ενεργές συνομιλίες.</div>}
      </section>
    </div>
  </main>;
}
