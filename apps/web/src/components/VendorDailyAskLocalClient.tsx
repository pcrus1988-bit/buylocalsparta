"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Advice = {
  csrfToken: string;
  conversations: ReadonlyArray<{ id: string; state: string; canonicalVariantId?: string; messages: ReadonlyArray<{ id: string; senderType: string; body: string; createdAt?: number }> }>;
  counteroffers: ReadonlyArray<{ id: string; status: string; canonicalVariantId?: string; need?: unknown }>;
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

export function VendorDailyAskLocalClient({ initial }: { initial: Advice }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const openRequests = initial.counteroffers.filter((item) => !["closed", "expired", "accepted", "rejected"].includes(item.status));

  async function reply(conversationId: string, body: string) {
    setBusy(conversationId);
    setError("");
    try {
      const response = await fetch("/api/daily/advice/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken },
        body: JSON.stringify({ conversationId, body })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η απάντηση δεν στάλθηκε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η απάντηση δεν στάλθηκε");
    } finally {
      setBusy("");
    }
  }

  return <main style={{ minHeight: "100dvh", background: "#f6f4ee", paddingBottom: 34 }}>
    <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 18px", background: "rgba(246,244,238,.94)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(23,25,20,.09)" }}>
      <div><span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".15em" }}>KONTA MOY</span><strong style={{ fontSize: 20 }}>Daily · Ask Local</strong></div>
      <Link href="/daily" style={{ color: "inherit", textDecoration: "none", border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: "9px 12px", fontWeight: 800 }}>Πίσω</Link>
    </header>

    <div style={{ width: "min(100% - 32px, 820px)", margin: "0 auto", paddingTop: 24, display: "grid", gap: 24 }}>
      <section>
        <div style={{ marginBottom: 12 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".13em", textTransform: "uppercase", opacity: .55 }}>Assigned requests</span><h1 style={{ margin: "4px 0", fontSize: 30, letterSpacing: "-.04em" }}>Ask Local</h1><p style={{ margin: 0, opacity: .62 }}>Αιτήματα και σχετικές συνομιλίες που έχουν ανατεθεί στο κατάστημά σου.</p></div>
        {openRequests.length ? <div style={{ display: "grid", gap: 10 }}>{openRequests.map((request) => <article key={request.id} style={{ background: "white", border: "1px solid rgba(23,25,20,.09)", borderRadius: 18, padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}><strong>{request.canonicalVariantId ?? "Γενικό αίτημα"}</strong><span style={{ fontSize: 12, fontWeight: 800, background: "#f0eee6", borderRadius: 999, padding: "5px 9px" }}>{request.status}</span></div><p style={{ margin: "10px 0 0", opacity: .72 }}>{needSummary(request.need)}</p></article>)}</div> : <div style={{ padding: 18, borderRadius: 18, background: "white", border: "1px solid rgba(23,25,20,.09)", opacity: .65 }}>Δεν υπάρχουν ανοιχτά Ask Local αιτήματα.</div>}
      </section>

      <section>
        <div style={{ marginBottom: 12 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".13em", textTransform: "uppercase", opacity: .55 }}>Messages</span><h2 style={{ margin: "4px 0", fontSize: 24 }}>Συνομιλίες</h2></div>
        {error && <p role="alert" style={{ padding: 12, borderRadius: 12, background: "#fff0ee", color: "#8d2119", fontWeight: 700 }}>{error}</p>}
        {initial.conversations.length ? <div style={{ display: "grid", gap: 12 }}>{initial.conversations.map((conversation, index) => <details key={conversation.id} open={index === 0} style={{ background: "white", border: "1px solid rgba(23,25,20,.09)", borderRadius: 18, padding: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>{conversation.canonicalVariantId ?? "Γενική συμβουλή"} <span style={{ fontWeight: 500, opacity: .55 }}>· {conversation.state}</span></summary>
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>{conversation.messages.map((message) => <div key={message.id} style={{ justifySelf: message.senderType === "vendor" ? "end" : "start", maxWidth: "86%", padding: "10px 12px", borderRadius: 14, background: message.senderType === "vendor" ? "#171914" : "#f0eee6", color: message.senderType === "vendor" ? "white" : "inherit" }}><strong style={{ display: "block", fontSize: 11, marginBottom: 3 }}>{message.senderType === "vendor" ? "Κατάστημα" : "Πελάτης"}</strong><span>{message.body}</span>{message.createdAt && <small style={{ display: "block", marginTop: 4, opacity: .58 }}>{when(message.createdAt)}</small>}</div>)}</div>
          <form style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 14 }} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const body = String(form.get("body") ?? "").trim(); if (body) void reply(conversation.id, body); }}>
            <input name="body" required placeholder="Γράψε απάντηση…" aria-label="Απάντηση στη συνομιλία" style={{ minWidth: 0, minHeight: 48, border: "1px solid rgba(23,25,20,.16)", borderRadius: 13, padding: "0 12px", font: "inherit" }} />
            <button type="submit" disabled={Boolean(busy)} style={{ border: 0, borderRadius: 13, background: "#171914", color: "white", padding: "0 16px", font: "inherit", fontWeight: 800 }}>{busy === conversation.id ? "…" : "Αποστολή"}</button>
          </form>
        </details>)}</div> : <div style={{ padding: 18, borderRadius: 18, background: "white", border: "1px solid rgba(23,25,20,.09)", opacity: .65 }}>Δεν υπάρχουν ενεργές συνομιλίες.</div>}
      </section>
    </div>
  </main>;
}
