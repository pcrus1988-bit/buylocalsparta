import Link from "next/link";

export type WorkspaceQuickLink = Readonly<{
  href: string;
  label: string;
  description: string;
  kicker: string;
  value?: string | number;
}>;

export function WorkspaceQuickLinks({
  eyebrow,
  title,
  links
}: Readonly<{ eyebrow: string; title: string; links: readonly WorkspaceQuickLink[] }>) {
  return <section className="shell workspace-quick-section" aria-labelledby="workspace-quick-links">
    <div className="workspace-quick-heading">
      <div><div className="eyebrow">{eyebrow}</div><h2 id="workspace-quick-links">{title}</h2></div>
      <p>Κάθε κάρτα οδηγεί σε ξεχωριστή λειτουργία ή ουσιαστική επόμενη ενέργεια.</p>
    </div>
    <div className="workspace-quick-grid">
      {links.map((item) => <Link href={item.href} key={item.href} className="workspace-quick-card">
        <span>{item.kicker}</span>
        {item.value !== undefined && <b>{item.value}</b>}
        <strong>{item.label}</strong>
        <small>{item.description}</small>
        <i aria-hidden="true">Άνοιγμα →</i>
      </Link>)}
    </div>
  </section>;
}
