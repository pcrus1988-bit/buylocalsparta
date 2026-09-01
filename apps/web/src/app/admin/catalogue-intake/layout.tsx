import Link from "next/link";
import type { ReactNode } from "react";

const destinations = [
  { href: "/admin/catalogue-intake", label: "Supplier PIM" },
  { href: "/admin/catalogue-intake/import", label: "Import" },
  { href: "/admin/catalogue-intake/intelligence", label: "Intelligence" },
  { href: "/admin/catalogue-intake/attributes", label: "Attributes" },
  { href: "/admin/catalogue-intake/values", label: "Controlled values" }
] as const;

export default function CatalogueIntakeLayout({ children }: { children: ReactNode }) {
  return <>
    <nav className="shell workspace-action-bar" aria-label="Supplier PIM workspaces" style={{paddingTop:"0.75rem",paddingBottom:"0.25rem"}}>
      <span><strong>Supplier PIM</strong> · governed intake &amp; normalization</span>
      <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
        {destinations.map((item)=><Link key={item.href} className="button button-secondary" href={item.href}>{item.label}</Link>)}
      </div>
    </nav>
    {children}
  </>;
}
