"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function DailySessionControls() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (pathname === "/daily/login") return null;

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/daily/logout", { method: "POST" });
    } finally {
      router.replace("/daily/login");
      router.refresh();
      setBusy(false);
    }
  }

  return <button
    type="button"
    onClick={() => void logout()}
    disabled={busy}
    aria-label="Αποσύνδεση από KONTA MOY Daily"
    style={{
      position: "fixed",
      top: 12,
      right: 12,
      zIndex: 60,
      minHeight: 38,
      padding: "0 12px",
      borderRadius: 12,
      border: "1px solid rgba(23,25,20,.15)",
      background: "rgba(255,255,255,.92)",
      backdropFilter: "blur(12px)",
      color: "#171914",
      font: "inherit",
      fontSize: 12,
      fontWeight: 800,
      cursor: busy ? "wait" : "pointer"
    }}
  >{busy ? "…" : "Έξοδος"}</button>;
}
