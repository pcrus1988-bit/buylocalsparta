"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Support = "checking" | "supported" | "unsupported";

function applicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return buffer;
}

export function VendorDailyNotificationSettings({ configured, publicKey, devices, csrfToken }: { configured: boolean; publicKey?: string; devices: number; csrfToken: string }) {
  const [support, setSupport] = useState<Support>("checking");
  const [permission, setPermission] = useState<NotificationPermission | "unavailable">("unavailable");
  const [deviceCount, setDeviceCount] = useState(devices);
  const [thisDevice, setThisDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const deliveryReady = configured && thisDevice && permission === "granted";

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupport(supported ? "supported" : "unsupported");
    if (!supported) {
      setPermission("unavailable");
      setThisDevice(false);
      return;
    }

    const synchronizeBrowserState = async () => {
      setPermission(Notification.permission);
      try {
        const registration = await navigator.serviceWorker.getRegistration("/daily/");
        const subscription = await registration?.pushManager.getSubscription();
        setThisDevice(Boolean(subscription));
      } catch {
        setThisDevice(false);
      }
    };

    void synchronizeBrowserState();
    const onVisible = () => {
      if (document.visibilityState === "visible") void synchronizeBrowserState();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  async function persist(subscription: PushSubscription) {
    const json = subscription.toJSON();
    const response = await fetch("/api/daily/push/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } })
    });
    const payload = await response.json() as { error?: string; devices?: number };
    if (!response.ok) throw new Error(payload.error ?? "Η εγγραφή push απέτυχε");
    setDeviceCount(Number(payload.devices ?? 1));
  }

  async function prepareDevice() {
    if (support !== "supported") return;
    setBusy(true); setMessage("");
    try {
      if (!configured || !publicKey) throw new Error("Η υπογραφή Web Push δεν έχει διαμορφωθεί ακόμη στο server.");
      if (Notification.permission === "denied") {
        setPermission("denied");
        throw new Error("Το kontamou.site είναι αποκλεισμένο από τον browser. Στο Android άνοιξε τις ρυθμίσεις του browser → Ρυθμίσεις ιστοτόπου → Ειδοποιήσεις → kontamou.site → Επιτρέπεται. Μετά γύρισε εδώ και πάτησε ξανά ενεργοποίηση.");
      }
      const registration = await navigator.serviceWorker.register("/daily-sw.js", { scope: "/daily/" });
      const result = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      setPermission(result);
      if (result === "denied") throw new Error("Οι ειδοποιήσεις έχουν αποκλειστεί από το browser/τη συσκευή. Άλλαξε την άδεια από τις ρυθμίσεις του browser και επέστρεψε σε αυτή τη σελίδα.");
      if (result !== "granted") throw new Error("Δεν δόθηκε άδεια για ειδοποιήσεις.");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      await persist(subscription);
      setThisDevice(true);
      setMessage("Η συσκευή συνδέθηκε με το KONTA MOY Daily. Οι λειτουργικές ειδοποιήσεις μπορούν πλέον να φτάνουν και όταν το Daily δεν είναι ανοιχτό.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η ενεργοποίηση ειδοποιήσεων σε αυτή τη συσκευή.");
    } finally { setBusy(false); }
  }

  async function disableDevice() {
    setBusy(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/daily/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/daily/push/subscriptions", {
          method: "DELETE",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        const payload = await response.json() as { error?: string; devices?: number };
        if (!response.ok) throw new Error(payload.error ?? "Η απενεργοποίηση απέτυχε");
        await subscription.unsubscribe();
        setDeviceCount(Number(payload.devices ?? 0));
      }
      setThisDevice(false);
      setMessage("Οι ειδοποιήσεις Daily απενεργοποιήθηκαν για αυτή τη συσκευή.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Η απενεργοποίηση απέτυχε"); }
    finally { setBusy(false); }
  }

  return <main style={{ minHeight: "100dvh", background: "#f6f4ee", padding: "18px 16px 42px" }}>
    <div style={{ width: "min(100%, 720px)", margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 28 }}>
        <div><span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".15em" }}>KONTA MOY</span><strong style={{ fontSize: 20 }}>Daily · Alerts</strong></div>
        <Link href="/daily" style={{ color: "inherit", textDecoration: "none", border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: "9px 12px", fontWeight: 800 }}>Πίσω</Link>
      </header>

      <section style={{ background: "white", border: "1px solid rgba(23,25,20,.09)", borderRadius: 24, padding: "clamp(20px,5vw,34px)", display: "grid", gap: 22 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".13em", textTransform: "uppercase", opacity: .55 }}>Phone notifications</span>
          <h1 style={{ margin: "5px 0 9px", fontSize: 32, letterSpacing: "-.04em" }}>Ειδοποιήσεις για ό,τι χρειάζεται ενέργεια</h1>
          <p style={{ margin: 0, opacity: .68, lineHeight: 1.55 }}>Το Daily χρησιμοποιεί push μόνο για λειτουργικές ενημερώσεις του καταστήματος, όπως παραγγελίες, Ask Local και SLA. Δεν μετατρέπει αυτόματα marketing μηνύματα σε push.</p>
        </div>

        <div style={{ display: "grid", gap: 9 }}>
          <Status label="Υποστήριξη browser" value={support === "checking" ? "Έλεγχος…" : support === "supported" ? "Υποστηρίζεται" : "Δεν υποστηρίζεται"} ok={support === "supported"} />
          <Status label="Server Web Push" value={configured ? "Διαμορφωμένο" : "Λείπει VAPID configuration"} ok={configured} />
          <Status label="Άδεια ειδοποιήσεων" value={permission === "unavailable" ? "Μη διαθέσιμη" : permission === "granted" ? "Επιτρέπεται" : permission === "denied" ? "Αποκλεισμένη" : "Δεν ζητήθηκε"} ok={permission === "granted"} />
          <Status label="Αυτή η συσκευή" value={thisDevice ? "Εγγεγραμμένη" : "Δεν έχει εγγραφεί"} ok={thisDevice} />
          <Status label="Background Web Push" value={deliveryReady ? `Ενεργό σε αυτή τη συσκευή${deviceCount > 1 ? ` · ${deviceCount} συνολικά` : ""}` : "Δεν είναι ενεργό"} ok={deliveryReady} />
        </div>

        {!configured && <div style={{ padding: "13px 15px", borderRadius: 15, background: "#f2f0e9", lineHeight: 1.5 }}><strong>Απαιτείται VAPID configuration στο deployment.</strong><br /><span style={{ opacity: .7 }}>Μέχρι να υπάρχουν τα server keys, το Daily δεν εμφανίζει ψευδή ένδειξη ότι το background push είναι ενεργό.</span></div>}
        {permission === "denied" && <div style={{ padding: "13px 15px", borderRadius: 15, background: "#f2f0e9", lineHeight: 1.5 }}><strong>Η άδεια είναι μπλοκαρισμένη από τον browser.</strong><br /><span style={{ opacity: .7 }}>Δεν επιτρέπεται σε ιστοσελίδα να παρακάμψει αυτή την επιλογή. Στο Android άλλαξε την άδεια του kontamou.site σε «Επιτρέπεται» από τις Ρυθμίσεις ιστοτόπου / Ειδοποιήσεις. Όταν επιστρέψεις στο Daily, η κατάσταση επανελέγχεται αυτόματα.</span></div>}

        <button type="button" onClick={() => void prepareDevice()} disabled={busy || support !== "supported" || !configured} style={{ minHeight: 54, border: 0, borderRadius: 15, background: "#171914", color: "white", font: "inherit", fontWeight: 850, cursor: support === "supported" && configured ? "pointer" : "not-allowed", opacity: support === "supported" && configured ? 1 : .5 }}>{busy ? "Ενημέρωση…" : thisDevice ? "Επανέλεγχος / επανεγγραφή" : permission === "denied" ? "Έλεγχος άδειας / οδηγίες" : "Ενεργοποίηση ειδοποιήσεων"}</button>
        {thisDevice && <button type="button" onClick={() => void disableDevice()} disabled={busy} style={{ minHeight: 48, borderRadius: 15, border: "1px solid rgba(23,25,20,.16)", background: "white", font: "inherit", fontWeight: 800 }}>Απενεργοποίηση σε αυτή τη συσκευή</button>}
        {message && <p role="status" style={{ margin: 0, padding: "12px 14px", borderRadius: 13, background: "#f2f0e9", lineHeight: 1.45 }}>{message}</p>}

        <small style={{ opacity: .55, lineHeight: 1.5 }}>Η άδεια του browser ζητείται μόνο μετά από δικό σου πάτημα. Η συνδρομή αποθηκεύεται για τον συγκεκριμένο Daily χρήστη και vendor και ανακαλείται μαζί με την πρόσβαση.</small>
      </section>
    </div>
  </main>;
}

function Status({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "12px 14px", border: "1px solid rgba(23,25,20,.08)", borderRadius: 14 }}><strong style={{ fontSize: 14 }}>{label}</strong><span style={{ fontSize: 13, fontWeight: 800, opacity: ok ? 1 : .58 }}>{value}</span></div>;
}
