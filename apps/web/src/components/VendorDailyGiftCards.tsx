"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import QRCode from "react-qr-code";
import { useEffect, useRef, useState } from "react";
import type {
  VendorGiftCardAccess,
  VendorPhysicalGiftCardIssueResult,
  VendorPhysicalGiftCardLookup,
  VendorPhysicalGiftCardRedemptionResult
} from "../lib/vendor-gift-card-service";
import { VendorDailyBottomNav } from "./VendorDailyBottomNav";

type EmailStatus = Readonly<{ sent: boolean; error?: string }>;
type Mode = "issue" | "redeem";

const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

function extractGiftCode(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    return url.searchParams.get("code")?.trim() || value;
  } catch {
    return value;
  }
}

function boxStyle(): React.CSSProperties {
  return { borderRadius: 22, background: "white", boxShadow: "0 18px 55px rgba(26,31,23,.08)", padding: 20 };
}

export function VendorDailyGiftCards({ csrfToken }: { csrfToken: string }) {
  const [mode, setMode] = useState<Mode>("issue");
  const [access, setAccess] = useState<VendorGiftCardAccess>();
  const [accessError, setAccessError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [issued, setIssued] = useState<VendorPhysicalGiftCardIssueResult>();
  const [issueEmail, setIssueEmail] = useState<EmailStatus>();
  const [code, setCode] = useState("");
  const [card, setCard] = useState<VendorPhysicalGiftCardLookup>();
  const [redeemed, setRedeemed] = useState<VendorPhysicalGiftCardRedemptionResult>();
  const [redemptionEmails, setRedemptionEmails] = useState<{ vendor: EmailStatus; platform: EmailStatus }>();
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<IScannerControls | null>(null);
  const redemptionKeyRef = useRef(crypto.randomUUID());

  function stopScanner() {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setScannerOpen(false);
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/daily/gift-cards", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { access?: VendorGiftCardAccess; error?: string };
        if (!response.ok || !payload.access) throw new Error(payload.error ?? "Δεν είναι διαθέσιμη η λειτουργία Gift Cards.");
        if (alive) setAccess(payload.access);
      })
      .catch((error) => { if (alive) setAccessError(error instanceof Error ? error.message : "Δεν είναι διαθέσιμη η λειτουργία Gift Cards."); });
    return () => { alive = false; scannerRef.current?.stop(); };
  }, []);

  async function issue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = Number(String(form.get("valueEuro") ?? "").replace(",", "."));
    const customerName = String(form.get("customerName") ?? "").trim();
    const customerEmail = String(form.get("customerEmail") ?? "").trim();
    if (!Number.isFinite(amount) || amount < 5 || amount > 2000) { setMessage("Η αξία πρέπει να είναι από 5 € έως 2.000 €."); return; }
    const confirmed = window.confirm(`Επιβεβαιώνεις ότι το κατάστημα έχει ήδη εισπράξει ${euro(Math.round(amount * 100))} για την έκδοση της Gift Card;`);
    if (!confirmed) return;

    setBusy(true); setMessage(""); setIssued(undefined); setIssueEmail(undefined);
    try {
      const response = await fetch("/api/daily/gift-cards", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "issue", valueMinor: Math.round(amount * 100), customerName, customerEmail, paymentConfirmed: true })
      });
      const payload = await response.json() as { result?: VendorPhysicalGiftCardIssueResult; email?: EmailStatus; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Η έκδοση της Gift Card απέτυχε.");
      setIssued(payload.result); setIssueEmail(payload.email); formElement.reset();
      setMessage(payload.email?.sent ? "Η Gift Card εκδόθηκε και στάλθηκε στον πελάτη." : "Η Gift Card εκδόθηκε. Ο κωδικός εμφανίζεται παρακάτω, αλλά το email δεν στάλθηκε.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η έκδοση της Gift Card απέτυχε.");
    } finally { setBusy(false); }
  }

  async function lookup(raw = code) {
    const value = extractGiftCode(raw);
    if (!value) { setMessage("Γράψε ή σκάναρε τον κωδικό Gift Card."); return; }
    setBusy(true); setMessage(""); setRedeemed(undefined); setRedemptionEmails(undefined);
    try {
      const response = await fetch(`/api/daily/gift-cards?code=${encodeURIComponent(value)}`, { cache: "no-store" });
      const payload = await response.json() as { card?: VendorPhysicalGiftCardLookup; error?: string };
      if (!response.ok || !payload.card) throw new Error(payload.error ?? "Η Gift Card δεν βρέθηκε.");
      setCode(value); setCard(payload.card);
      setMessage(payload.card.status === "active" ? `Διαθέσιμο υπόλοιπο ${euro(payload.card.balanceMinor)}.` : `Κατάσταση Gift Card: ${payload.card.status}.`);
    } catch (error) {
      setCard(undefined); setMessage(error instanceof Error ? error.message : "Η Gift Card δεν βρέθηκε.");
    } finally { setBusy(false); }
  }

  async function redeem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!card || card.status !== "active") return;
    const form = new FormData(event.currentTarget);
    const amount = Number(String(form.get("redeemEuro") ?? "").replace(",", "."));
    const amountMinor = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amountMinor <= 0 || amountMinor > card.balanceMinor) {
      setMessage(`Το ποσό πρέπει να είναι μεγαλύτερο από 0 και έως ${euro(card.balanceMinor)}.`); return;
    }
    const confirmed = window.confirm(`Εξαργύρωση ${euro(amountMinor)} από Gift Card •••${card.suffix};\n\nΕπιβεβαιώνεις τη συναλλαγή στο φυσικό κατάστημα;`);
    if (!confirmed) return;

    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/daily/gift-cards", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "redeem", code, amountMinor, redemptionConfirmed: true, idempotencyKey: redemptionKeyRef.current })
      });
      const payload = await response.json() as { result?: VendorPhysicalGiftCardRedemptionResult; emails?: { vendor: EmailStatus; platform: EmailStatus }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Η εξαργύρωση απέτυχε.");
      setRedeemed(payload.result); setCard(payload.result.card); setRedemptionEmails(payload.emails);
      redemptionKeyRef.current = crypto.randomUUID();
      setMessage(`Η εξαργύρωση ολοκληρώθηκε. Νέο υπόλοιπο ${euro(payload.result.remainingBalanceMinor)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η εξαργύρωση απέτυχε.");
    } finally { setBusy(false); }
  }

  async function startScanner() {
    setMessage("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setMessage("Η κάμερα απαιτεί HTTPS και συμβατό browser."); return; }
    try {
      setScannerOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error("Δεν είναι διαθέσιμη η προβολή κάμερας.");
      const reader = new BrowserQRCodeReader();
      scannerRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video,
        (result) => {
          if (!result) return;
          const scanned = extractGiftCode(result.getText());
          if (!scanned) return;
          stopScanner(); setCode(scanned); void lookup(scanned);
        }
      );
    } catch (error) {
      stopScanner(); setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η πρόσβαση στην κάμερα.");
    }
  }

  const disabled = !access || Boolean(accessError);

  return <main style={{ minHeight: "100dvh", background: "#f4f5f0", color: "#171914", padding: "22px 16px 112px" }}>
    <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".16em" }}>KONTA MOY · DAILY</span>
        <h1 style={{ margin: 0, fontSize: "clamp(30px,7vw,46px)", lineHeight: 1 }}>Gift Cards</h1>
        <p style={{ margin: 0, color: "#5e655a", lineHeight: 1.5 }}>Έκδοση και εξαργύρωση KONTA MOY Gift Cards στο φυσικό κατάστημα.</p>
      </header>

      {access ? <div style={{ ...boxStyle(), padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><div><strong>{access.vendorName}</strong><div style={{ fontSize: 13, color: "#687064", marginTop: 2 }}>{access.activeLocations} ενεργό σημείο · {access.vendorEmail}</div></div><span style={{ padding: "6px 9px", borderRadius: 999, background: "#edf4e8", fontSize: 12, fontWeight: 850 }}>Ενεργό</span></div> : null}
      {accessError ? <div role="alert" style={{ ...boxStyle(), border: "1px solid #e7b8b2", color: "#8f251d" }}>{accessError}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 5, borderRadius: 18, background: "#e5e8df" }}>
        <button type="button" onClick={() => { stopScanner(); setMode("issue"); setMessage(""); }} style={{ minHeight: 48, border: 0, borderRadius: 14, background: mode === "issue" ? "white" : "transparent", font: "inherit", fontWeight: 900 }}>Έκδοση</button>
        <button type="button" onClick={() => { setMode("redeem"); setMessage(""); }} style={{ minHeight: 48, border: 0, borderRadius: 14, background: mode === "redeem" ? "white" : "transparent", font: "inherit", fontWeight: 900 }}>Εξαργύρωση</button>
      </div>

      {mode === "issue" ? <>
        <form onSubmit={issue} style={{ ...boxStyle(), display: "grid", gap: 13, opacity: disabled ? .65 : 1 }}>
          <div><h2 style={{ margin: 0 }}>Νέα φυσική Gift Card</h2><p style={{ margin: "5px 0 0", color: "#687064", lineHeight: 1.45 }}>Πρώτα εισπράττεις την αξία στο κατάστημα. Η έκδοση γίνεται μόνο μετά από ρητή επιβεβαίωση.</p></div>
          <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>Αξία (€)<input name="valueEuro" type="number" min="5" max="2000" step="0.01" required inputMode="decimal" placeholder="50.00" style={{ minHeight: 52, borderRadius: 14, border: "1px solid #d8ddd2", padding: "0 13px", font: "inherit" }} /></label>
          <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>Όνομα πελάτη<input name="customerName" required maxLength={160} autoComplete="name" style={{ minHeight: 52, borderRadius: 14, border: "1px solid #d8ddd2", padding: "0 13px", font: "inherit" }} /></label>
          <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>Email πελάτη<input name="customerEmail" type="email" required autoComplete="email" style={{ minHeight: 52, borderRadius: 14, border: "1px solid #d8ddd2", padding: "0 13px", font: "inherit" }} /></label>
          <button disabled={busy || disabled} type="submit" style={{ minHeight: 56, border: 0, borderRadius: 16, background: "#171914", color: "white", font: "inherit", fontWeight: 900 }}>{busy ? "Έκδοση…" : "Έκδοση Gift Card"}</button>
        </form>

        {issued ? <section style={{ ...boxStyle(), display: "grid", gap: 14, textAlign: "center" }}>
          <div><span style={{ display: "block", color: "#687064", fontSize: 13, fontWeight: 800 }}>ΕΚΔΟΘΗΚΕ</span><strong style={{ display: "block", fontSize: 30, marginTop: 4 }}>{euro(issued.card.initialValueMinor)}</strong></div>
          <div style={{ width: 190, height: 190, margin: "0 auto", background: "white", padding: 12, border: "1px solid #e3e5df", borderRadius: 18 }}><QRCode value={issued.code} size={164} style={{ width: "100%", height: "100%" }} /></div>
          <code style={{ display: "block", padding: 13, borderRadius: 14, background: "#f3f4f0", fontSize: 16, fontWeight: 900, overflowWrap: "anywhere" }}>{issued.code}</code>
          <p style={{ margin: 0, color: "#687064", lineHeight: 1.45 }}>Ο πλήρης κωδικός εμφανίζεται μόνο τώρα. Δώσε τον στον πελάτη μαζί με το QR.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><button type="button" onClick={() => void navigator.clipboard?.writeText(issued.code)} style={{ minHeight: 48, borderRadius: 14, border: "1px solid #d8ddd2", background: "white", font: "inherit", fontWeight: 850 }}>Αντιγραφή</button><button type="button" onClick={() => window.print()} style={{ minHeight: 48, borderRadius: 14, border: 0, background: "#edf4e8", font: "inherit", fontWeight: 850 }}>Εκτύπωση</button></div>
          {issueEmail ? <small style={{ color: issueEmail.sent ? "#32652e" : "#9c3b2d" }}>{issueEmail.sent ? "Το email στάλθηκε στον πελάτη." : `Το email δεν στάλθηκε${issueEmail.error ? `: ${issueEmail.error}` : "."}`}</small> : null}
        </section> : null}
      </> : <>
        <section style={{ ...boxStyle(), display: "grid", gap: 12 }}>
          <div><h2 style={{ margin: 0 }}>Έλεγχος Gift Card</h2><p style={{ margin: "5px 0 0", color: "#687064" }}>Σκάναρε το QR ή πληκτρολόγησε τον κωδικό πριν αφαιρέσεις ποσό.</p></div>
          {scannerOpen ? <div style={{ borderRadius: 18, overflow: "hidden", background: "#111", aspectRatio: "4 / 3" }}><video ref={videoRef} muted playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div> : null}
          <button type="button" disabled={disabled} onClick={() => scannerOpen ? stopScanner() : void startScanner()} style={{ minHeight: 50, borderRadius: 14, border: "1px solid #ccd2c7", background: scannerOpen ? "#f0f1ed" : "#171914", color: scannerOpen ? "#171914" : "white", font: "inherit", fontWeight: 900 }}>{scannerOpen ? "Κλείσιμο κάμερας" : "Σάρωση QR"}</button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}><input value={code} onChange={(event) => { setCode(event.target.value); setCard(undefined); }} placeholder="KM-XXXXXX-XXXXXX-XXXXXX-XXXXXX" autoComplete="off" spellCheck={false} style={{ minWidth: 0, minHeight: 52, borderRadius: 14, border: "1px solid #d8ddd2", padding: "0 13px", font: "inherit" }} /><button type="button" disabled={busy || disabled || !code.trim()} onClick={() => void lookup()} style={{ border: 0, borderRadius: 14, padding: "0 16px", background: "#e7eadf", font: "inherit", fontWeight: 900 }}>Έλεγχος</button></div>
        </section>

        {card ? <form onSubmit={redeem} style={{ ...boxStyle(), display: "grid", gap: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}><div><span style={{ color: "#687064", fontSize: 13 }}>Gift Card •••{card.suffix}</span><strong style={{ display: "block", fontSize: 32, marginTop: 3 }}>{euro(card.balanceMinor)}</strong></div><span style={{ padding: "6px 9px", borderRadius: 999, background: card.status === "active" ? "#edf4e8" : "#f4e6e3", fontSize: 12, fontWeight: 850 }}>{card.status}</span></div>
          {card.status === "active" && card.balanceMinor > 0 ? <><label style={{ display: "grid", gap: 6, fontWeight: 800 }}>Ποσό εξαργύρωσης (€)<input name="redeemEuro" type="number" min="0.01" max={(card.balanceMinor / 100).toFixed(2)} step="0.01" required defaultValue={(card.balanceMinor / 100).toFixed(2)} inputMode="decimal" style={{ minHeight: 52, borderRadius: 14, border: "1px solid #d8ddd2", padding: "0 13px", font: "inherit" }} /></label><button type="submit" disabled={busy} style={{ minHeight: 56, border: 0, borderRadius: 16, background: "#171914", color: "white", font: "inherit", fontWeight: 900 }}>{busy ? "Εξαργύρωση…" : "Εξαργύρωση Gift Card"}</button></> : <p style={{ margin: 0, color: "#8f251d" }}>Η Gift Card δεν μπορεί να εξαργυρωθεί.</p>}
        </form> : null}

        {redeemed ? <section style={{ ...boxStyle(), display: "grid", gap: 7 }}><strong style={{ fontSize: 21 }}>Η εξαργύρωση καταχωρήθηκε</strong><span>Ποσό: {euro(redeemed.amountMinor)}</span><span>Υπόλοιπο: {euro(redeemed.remainingBalanceMinor)}</span><small style={{ color: "#687064" }}>Ledger {redeemed.ledgerId}</small>{redemptionEmails ? <small style={{ color: redemptionEmails.vendor.sent && redemptionEmails.platform.sent ? "#32652e" : "#9c3b2d" }}>Email καταστήματος: {redemptionEmails.vendor.sent ? "στάλθηκε" : "αποτυχία"} · KONTA MOY: {redemptionEmails.platform.sent ? "στάλθηκε" : "αποτυχία"}</small> : null}</section> : null}
      </>}

      {message ? <p role="status" style={{ margin: 0, padding: "12px 14px", borderRadius: 14, background: "#e9ebe4", lineHeight: 1.45 }}>{message}</p> : null}
      <aside style={{ padding: "4px 4px 0", color: "#687064", fontSize: 13, lineHeight: 1.5 }}><strong>Λογιστική σημείωση:</strong> κάθε φυσική έκδοση και εξαργύρωση καταγράφεται με Vendor UID και audit ledger. Η οικονομική εκκαθάριση μεταξύ καταστημάτων και KONTA MOY γίνεται κεντρικά.</aside>
    </div>
    <VendorDailyBottomNav active="giftcards" />
  </main>;
}
