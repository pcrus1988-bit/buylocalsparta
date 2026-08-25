"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./DailyNotificationFloat.module.css";

export type DailyFloatingNotification = Readonly<{
  id: string;
  title: string;
  body: string;
  href: string;
  at: number;
  read: boolean;
  label: string;
}>;

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.25 17.5h11.5l-1.25-1.8V11a4.5 4.5 0 1 0-9 0v4.7L6.25 17.5Z" />
    <path d="M10 19.25a2.15 2.15 0 0 0 4 0" />
  </svg>;
}

function formatWhen(value: number) {
  return new Intl.DateTimeFormat("el-GR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Athens"
  }).format(new Date(value));
}

export function DailyNotificationFloat({
  events,
  unread = 0
}: {
  events: ReadonlyArray<DailyFloatingNotification>;
  unread?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return <div className={styles.floating}>
    <button
      type="button"
      className={styles.trigger}
      aria-label="Ειδοποιήσεις Daily"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    >
      <BellIcon />
      {unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
    </button>

    {open && <section className={styles.panel} role="dialog" aria-label="Ειδοποιήσεις Daily">
      <header className={styles.panelHeader}>
        <div><span>Daily</span><strong>Ειδοποιήσεις</strong></div>
        <button type="button" aria-label="Κλείσιμο ειδοποιήσεων" onClick={() => setOpen(false)}>×</button>
      </header>

      <div className={styles.list}>
        {events.length === 0
          ? <div className={styles.empty}>Δεν υπάρχουν πρόσφατες ειδοποιήσεις.</div>
          : events.map((event) => <Link key={event.id} href={event.href} className={styles.event} onClick={() => setOpen(false)}>
            <span className={styles.eventMarker} aria-hidden="true">{event.read ? "" : "•"}</span>
            <div>
              <strong>{event.title}</strong>
              <p>{event.body}</p>
              <small>{event.at ? formatWhen(event.at) : event.label}{event.at ? ` · ${event.label}` : ""}</small>
            </div>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </Link>)}
      </div>

      <footer className={styles.panelFooter}>
        <Link href="/daily/notifications" onClick={() => setOpen(false)}>Όλο το ιστορικό</Link>
        <Link href="/daily/notifications/settings" onClick={() => setOpen(false)}>Ρυθμίσεις</Link>
      </footer>
    </section>}
  </div>;
}
