import Link from "next/link";

export type WorkspaceQuickLink = Readonly<{
  href: string;
  label: string;
  description?: string;
  kicker: string;
  value?: string | number;
}>;

export function WorkspaceQuickLinks({
  eyebrow,
  title,
  links,
  density = "standard"
}: Readonly<{
  eyebrow: string;
  title: string;
  links: readonly WorkspaceQuickLink[];
  density?: "standard" | "compact";
}>) {
  const compact = density === "compact";
  return <section className={`shell workspace-quick-section${compact ? " is-compact" : ""}`} aria-labelledby="workspace-quick-links">
    <div className="workspace-quick-heading">
      <div><div className="eyebrow">{eyebrow}</div><h2 id="workspace-quick-links">{title}</h2></div>
      {!compact && <p>Κάθε κάρτα οδηγεί σε ξεχωριστή λειτουργία ή ουσιαστική επόμενη ενέργεια.</p>}
    </div>
    <div className="workspace-quick-grid">
      {links.map((item, index) => <Link href={item.href} key={item.href} className="workspace-quick-card">
        <span className="workspace-quick-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <span className="workspace-quick-kicker">{item.kicker}</span>
        {item.value !== undefined && <b>{item.value}</b>}
        <strong>{item.label}</strong>
        {item.description && <small>{item.description}</small>}
        <i aria-hidden="true"><span>{compact ? "Άνοιγμα" : "Μετάβαση"}</span><b>→</b></i>
      </Link>)}
    </div>
  </section>;
}
