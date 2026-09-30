"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./VendorDailyAskLocalV2.module.css";

type RequestMessage = Readonly<{
  id: string;
  senderType: string;
  body: string;
  imageDataUrl?: string;
  createdAt: number;
}>;

type RichRequest = Readonly<{
  id: string;
  referenceNumber: string;
  status: string;
  need: string;
  quantity: number;
  postcode?: string;
  messages: ReadonlyArray<RequestMessage>;
  voiceTranscript?: string;
  barcode?: string;
  referenceImageDataUrl?: string;
  captureSource?: string;
  createdAt: number;
}>;

type Advice = {
  csrfToken: string;
  conversations: ReadonlyArray<{ id: string; state: string; canonicalVariantId?: string; messages: ReadonlyArray<{ id: string; senderType: string; body: string; createdAt?: number }> }>;
  counteroffers: ReadonlyArray<{ id: string; status: string; canonicalVariantId?: string; need?: unknown }>;
  offerProducts: ReadonlyArray<{ canonicalVariantId: string; vendorOfferId: string; title: string; availableToSell: number }>;
  offerStates: ReadonlyArray<{ requestId: string; status: string; expiresAt: number; productTitle?: string }>;
  richRequests: ReadonlyArray<RichRequest>;
};

type Panel = "message" | "offer";
type Attachment = Readonly<{ dataUrl: string; name: string }>;

const TERMINAL_REQUESTS = new Set(["closed", "expired", "accepted", "rejected", "declined", "converted", "cancelled"]);
const OFFERABLE = new Set(["awaiting_vendor"]);

const when = (value?: number) => value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)) : "";

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

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    assigned: "Νέο",
    awaiting_vendor: "Χρειάζεται απάντηση",
    needs_info: "Περιμένει πελάτη",
    offered: "Προσφορά στάλθηκε",
    accepted: "Αποδεκτή",
    declined: "Απορρίφθηκε",
    rejected: "Απορρίφθηκε",
    expired: "Έληξε",
    converted: "Ολοκληρώθηκε",
    closed: "Κλειστό"
  };
  return labels[status] ?? status;
}

function statusClass(status: string): string {
  if (status === "offered") return `${styles.status} ${styles.statusOffer}`;
  if (["assigned", "awaiting_vendor", "needs_info"].includes(status)) return `${styles.status} ${styles.statusAttention}`;
  return styles.status;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Η φωτογραφία δεν διαβάστηκε."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

async function compressedAskLocalImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Χρησιμοποίησε JPG, PNG ή WebP.");
  const source = await readFile(file);
  const image = new window.Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Η φωτογραφία δεν μπορεί να ανοιχτεί."));
    image.src = source;
  });

  const largest = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, 1280 / Math.max(1, largest));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Η επεξεργασία της φωτογραφίας απέτυχε.");
  context.drawImage(image, 0, 0, width, height);

  for (const quality of [0.82, 0.68, 0.54, 0.42]) {
    const output = canvas.toDataURL("image/jpeg", quality);
    if (output.length <= 245_000) return output;
  }
  throw new Error("Η φωτογραφία παραμένει πολύ μεγάλη. Δοκίμασε μικρότερη εικόνα.");
}

export function VendorDailyAskLocalV2({ initial }: { initial: Advice }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [panelByRequest, setPanelByRequest] = useState<Record<string, Panel | undefined>>({});
  const [attachments, setAttachments] = useState<Record<string, Attachment | undefined>>({});
  const [attachmentBusy, setAttachmentBusy] = useState("");

  const openRequests = initial.counteroffers.filter((item) => !TERMINAL_REQUESTS.has(item.status));
  const contextById = useMemo(() => new Map(initial.richRequests.map((item) => [item.id, item])), [initial.richRequests]);

  async function post(path: string, body: Record<string, unknown>, busyKey: string): Promise<boolean> {
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
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια δεν ολοκληρώθηκε");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function sendOffer(requestId: string, hasCanonical: boolean, form: HTMLFormElement) {
    const data = new FormData(form);
    const priceMinor = eurosToMinor(data.get("price"));
    const fulfilmentPromise = String(data.get("fulfilmentPromise") ?? "").trim();
    const validityHours = Number(data.get("validityHours"));
    const canonicalVariantId = hasCanonical ? undefined : String(data.get("canonicalVariantId") ?? "").trim();
    const ok = await post("/api/daily/advice/offers", {
      requestId,
      priceMinor,
      fulfilmentPromise,
      canonicalVariantId,
      expiresAt: Date.now() + validityHours * 60 * 60 * 1000
    }, `offer:${requestId}`);
    if (ok) {
      form.reset();
      setPanelByRequest((current) => ({ ...current, [requestId]: undefined }));
    }
  }

  async function sendRequestMessage(requestId: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const body = String(data.get("body") ?? "").trim();
    const attachment = attachments[requestId];
    const ok = await post("/api/daily/advice/requests/messages", {
      requestId,
      body,
      imageDataUrl: attachment?.dataUrl
    }, `message:${requestId}`);
    if (ok) {
      form.reset();
      setAttachments((current) => ({ ...current, [requestId]: undefined }));
    }
  }

  async function pickAttachment(requestId: string, file?: File) {
    if (!file) return;
    setAttachmentBusy(requestId);
    setError("");
    try {
      const dataUrl = await compressedAskLocalImage(file);
      setAttachments((current) => ({ ...current, [requestId]: { dataUrl, name: file.name } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η φωτογραφία δεν προστέθηκε.");
    } finally {
      setAttachmentBusy("");
    }
  }

  async function reply(conversationId: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const body = String(data.get("body") ?? "").trim();
    const ok = await post("/api/daily/advice/messages", { conversationId, body }, `reply:${conversationId}`);
    if (ok) form.reset();
  }

  function togglePanel(requestId: string, panel: Panel) {
    setPanelByRequest((current) => ({ ...current, [requestId]: current[requestId] === panel ? undefined : panel }));
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div className={styles.brand}><span>KONTA MOY</span><strong>Daily · Ask Local</strong></div>
      <Link href="/daily" className={styles.back}>Πίσω</Link>
    </header>

    <div className={styles.shell}>
      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>Ιδιωτικά αιτήματα πελατών</span><h1>Ask Local</h1><p>Κάθε αίτημα είναι πλέον χώρος εργασίας: απάντηση, φωτογραφία, ιστορικό και ιδιωτική προσφορά στο ίδιο σημείο.</p></div>
        <span className={styles.count}>{openRequests.length}</span>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}

      {openRequests.length ? <div className={styles.requestList}>{openRequests.map((request) => {
        const context = contextById.get(request.id);
        const messages = context?.messages ?? [];
        const state = initial.offerStates.find((item) => item.requestId === request.id);
        const hasCanonical = Boolean(request.canonicalVariantId);
        const panel = panelByRequest[request.id];
        const attachment = attachments[request.id];
        const canOffer = OFFERABLE.has(request.status);

        return <article className={styles.requestCard} key={request.id}>
          <div className={styles.requestHead}>
            <div className={styles.requestTitle}>
              <span className={styles.requestRef}>{context?.referenceNumber ?? request.id}</span>
              <strong>{hasCanonical ? "Αίτημα για συγκεκριμένο προϊόν" : "Γενικό αίτημα"}</strong>
            </div>
            <span className={statusClass(request.status)}>{statusLabel(request.status)}</span>
          </div>

          <p className={styles.need}>{context?.need ?? needSummary(request.need)}</p>

          <div className={styles.meta}>
            {context?.quantity ? <span>Ποσότητα · {context.quantity}</span> : null}
            {context?.postcode ? <span>ΤΚ · {context.postcode}</span> : null}
            {context?.captureSource ? <span>Πηγή · {context.captureSource}</span> : null}
          </div>

          {(context?.referenceImageDataUrl || context?.voiceTranscript || context?.barcode) ? <div className={styles.evidence}>
            {context.referenceImageDataUrl ? <Image className={styles.evidenceImage} src={context.referenceImageDataUrl} alt="Ιδιωτική φωτογραφία του αιτήματος Ask Local" width={360} height={270} unoptimized /> : null}
            <div className={styles.evidenceText}>
              {context.voiceTranscript ? <div><strong>Φωνητική περιγραφή</strong><div>{context.voiceTranscript}</div></div> : null}
              {context.barcode ? <div><strong>Barcode / κωδικός</strong><div>{context.barcode}</div></div> : null}
            </div>
          </div> : null}

          <div className={styles.thread}>
            <div className={styles.threadHead}><strong>Ιδιωτική συζήτηση</strong><small>{messages.length ? `${messages.length} μηνύματα` : "Δεν έχει ξεκινήσει ακόμα"}</small></div>
            {messages.length ? <div className={styles.messages}>{messages.map((message) => <div key={message.id} className={`${styles.message} ${message.senderType === "vendor" ? styles.messageVendor : styles.messageCustomer}`}>
              <strong>{message.senderType === "vendor" ? "Κατάστημα" : message.senderType === "customer" ? "Πελάτης" : "KONTA MOY"}</strong>
              <span>{message.body}</span>
              {message.imageDataUrl ? <Image className={styles.messageImage} src={message.imageDataUrl} alt="Φωτογραφία στη συζήτηση Ask Local" width={420} height={315} unoptimized /> : null}
              <small>{when(message.createdAt)}</small>
            </div>)}</div> : <div className={styles.emptyThread}>Απάντησε απευθείας εδώ — δεν χρειάζεται ξεχωριστή «Συνομιλία» για να δημιουργηθεί thread.</div>}
          </div>

          {request.status === "needs_info" ? <div className={styles.waiting}>Περιμένουμε απάντηση από τον πελάτη. Μπορείς να στείλεις συμπληρωματικό μήνυμα ή φωτογραφία· η προσφορά ενεργοποιείται ξανά μόλις επιστρέψει η διευκρίνιση.</div> : null}

          <div className={styles.actions}>
            <button type="button" className={`${styles.actionButton} ${panel === "message" ? styles.actionButtonPrimary : ""}`} onClick={() => togglePanel(request.id, "message")}>Μήνυμα / φωτογραφία</button>
            {canOffer ? <button type="button" className={`${styles.actionButton} ${panel === "offer" ? styles.actionButtonPrimary : ""}`} onClick={() => togglePanel(request.id, "offer")}>Στείλε προσφορά</button> : null}
          </div>

          {panel === "message" ? <div className={styles.panel}>
            <div className={styles.panelTitle}><strong>Απάντηση στον πελάτη</strong><button type="button" onClick={() => togglePanel(request.id, "message")}>Κλείσιμο</button></div>
            <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void sendRequestMessage(request.id, event.currentTarget); }}>
              <label className={styles.field}><span>Μήνυμα</span><textarea className={styles.textarea} name="body" maxLength={2000} rows={3} placeholder="Γράψε απάντηση, πρόταση ή διευκρίνιση…" /></label>
              <div className={styles.attach}>
                <label>{attachmentBusy === request.id ? "Επεξεργασία…" : "＋ Προσθήκη φωτογραφίας"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={attachmentBusy === request.id} onChange={(event) => void pickAttachment(request.id, event.target.files?.[0])} /></label>
              </div>
              {attachment ? <div className={styles.preview}><Image className={styles.previewImage} src={attachment.dataUrl} alt="Προεπισκόπηση φωτογραφίας" width={96} height={96} unoptimized /><div><strong>{attachment.name}</strong><br /><button type="button" onClick={() => setAttachments((current) => ({ ...current, [request.id]: undefined }))}>Αφαίρεση</button></div></div> : null}
              <small>Η φωτογραφία συμπιέζεται πριν σταλεί και παραμένει μέσα στο ιδιωτικό Ask Local αίτημα.</small>
              <div className={styles.formFooter}><button className={styles.submit} type="submit" disabled={Boolean(busy) || attachmentBusy === request.id}>{busy === `message:${request.id}` ? "Αποστολή…" : "Αποστολή στον πελάτη"}</button></div>
            </form>
          </div> : null}

          {panel === "offer" && canOffer ? <div className={styles.panel}>
            <div className={styles.panelTitle}><strong>Ιδιωτική προσφορά</strong><button type="button" onClick={() => togglePanel(request.id, "offer")}>Κλείσιμο</button></div>
            <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void sendOffer(request.id, hasCanonical, event.currentTarget); }}>
              {!hasCanonical ? <label className={styles.field}><span>Προϊόν που προσφέρεις</span><select className={styles.select} name="canonicalVariantId" required defaultValue=""><option value="" disabled>Επίλεξε προϊόν με επιβεβαιωμένο απόθεμα</option>{initial.offerProducts.map((product) => <option key={product.vendorOfferId} value={product.canonicalVariantId}>{product.title} · διαθέσιμα {product.availableToSell}</option>)}</select><small>Η σύνδεση με πραγματικό προϊόν είναι υποχρεωτική για ασφαλές checkout μετά την αποδοχή.</small></label> : null}
              <label className={styles.field}><span>Τιμή ανά τεμάχιο (€)</span><input className={styles.input} name="price" inputMode="decimal" required placeholder="24,90" /></label>
              <label className={styles.field}><span>Τι περιλαμβάνει / πώς θα εκπληρωθεί</span><textarea className={styles.textarea} name="fulfilmentPromise" minLength={3} maxLength={500} required rows={3} placeholder="π.χ. Διαθέσιμο σήμερα για παραλαβή από το κατάστημα." /></label>
              <label className={styles.field}><span>Ισχύς προσφοράς</span><select className={styles.select} name="validityHours" defaultValue="24"><option value="1">1 ώρα</option><option value="6">6 ώρες</option><option value="24">24 ώρες</option><option value="48">48 ώρες</option><option value="168">7 ημέρες</option></select></label>
              <div className={styles.formFooter}><button className={styles.submit} type="submit" disabled={Boolean(busy) || (!hasCanonical && initial.offerProducts.length === 0)}>{busy === `offer:${request.id}` ? "Αποστολή…" : "Αποστολή προσφοράς"}</button></div>
            </form>
          </div> : null}

          {request.status === "offered" ? <div className={styles.offerSummary}>
            <strong>Η προσφορά στάλθηκε στον πελάτη.</strong>
            <p>{state?.productTitle ? `Προϊόν: ${state.productTitle}. ` : ""}{state?.expiresAt ? `Λήγει ${when(state.expiresAt)}.` : "Περιμένουμε την απόφαση του πελάτη."}</p>
            <button type="button" disabled={Boolean(busy)} onClick={() => void post("/api/daily/advice/offers/reopen", { requestId: request.id }, `reopen:${request.id}`)}>{busy === `reopen:${request.id}` ? "Ανάκληση…" : "Ανάκληση και νέα προσφορά"}</button>
          </div> : null}
        </article>;
      })}</div> : <div className={styles.empty}>Δεν υπάρχουν ανοιχτά Ask Local αιτήματα.</div>}

      {initial.conversations.length ? <section className={styles.legacyConversations}>
        <span className={styles.eyebrow}>Άλλες συνομιλίες συμβουλών</span><h2>Μηνύματα εκτός Ask Local</h2>
        <div className={styles.legacyList}>{initial.conversations.map((conversation) => <article className={styles.legacyCard} key={conversation.id}>
          <strong>{conversation.canonicalVariantId ? "Συμβουλή για προϊόν" : "Γενική συμβουλή"} · {conversation.state}</strong>
          {conversation.messages.length ? <div className={styles.messages} style={{ marginTop: 10 }}>{conversation.messages.map((message) => <div key={message.id} className={`${styles.message} ${message.senderType === "vendor" ? styles.messageVendor : styles.messageCustomer}`}><strong>{message.senderType === "vendor" ? "Κατάστημα" : "Πελάτης"}</strong><span>{message.body}</span>{message.createdAt ? <small>{when(message.createdAt)}</small> : null}</div>)}</div> : null}
          <form className={styles.form} style={{ marginTop: 10 }} onSubmit={(event) => { event.preventDefault(); void reply(conversation.id, event.currentTarget); }}><label className={styles.field}><span>Απάντηση</span><input className={styles.input} name="body" required maxLength={2000} placeholder="Γράψε απάντηση…" /></label><div className={styles.formFooter}><button className={styles.submit} disabled={Boolean(busy)} type="submit">{busy === `reply:${conversation.id}` ? "Αποστολή…" : "Αποστολή"}</button></div></form>
        </article>)}</div>
      </section> : null}
    </div>
  </main>;
}
