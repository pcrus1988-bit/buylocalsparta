"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type CatalogueSuiteSection = "overview" | "acquire" | "pim" | "structure" | "match" | "quality" | "exceptions";

const SECTIONS: ReadonlyArray<Readonly<{
  id: CatalogueSuiteSection;
  step: string;
  label: string;
  href: string;
  title: string;
}>> = [
  { id: "overview", step: "1", label: "Overview", href: "/admin/catalogue", title: "Catalogue dashboard and health" },
  { id: "acquire", step: "2", label: "Acquire", href: "/admin/catalogue-crawler", title: "Website and file acquisition into governed source data" },
  { id: "pim", step: "3", label: "Supplier PIM", href: "/admin/catalogue-intake", title: "Supplier evidence, provenance, controlled values and assortment preparation" },
  { id: "structure", step: "4", label: "Structure", href: "/admin/catalogue/structure", title: "Taxonomy, Product Types, attributes and canonical reference data" },
  { id: "match", step: "5", label: "Match", href: "/admin/matching", title: "Canonical identity and commercial vendor-offer matching" },
  { id: "quality", step: "6", label: "Quality", href: "/admin/catalogue/enrichment", title: "Enrichment QA, brand governance and manufacturer catalogue quality" },
  { id: "exceptions", step: "7", label: "Exceptions", href: "/admin/catalogue/exceptions", title: "Strong-identity conflicts requiring human review" }
] as const;

function activeSection(pathname: string): CatalogueSuiteSection | undefined {
  if (pathname === "/admin/catalogue" || pathname.startsWith("/admin/quickadd")) return "overview";
  if (pathname.startsWith("/admin/catalogue/exceptions")) return "exceptions";

  if (
    pathname.startsWith("/admin/catalogue-crawler")
    || pathname.startsWith("/admin/catalogue-intake/import")
  ) return "acquire";

  if (
    pathname === "/admin/catalogue-intake"
    || pathname.startsWith("/admin/catalogue-intake/intelligence")
  ) return "pim";

  if (
    pathname.startsWith("/admin/catalogue/structure")
    || pathname.startsWith("/admin/catalogue/attribute-")
    || pathname.startsWith("/admin/categories")
    || pathname.startsWith("/admin/catalogue-intake/attributes")
    || pathname.startsWith("/admin/catalogue-intake/values")
  ) return "structure";

  if (pathname.startsWith("/admin/matching")) return "match";

  if (
    pathname.startsWith("/admin/catalogue/enrichment")
    || pathname.startsWith("/admin/catalogue/brands")
    || pathname.startsWith("/admin/catalogue/vitex")
  ) return "quality";

  return undefined;
}

export function AdminCatalogueSuiteNavigation({ availableRoutes }: { availableRoutes: ReadonlySet<string> }) {
  const pathname = usePathname();
  const active = activeSection(pathname);
  if (!active) return null;

  const visibleSections = SECTIONS.filter((section) => availableRoutes.has(section.href));
  if (visibleSections.length === 0) return null;

  return <div className="shell admin-local-tabs-shell admin-catalogue-suite-shell">
    <nav className="admin-local-tabs admin-catalogue-suite-nav" aria-label="Catalogue workflow">
      {visibleSections.map((section) => <Link
        href={section.href}
        key={section.id}
        aria-current={section.id === active ? "page" : undefined}
        title={section.title}
      >
        <span className="admin-catalogue-suite-step" aria-hidden="true">{section.step}</span>
        <span>{section.label}</span>
      </Link>)}
    </nav>
  </div>;
}
