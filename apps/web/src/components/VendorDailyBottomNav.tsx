"use client";

import Link from "next/link";
import styles from "./VendorDailyBottomNav.module.css";

type Active = "orders" | "scan" | "notifications";

function NotebookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.75h11.25A1.75 1.75 0 0 1 19 5.5v13a1.75 1.75 0 0 1-1.75 1.75H6A1.75 1.75 0 0 1 4.25 18.5v-13A1.75 1.75 0 0 1 6 3.75Z"/><path d="M8 3.75v16.5M10.75 8h5M10.75 12h5M10.75 16h3.25"/></svg>;
}
function CameraIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 7.75h3l1.2-2h6.1l1.2 2h3A1.75 1.75 0 0 1 21 9.5v8A1.75 1.75 0 0 1 19.25 19h-14A1.75 1.75 0 0 1 3.5 17.5v-8a1.75 1.75 0 0 1 1.25-1.75Z"/><circle cx="12.25" cy="13.25" r="3.25"/></svg>;
}
function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.25 17.5h11.5l-1.25-1.8V11a4.5 4.5 0 1 0-9 0v4.7L6.25 17.5Z"/><path d="M10 19.25a2.15 2.15 0 0 0 4 0"/></svg>;
}

export function VendorDailyBottomNav({ active, unread = 0 }: { active?: Active; unread?: number }) {
  return <nav className={styles.nav} aria-label="KONTA MOY Daily">
    <Link href="/daily/orders" className={active === "orders" ? styles.active : ""} aria-current={active === "orders" ? "page" : undefined}>
      <NotebookIcon/><span>Orders</span>
    </Link>
    <Link href="/daily/scan" className={`${styles.scan} ${active === "scan" ? styles.active : ""}`} aria-current={active === "scan" ? "page" : undefined}>
      <CameraIcon/><span>Scan</span>
    </Link>
    <Link href="/daily/notifications" className={active === "notifications" ? styles.active : ""} aria-current={active === "notifications" ? "page" : undefined}>
      <span className={styles.iconWrap}><BellIcon/>{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</span><span>Alerts</span>
    </Link>
  </nav>;
}
