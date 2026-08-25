"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & Readonly<{
  prompt: () => Promise<void>;
  userChoice: Promise<Readonly<{ outcome: "accepted" | "dismissed"; platform: string }>>;
}>;

type InstallMode = "hidden" | "prompt" | "ios" | "instructions";

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
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent>();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(serviceWorkerPath, { scope, updateViaCache: "none" }).catch((error: unknown) => {
        console.warn("PWA service worker registration failed", error);
      });
    }
    if (standalone()) return;

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
    if (iosDevice()) setMode("ios");
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, [scope, serviceWorkerPath]);

  async function install() {
    if (mode === "ios") {
      setMode("instructions");
      return;
    }
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setMode("hidden");
    else setMode("prompt");
    setPromptEvent(undefined);
  }

  if (mode === "hidden") return null;
  const bottom = placement === "daily" ? 88 : 18;

  return (
    <aside
      aria-label={`Εγκατάσταση ${appName}`}
      style={{
        position: "fixed",
        zIndex: 80,
        right: 14,
        bottom,
        width: mode === "instructions" ? "min(330px,calc(100vw - 28px))" : "auto",
        padding: mode === "instructions" ? 14 : 0,
        border: mode === "instructions" ? "1px solid rgba(23,25,20,.12)" : 0,
        borderRadius: 16,
        background: mode === "instructions" ? "#fff" : "transparent",
        boxShadow: mode === "instructions" ? "0 14px 40px rgba(23,25,20,.14)" : "none"
      }}
    >
      {mode === "instructions" ? (
        <div style={{ display: "grid", gap: 10 }}>
          <strong>{appName} στην Αρχική οθόνη</strong>
          <span style={{ fontSize: 13, lineHeight: 1.45, opacity: .72 }}>
            Στο Safari πάτησε Κοινή χρήση και μετά «Προσθήκη στην οθόνη Αφετηρίας». Η εφαρμογή ανοίγει αυτόνομα, χωρίς να αποθηκεύει παραγγελίες ή στοιχεία πελατών offline.
          </span>
          <button type="button" onClick={() => setMode("ios")} style={secondaryButton}>Κλείσιμο</button>
        </div>
      ) : (
        <button type="button" onClick={() => void install()} style={installButton}>
          + Εγκατάσταση {appName}
        </button>
      )}
    </aside>
  );
}

const installButton = {
  minHeight: 44,
  border: "1px solid rgba(23,25,20,.14)",
  borderRadius: 999,
  padding: "9px 14px",
  background: "#171914",
  color: "#fff",
  font: "inherit",
  fontSize: 12,
  fontWeight: 900,
  boxShadow: "0 8px 24px rgba(23,25,20,.16)",
  cursor: "pointer"
} as const;

const secondaryButton = {
  minHeight: 38,
  border: "1px solid rgba(23,25,20,.14)",
  borderRadius: 10,
  padding: "7px 11px",
  background: "#f5f2eb",
  color: "#171914",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer"
} as const;
