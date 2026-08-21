"use client";

import { useMemo, useState } from "react";
import { CustomerHowItWorks, CustomerLifecycle } from "./CustomerAccountPrimitives";

type SupportStatus = "open" | "waiting_customer" | "waiting_internal" | "resolved" | "closed";
type SupportCategory = "account" | "order" | "payment" | "return" | "delivery" | "privacy" | "technical" | "other";
type SupportContextType = "account" | "security" | "order" | "ask_local" | "return" | "privacy" | "saved" | "other";
type SupportMessage = Readonly<{ id: string; sender: "customer" | "support"; body: string; createdAt: number }>;
type SupportCase = Readonly<{
  id: string;
  referenceNumber: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  contextType?: SupportContextType;
  contextReference?: string;
  createdAt: number;
  updatedAt: number;
  messages: readonly SupportMessage[];
}>;

type InitialContext = Readonly<{ type?: SupportContextType; id?: string; label?: string; subject?: string }>;

type Props = Readonly<{
  csrfToken: string;
  initialCases: readonly SupportCase[];
  ready: boolean;
  readinessMessage: string;
  initialContext: InitialContext;
}>;

const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Παραλήφθηκε",
  waiting_internal: "Το εξετάζουμε",
  waiting_customer: "Χρειάζεται απάντησή σου",
  resolved: "Λύθηκε",
  closed: "Κλειστό"
};

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  account: "Λογαριασμός",
  order: "Παραγγελία",
  payment: "Πληρωμή",
  return: "Επιστροφή / εγγύηση",
  delivery: "Παράδοση / παραλαβή",
  privacy: "Ιδιωτικότητα",
  technical: "Τεχνικό θέμα",
  other: "Κάτι άλλο"
};

const CONTEXT_LABELS: Record<SupportContextType, string> = {
  account: "Λογαριασμός",
  security: "Ασφάλεια λογαριασμού",
  order: "Παραγγελία",
  ask_local: "Ask Local",
  return: "Επιστροφή",
  privacy: "Αίτημα ιδιωτικότητας",
  saved: "Αποθηκευμένα",
  other: "Άλλο"
};

function formatDate(value: number): string {
  return new Date(value).toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short" });
}

function lifecycle(status: SupportStatus) {
  const finished = status === "resolved" || status === "closed";
  return [
    { label: "Αίτημα", description: "Το αίτημα καταγράφηκε με αριθμό ticket.", state: "done" as const },
    { label: "Έλεγχος", description: status === "open" || status === "waiting_internal" ? "Η ομάδα υποστήριξης εξετάζει το θέμα." : "Ο αρχικός έλεγχος ολοκληρώθηκε.", state: status === "open" || status === "waiting_internal" ? "current" as const : "done" as const },
    { label: "Δική σου ενέργεια", description: status === "waiting_customer" ? "Απάντησε στο μήνυμα της υποστήριξης." : finished ? "Δεν απαιτείται άλλη ενέργεια." : "Θα εμφανιστεί εδώ αν χρειαστούμε κάτι από εσένα.", state: status === "waiting_customer" ? "action" as const : finished ? "done" as const : "pending" as const },
    { label: "Λύση", description: finished ? "Το αίτημα έχει ολοκληρωθεί." : "Θα ενημερωθείς όταν υπάρχει λύση ή επόμενο βήμα.", state: finished ? "done" as const : "pending" as const }
  ];
}

function defaultCategory(contextType?: SupportContextType): SupportCategory {
  if (contextType === "order") return "order";
  if (contextType === "return") return "return";
  if (contextType === "privacy") return "privacy";
  if (contextType === "account" || contextType === "security") return "account";
  return "other";
}

export function CustomerSupportClient({ csrfToken, initialCases, ready, readinessMessage, initialContext }: Props) {
  const [cases, setCases] = useState<readonly SupportCase[]>(initialCases);
  const [subject, setSubject] = useState(initialContext.subject ?? "");
  const [category, setCategory] = useState<SupportCategory>(defaultCategory(initialContext.type));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyCaseId, setReplyCaseId] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const activeCount = useMemo(() => cases.filter((item) => !["resolved", "closed"].includes(item.status)).length, [cases]);

  async function createCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setStatus(""); setBusy(true);
    try {
      const response = await fetch("/api/account/support", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ subject, category, message, contextType: initialContext.type, contextId: initialContext.id })
      });
      const body = await response.json() as { cases?: SupportCase[]; error?: string };
      if (!response.ok || !body.cases) throw new Error(body.error ?? "Το αίτημα δεν δημιουργήθηκε.");
      setCases(body.cases);
      setSubject(""); setMessage("");
      setStatus("Το αίτημα υποστήριξης καταγράφηκε και βρίσκεται πλέον στην ουρά της ομάδας μας.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Το αίτημα δεν δημιουργήθηκε.");
    } finally { setBusy(false); }
  }

  async function sendReply(caseId: string) {
    const text = reply.trim();
    if (!text) return;
    setError(""); setStatus(""); setReplyCaseId(caseId);
    try {
      const response = await fetch(`/api/account/support/${encodeURIComponent(caseId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ message: text })
      });
      const body = await response.json() as { cases?: SupportCase[]; error?: string };
      if (!response.ok || !body.cases) throw new Error(body.error ?? "Η απάντηση δεν αποθηκεύτηκε.");
      setCases(body.cases); setReply(""); setStatus("Η απάντησή σου στάλθηκε στην ομάδα υποστήριξης.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η απάντηση δεν αποθηκεύτηκε.");
    } finally { setReplyCaseId(""); }
  }

  return <section className="shell customer-account-page customer-support-page">
    <div className="customer-page-heading">
      <div><div className="eyebrow">Υποστήριξη</div><h1>Βοήθεια με πραγματικό πλαίσιο</h1></div>
      <p>Σύνδεσε το αίτημά σου με την παραγγελία, το Ask Local ή την επιστροφή που αφορά. Η ομάδα βλέπει το σωστό πλαίσιο χωρίς να χρειάζεται να αντιγράφεις τεχνικά IDs.</p>
    </div>

    {!ready && <div className="customer-action-card is-progress" role="status"><span className="customer-action-icon" aria-hidden="true">●</span><div className="customer-action-copy"><strong>Η υποστήριξη δεν είναι διαθέσιμη σε αυτό το preview</strong><p>{readinessMessage}</p></div></div>}

    <div className="customer-support-layout">
      <article className="customer-account-panel customer-support-new-case">
        <div className="eyebrow">Νέο αίτημα</div><h2>Τι χρειάζεσαι;</h2>
        {initialContext.type && <div className="customer-support-context"><strong>{initialContext.label ?? CONTEXT_LABELS[initialContext.type]}</strong>{initialContext.id && <span>{initialContext.id}</span>}<small>Η συσχέτιση ελέγχεται με τον λογαριασμό σου πριν αποθηκευτεί.</small></div>}
        <form className="customer-security-form" onSubmit={createCase}>
          <label><span>Κατηγορία</span><select value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)} disabled={!ready}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Θέμα</span><input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} maxLength={240} required disabled={!ready} placeholder="π.χ. Χρειάζομαι βοήθεια με την παραλαβή" /></label>
          <label><span>Μήνυμα</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={4000} required disabled={!ready} rows={6} placeholder="Πες μας τι συνέβη και τι χρειάζεσαι από εμάς." /></label>
          <button className="button" type="submit" disabled={!ready || busy}>{busy ? "Καταχώριση…" : "Δημιουργία αιτήματος"}</button>
        </form>
        <CustomerHowItWorks title="Τι βλέπει η υποστήριξη;"><p>Η ομάδα βλέπει το ticket και μόνο το marketplace πλαίσιο που επέλεξες. Οι εσωτερικές σημειώσεις της ομάδας παραμένουν εσωτερικές· στη συνομιλία σου εμφανίζονται μόνο απαντήσεις που έχουν δηλωθεί ρητά ως ορατές σε εσένα.</p></CustomerHowItWorks>
      </article>

      <div className="customer-support-cases">
        <div className="customer-support-summary"><strong>{activeCount} ενεργά αιτήματα</strong><span>{cases.length} συνολικά</span></div>
        {cases.length === 0 ? <div className="customer-empty-state"><strong>Δεν έχεις αιτήματα υποστήριξης.</strong><p>Αν χρειάζεσαι βοήθεια, δημιούργησε το πρώτο σου αίτημα από τη φόρμα.</p></div> : cases.map((item) => <article className="customer-account-panel customer-support-case" key={item.id}>
          <div className="customer-support-case-head"><div><span className="eyebrow">{item.referenceNumber}</span><h2>{item.subject}</h2><small>{CATEGORY_LABELS[item.category]} · ενημέρωση {formatDate(item.updatedAt)}</small></div><span className={`status-pill${item.status === "waiting_customer" ? " warning" : ""}`}>{STATUS_LABELS[item.status]}</span></div>
          {item.contextType && <div className="customer-support-context is-compact"><strong>{CONTEXT_LABELS[item.contextType]}</strong>{item.contextReference && <span>{item.contextReference}</span>}</div>}
          <CustomerLifecycle label={`Πορεία ${item.referenceNumber}`} stages={lifecycle(item.status)} />
          <div className="customer-support-thread" aria-label={`Συνομιλία ${item.referenceNumber}`}>
            {item.messages.map((entry) => <div className={`customer-support-message is-${entry.sender}`} key={entry.id}><div><strong>{entry.sender === "customer" ? "Εσύ" : "Ομάδα ΚΟΝΤΑ ΜΟΥ"}</strong><small>{formatDate(entry.createdAt)}</small></div><p>{entry.body}</p></div>)}
          </div>
          {item.status !== "closed" && <div className="customer-support-reply"><label><span>Απάντηση στο {item.referenceNumber}</span><textarea rows={4} value={replyCaseId === item.id ? reply : ""} onFocus={() => { if (replyCaseId !== item.id) { setReplyCaseId(item.id); setReply(""); } }} onChange={(event) => { setReplyCaseId(item.id); setReply(event.target.value); }} placeholder="Γράψε την απάντησή σου…" /></label><button className="button button-secondary" type="button" disabled={!reply.trim() || replyCaseId !== item.id} onClick={() => void sendReply(item.id)}>Αποστολή απάντησης</button></div>}
        </article>)}
      </div>
    </div>
    {error && <p className="account-action-error" role="alert">{error}</p>}
    {status && <p className="privacy-status" role="status">{status}</p>}
  </section>;
}
