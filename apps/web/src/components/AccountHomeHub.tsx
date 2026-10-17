import Link from "next/link";
import styles from "./AccountHomeHub.module.css";

const iconPaths = {
  orders: ["M3 7h18v13H3z", "M7 7V5a5 5 0 0 1 10 0v2", "M8 12h8"],
  heart: ["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"],
  truck: ["M3 6h12v11H3z", "M15 10h4l3 4v3h-7", "M8 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4", "M19 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4"],
  basket: ["M4 10h16l-2 10H6L4 10Z", "M8 10l4-7 4 7", "M9 14v3", "M15 14v3"],
  chat: ["M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3-.6L4 20l1.6-4.5A7.5 7.5 0 1 1 20 11.5Z", "M8.5 11h7"],
  sparkle: ["m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"],
  calendar: ["M4 6h16v15H4z", "M4 10h16", "M8 3v6", "M16 3v6", "M8 15h3"],
  document: ["M6 2h8l5 5v15H6z", "M14 2v6h5", "M9 13h7", "M9 17h7"],
  gift: ["M3 10h18v11H3z", "M2 7h20v4H2z", "M12 7v14", "M12 7c-8 0-8-6-4.5-6C10 1 12 7 12 7Z", "M12 7c8 0 8-6 4.5-6C14 1 12 7 12 7Z"],
  bookmark: ["M6 3h12v18l-6-4-6 4V3Z"],
  profile: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21c0-4.5 3.2-7 8-7s8 2.5 8 7"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9Z", "M10 21h4"],
  shield: ["M12 2 4 5v6c0 5 3.3 8.6 8 11 4.7-2.4 8-6 8-11V5z", "m9 12 2 2 4-4"],
  lock: ["M5 11h14v11H5z", "M8 11V7a4 4 0 1 1 8 0v4", "M12 15v3"],
  help: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4", "M12 17h.01"]
} as const;

type IconName = keyof typeof iconPaths;

function TileIcon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {iconPaths[name].map((path, index) => <path d={path} key={index} />)}
  </svg>;
}

type Tile = { title: string; subtitle: string; href: string; icon: IconName; featured?: boolean; count?: number };
const shopping: readonly Tile[] = [
  { title: "Παραγγελίες", subtitle: "Κατάσταση & παραλαβή", href: "/account/orders", icon: "orders", featured: true },
  { title: "Τα αγαπημένα μου", subtitle: "Προϊόντα που κράτησες", href: "/account/wishlist", icon: "heart" },
  { title: "Παράδοση", subtitle: "Αποστολές & παραλαβές", href: "/account/delivery", icon: "truck" },
  { title: "Λίστα σούπερ μάρκετ", subtitle: "KONTA MOY × Πόσο Κάνει", href: "/posokanei", icon: "basket" }
];
const services: readonly Tile[] = [
  { title: "Ask Local", subtitle: "Ρώτησε την τοπική αγορά", href: "/account/ask-local", icon: "chat", featured: true },
  { title: "Try On Me", subtitle: "Δοκίμασε ρούχα ψηφιακά", href: "/account/try-on", icon: "sparkle" },
  { title: "Ραντεβού", subtitle: "Οι κρατήσεις σου", href: "/account/appointments", icon: "calendar" },
  { title: "Έγγραφα", subtitle: "Οδηγοί έργων & PDF", href: "/account/documents", icon: "document" },
  { title: "Δωροκάρτες", subtitle: "Υπόλοιπα & δώρα", href: "/account/gift-cards", icon: "gift" },
  { title: "Αποθηκευμένα", subtitle: "Αναζητήσεις & ειδοποιήσεις", href: "/account/saved", icon: "bookmark" }
];
const settings: readonly Tile[] = [
  { title: "Προφίλ & διευθύνσεις", subtitle: "Τα προσωπικά σου στοιχεία", href: "/account/profile", icon: "profile" },
  { title: "Ειδοποιήσεις", subtitle: "Νέα & ενημερώσεις", href: "/account/notifications", icon: "bell" },
  { title: "Ασφάλεια", subtitle: "Κωδικοί & συνεδρίες", href: "/account/security", icon: "shield" },
  { title: "Ιδιωτικότητα", subtitle: "Τα δεδομένα & οι επιλογές σου", href: "/account/privacy", icon: "lock" },
  { title: "Βοήθεια", subtitle: "Επικοινώνησε μαζί μας", href: "/account/support", icon: "help" }
];

function Section({ id, eyebrow, title, description, items }: { id: string; eyebrow: string; title: string; description: string; items: readonly Tile[] }) {
  return <section className={styles.section} aria-labelledby={id}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>{eyebrow}</span><h2 id={id}>{title}</h2></div><p>{description}</p></div>
    <div className={styles.tileGrid}>{items.map((item) => <Link className={`${styles.tile} ${item.featured ? styles.tileFeatured : ""}`} href={item.href} key={item.href}>
      <span className={styles.tileIcon}><TileIcon name={item.icon} /></span>
      <span className={styles.tileCopy}><strong>{item.title}</strong><small>{item.subtitle}</small></span>
      <span className={styles.tileArrow} aria-hidden="true">↗</span>
    </Link>)}</div>
  </section>;
}

export function AccountHomeHub({ activeOrders, unreadNotifications, savedProducts, savedSearches }: { activeOrders: number; unreadNotifications: number; savedProducts: number; savedSearches: number }) {
  return <div className={`shell ${styles.hub}`}>
    <div className={styles.overview}>
      <div><span className={styles.eyebrow}>Ο λογαριασμός μου</span><h2>Τι θέλεις να κάνεις <span>σήμερα;</span></h2><p>Οι πιο σημαντικές ενέργειες και η δραστηριότητά σου, χωρίς περιττά μενού.</p></div>
      <Link className={styles.browseLink} href="/shop">Ανακάλυψε προϊόντα <span aria-hidden="true">↗</span></Link>
    </div>
    <div className={styles.stats} aria-label="Η δραστηριότητά σου">
      <Link href="/account/orders" className={styles.stat}><span><TileIcon name="orders" /> Ενεργές παραγγελίες</span><strong>{activeOrders}</strong></Link>
      <Link href="/account/notifications" className={styles.stat}><span><TileIcon name="bell" /> Νέες ειδοποιήσεις</span><strong>{unreadNotifications}</strong></Link>
      <Link href="/account/wishlist" className={styles.stat}><span><TileIcon name="heart" /> Αγαπημένα</span><strong>{savedProducts}</strong></Link>
      <Link href="/account/saved" className={styles.stat}><span><TileIcon name="bookmark" /> Αναζητήσεις</span><strong>{savedSearches}</strong></Link>
    </div>
    <Section id="account-shopping" eyebrow="01 / Αγορές" title="Οι αγορές μου" description="Όσα αγοράζεις, θέλεις και παρακολουθείς." items={shopping} />
    <Section id="account-services" eyebrow="02 / Υπηρεσίες" title="Ανακάλυψε περισσότερα" description="Οι χρήσιμες δυνατότητες του ΚΟΝΤΑ ΜΟΥ." items={services} />
    <Section id="account-settings" eyebrow="03 / Λογαριασμός" title="Προσωπικά & ρυθμίσεις" description="Ο λογαριασμός σου, πάντα υπό τον έλεγχό σου." items={settings} />
  </div>;
}
