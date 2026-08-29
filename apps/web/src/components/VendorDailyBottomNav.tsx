"use client";

import Link from "next/link";
import styles from "./VendorDailyBottomNav.module.css";

type Active = "quickadd" | "orders" | "scan" | "giftcards" | "notifications";

function QuickAddIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.25" y="4.25" width="15.5" height="15.5" rx="3"/><path d="M12 8v8M8 12h8"/></svg>;
}
function NotebookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.75h11.25A1.75 1.75 0 0 1 19 5.5v13a1.75 1.75 0 0 1-1.75 1.75H6A1.75 1.75 0 0 1 4.25 18.5v-13A1.75 1.75 0 0 1 6 3.75Z"/><path d="M8 3.75v16.5M10.75 8h5M10.75 12h5M10.75 16h3.25"/></svg>;
}
function CameraIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 7.75h3l1.2-2h6.1l1.2 2h3A1.75 1.75 0 0 1 21 9.5v8A1.75 1.75 0 0 1 19.25 19h-14A1.75 1.75 0 0 1 3.5 17.5v-8a1.75 1.75 0 0 1 1.25-1.75Z"/><circle cx="12.25" cy="13.25" r="3.25"/></svg>;
}
function GiftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.75" y="9" width="16.5" height="11" rx="2"/><path d="M12 9v11M3.75 13h16.5M12 9H8.7A2.7 2.7 0 1 1 12 5.25V9Zm0 0h3.3A2.7 2.7 0 1 0 12 5.25V9Z"/></svg>;
}

export function VendorDailyBottomNav({ active }: { active?: Active; unread?: number }) {
  return <nav className={styles.nav} aria-label="KONTA MOY Daily">
    <Link href="/daily/quickadd" className={active === "quickadd" ? styles.active : ""} aria-current={active === "quickadd" ? "page" : undefined}>
      <QuickAddIcon/><span>Quick Add</span>
    </Link>
    <Link href="/daily/scan" className={`${styles.scan} ${active === "scan" ? styles.active : ""}`} aria-current={active === "scan" ? "page" : undefined}>
      <CameraIcon/><span>Scan</span>
    </Link>
    <Link href="/daily/orders" className={active === "orders" ? styles.active : ""} aria-current={active === "orders" ? "page" : undefined}>
      <NotebookIcon/><span>Orders</span>
    </Link>
    <Link href="/daily/gift-cards" className={active === "giftcards" ? styles.active : ""} aria-current={active === "giftcards" ? "page" : undefined}>
      <GiftIcon/><span>Gift Cards</span>
    </Link>
  </nav>;
}
