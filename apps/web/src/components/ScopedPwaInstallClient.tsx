"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & Readonly<{
  prompt: () => Promise<void>;
  userChoice: Promise<Readonly<{ outcome: "accepted" | "dismissed"; platform: string }>>;
}>;

type InstallMode = "hidden" | "ready" | "prompt" | "instructions";
type Platform = "ios" | "other";

function standalone(): boolean {
  const nav = navigator as Navigator & Readonly<{ standalone?: boolean }>;
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function iosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function ScopedPwaInstallClient({
  appName,
  serviceWorkerPath,
  scope,
  placement = "default"
}: {
  appName: string;
  serviceWorkerPath: string;
  scope: string;
  placement?: "default" | "daily";
}) {
  const [mode, setMode] = useState<InstallMode>("hidden");
  const [platform, setPlatform] = useState<Platform>("other");
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent>();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(serviceWorkerPath, { scope, updateViaCache: "none" }).catch((error: unknown) => {
        console.warn("PWA service worker registration failed", error);
      });
    }
    if (standalone()) return;

    const isIos = iosDevice();
    setPlatform(isIos ? "ios" : "other");
    setMode("ready");

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setMode("prompt");
    };
    const installed = () => {
      setPromptEvent(undefined);
      setMode("hidden");
    };

    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, [scope, serviceWorkerPath]);

  async function install() {
    if (!promptEvent) {
      setMode("instructions");
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setMode("hidden");
    else setMode("ready");
    setPromptEvent(undefined);
  }

  if (mode === "hidden") return null;
  const bottom = placement === "daily" ? 88 : 18;

  return (
    <aside
      aria-label={`Εγκατάσταση ${appName}`}
      style={{
        position: "fixed",
        zIndex: 90,
        right: 14,
        bottom,
        width: mode === "instructions" ? "min(360px,calc(100vw - 28px))" : "auto",
        padding: mode === "instructions" ? 16 : 0,
        border: mode === "instructions" ? "1px solid rgba(23,25,20,.12)" : 0,
        borderRadius: 18,
        background: mode === "instructions" ? "#fff" : "transparent",
        boxShadow: mode === "instructions" ? "0 18px 48px rgba(23,25,20,.18)" : "none"
      }}
    >
      {mode === "instructions" ? (
        <div style={{ display: "grid", gap: 10 }}>
          <strong>Download App · {appName}</strong>
          <span style={{ fontSize: 13, lineHeight: 1.5, opacity: .76 }}>
            {platform === "ios"
              ? "Στο Safari πάτησε Κοινή χρήση και μετά «Προσθήκη στην οθόνη Αφετηρίας». Η εφαρμογή θα ανοίγει αυτόνομα από το εικονίδιό της."
              : "Αν δεν εμφανίστηκε αυτόματα παράθυρο εγκατάστασης, άνοιξε το μενού του Chrome ή Edge και επίλεξε «Εγκατάσταση εφαρμογής» / «Add to Home screen»."}
          </span>
          <span style={{ fontSize: 12, lineHeight: 1.45, opacity: .62 }}>
            Για λόγους ασφάλειας, παραγγελίες, διευθύνσεις, οικονομικά στοιχεία και στοιχεία πελατών δεν αποθηκεύονται offline.
          </span>
          <button type="button" onClick={() => setMode(promptEvent ? "prompt" : "ready")} style={secondaryButton}>Κλείσιμο</button>
        </div>
      ) : (
        <button type="button" onClick={() => void install()} style={installButton}>
          <span aria-hidden="true">↓</span> Download App · {appName}
        </button>
      )}
    </aside>
  );
}

const installButton = {
  minHeight: 52,
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 999,
  padding: "12px 18px",
  background: "#171914",
  color: "#fff",
  font: "inherit",
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: ".01em",
  boxShadow: "0 12px 34px rgba(23,25,20,.24)",
  cursor: "pointer"
} as const;

const secondaryButton = {
  minHeight: 40,
  border: "1px solid rgba(23,25,20,.14)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#f5f2eb",
  color: "#171914",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer"
} as const;
