"use client";

import { useState } from "react";

type SimulationState = {
  previewLink: string;
  runId: string;
  expiresAt: number;
  messageId?: string;
  dryRun: boolean;
};
type Proof = { runId: string; answersCount: number; submittedAt: number };

export function ResearchWorkflowSimulator({ slug, csrfToken }: {
  slug: string; csrfToken: string;
}) {
  const [email, setEmail] = useState("");
  const [approved, setApproved] = useState(false);
  const [run, setRun] = useState<SimulationState | null>(null);
  const [receivedInvitation, setReceivedInvitation] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [proof, setProof] = useState<Proof | null>(null);
  const [notificationMessageId, setNotificationMessageId] = useState("");
  const [receivedNotification, setReceivedNotification] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/research/simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      cache: "no-store",
      body: JSON.stringify({ ...body, slug })
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok || data.ok !== true) throw new Error(typeof data.error === "string" ? data.error : "Η δοκιμή απέτυχε.");
    return data;
  }

  async function start(dryRun: boolean) {
    if (loading || !approved || !email.trim()) return;
    if (!dryRun && !window.confirm("SEND ONE TEST EMAIL to " + email.trim() + "?\n\nOnly one test recipient. SES may charge for sending.")) return;
    setError("");
    setLoading("send");
    try {
      const data = await post({
        action: dryRun ? "preview" : "send",
        to: email.trim(),
        confirm: dryRun ? undefined : "SEND ONE TEST EMAIL"
      });
      setRun({
        previewLink: String(data.previewLink), runId: String(data.runId),
        expiresAt: Number(data.expiresAt),
        messageId: typeof data.messageId === "string" ? data.messageId : undefined,
        dryRun
      });
      setReceipt("");
      setProof(null);
      setNotificationMessageId("");
      setReceivedInvitation(false);
      setReceivedNotification(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Αδύνατη η δημιουργία δοκιμής.");
    } finally {
      setLoading("");
    }
  }

  async function verify() {
    if (!receipt.trim() || loading) return;
    setError("");
    setLoading("verify");
    try {
      const data = await post({ action: "verify", receipt: receipt.trim() });
      if (!run || data.runId !== run.runId) throw new Error("Η απόδειξη ανήκει σε άλλη δοκιμή. Ξεκινήστε από τον σωστό σύνδεσμο.");
      setProof({
        runId: String(data.runId), answersCount: Number(data.answersCount),
        submittedAt: Number(data.submittedAt)
      });
    } catch (cause) {
      setProof(null);
      setError(cause instanceof Error ? cause.message : "Η απόδειξη δεν επαληθεύτηκε.");
    } finally {
      setLoading("");
    }
  }

  async function sendNotification() {
    if (!proof || !run || loading || run.dryRun) return;
    if (!window.confirm("SEND ONE ADMIN TEST NOTICE to " + email.trim() + "?\n\nThis is a second real SES message.")) return;
    setError("");
    setLoading("notify");
    try {
      const data = await post({
        action: "notify", receipt: receipt.trim(),
        confirm: "SEND ONE ADMIN TEST NOTICE"
      });
      setNotificationMessageId(String(data.messageId));
      setReceivedNotification(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ειδοποίηση δεν στάλθηκε.");
    } finally {
      setLoading("");
    }
  }

  const checks = [
    Boolean(run), Boolean(run && (run.dryRun || receivedInvitation)),
    Boolean(proof), Boolean(run?.dryRun || notificationMessageId),
    Boolean(run?.dryRun || receivedNotification)
  ];
  const done = checks.filter(Boolean).length;

  return <div className="shell vendor-section" style={{ display: "grid", gap: 22 }}>
    <div className="workspace-action-bar" style={{ alignItems: "flex-start" }}>
      <span><strong>Simulation progress · {done}/5 steps</strong><br />
        Each step is deliberately separate. SES accepted is not the same as delivered.
      </span>
      <span className="workspace-status-badge">Isolated · no Research DB writes</span>
    </div>
    <div className="workspace-queue-card" style={{ display: "grid", gap: 12 }}>
      <h2>1 · Set up a private test</h2>
      <p>Use a mailbox you own and can inspect. There is never a recipient list, sample draw, or live survey send here.</p>
      <label htmlFor="simulation-mailbox"><strong>Your test mailbox</strong></label>
      <input id="simulation-mailbox" type="email" autoComplete="email" className="input"
        value={email} disabled={Boolean(run) || Boolean(loading)} onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com" required />
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input type="checkbox" checked={approved} disabled={Boolean(run) || Boolean(loading)}
          onChange={(event) => setApproved(event.target.checked)} />
        <span>I control this mailbox. I understand that a real test email is sent only if I explicitly select that option.</span>
      </label>
      <div className="workspace-action-buttons">
        <button type="button" className="button button-secondary" disabled={Boolean(loading) || Boolean(run) || !approved || !email.includes("@")}
          onClick={() => void start(true)}>Create no-email dry run</button>
        <button type="button" className="button" disabled={Boolean(loading) || Boolean(run) || !approved || !email.includes("@")}
          onClick={() => void start(false)}>{loading === "send" ? "Preparing…" : "Send one real test email"}</button>
      </div>
      {run && <div className="workspace-inline-note" role="status">
        <strong>{run.dryRun ? "Preview only — no email sent" : "SES accepted a test invitation (not proof of delivery)"}</strong>
        <p>Run: <code>{run.runId}</code></p>
        <p>Expires (Athens): {new Date(run.expiresAt).toLocaleString("el-GR", {
          dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens"
        })}</p>
        {run.messageId && <small>SES message ID: {run.messageId}</small>}
      </div>}
    </div>

    <div className="workspace-queue-card" style={{ display: "grid", gap: 12 }}>
      <h2>2 · Check the invitation and open the link</h2>
      {!run ? <p>Create a test run first.</p> : <>
        <p>{run.dryRun
          ? "Open the preview below. This proves only that the link and form work, not that email delivery works."
          : "Check Inbox and Spam for [TEST ONLY]. Tick receipt only after you actually see the email."}</p>
        {!run.dryRun && <label style={{ display: "flex", gap: 10 }}>
          <input type="checkbox" checked={receivedInvitation} onChange={(event) => setReceivedInvitation(event.target.checked)} />
          I personally received the invitation in my mailbox.
        </label>}
        <div className="workspace-action-buttons">
          <a className="button button-secondary" href={run.previewLink} target="_blank" rel="noreferrer noopener">
            Open test link in new tab
          </a>
          <button type="button" className="button button-secondary"
            onClick={() => void navigator.clipboard.writeText(run.previewLink)}>Copy test link</button>
        </div>
        <small>Opening this Admin preview link does not confirm email delivery. For email testing, open the link from the received message.</small>
      </>}
    </div>

    <div className="workspace-queue-card" style={{ display: "grid", gap: 12 }}>
      <h2>3 · Submit test answers and verify the receipt</h2>
      <p>In the participant tab, answer three sample questions and submit. Copy the encrypted receipt and paste it below. No survey answers enter the study.</p>
      <label htmlFor="simulation-proof"><strong>Submission receipt</strong></label>
      <textarea id="simulation-proof" className="input" rows={4} value={receipt}
        onChange={(event) => { setReceipt(event.target.value); setProof(null); setNotificationMessageId(""); }}
        placeholder="v1. …" disabled={!run} />
      <div className="workspace-action-buttons">
        <button className="button" type="button" disabled={!run || !receipt || Boolean(loading)}
          onClick={() => void verify()}>{loading === "verify" ? "Verifying…" : "Verify submission"}</button>
      </div>
      {proof && <div className="workspace-inline-note" role="status">
        <strong>Verified: {proof.answersCount} sample answers submitted.</strong><br />
        {new Date(proof.submittedAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })} · receipt is cryptographically authentic.
        This proves a successful simulated submission, not a real study response.
      </div>}
    </div>

    <div className="workspace-queue-card" style={{ display: "grid", gap: 12 }}>
      <h2>4 · Trigger and check the Admin test notification</h2>
      <p>The Admin receipt check gates a second separately confirmed SES email to the same controlled mailbox. No automatic email is sent by the public participant endpoint.</p>
      {run?.dryRun
        ? <div className="workspace-inline-note">Dry run: notification displayed here only; no email sent.</div>
        : <button className="button" type="button"
          disabled={!proof || Boolean(loading) || Boolean(notificationMessageId)}
          onClick={() => void sendNotification()}>
          {loading === "notify" ? "Sending…" : "Send one test Admin notification"}
        </button>}
      {notificationMessageId && <>
        <div className="workspace-inline-note">SES accepted the Admin test notice · {notificationMessageId}. Delivery is not yet verified.</div>
        <label style={{ display: "flex", gap: 10 }}>
          <input type="checkbox" checked={receivedNotification}
            onChange={(event) => setReceivedNotification(event.target.checked)} />
          I personally received the Admin notification.
        </label>
      </>}
    </div>

    <div className="workspace-queue-card">
      <h2>5 · Review the test outcome</h2>
      <p><strong>{done}/5</strong> checks completed. {done === 5
        ? run?.dryRun ? "Dry-run journey completed; email delivery remains untested." : "Test flow completed, including manually confirmed receipt."
        : "Outstanding steps remain. Do not treat this as a fully verified run."}</p>
      <p>Test submissions are temporary cryptographic receipts. They never count toward the Pilot, main study, consent registry, analysis, or public dashboard.</p>
      <button type="button" className="button button-secondary" onClick={() => {
        setRun(null); setProof(null); setReceipt(""); setApproved(false);
        setReceivedInvitation(false); setReceivedNotification(false);
        setNotificationMessageId(""); setError("");
      }}>Reset simulation</button>
    </div>
    {error && <div className="workspace-inline-note form-error" role="alert">{error}</div>}
  </div>;
}
