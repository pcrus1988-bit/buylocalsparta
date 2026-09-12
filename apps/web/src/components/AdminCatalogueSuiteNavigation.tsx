"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type CatalogueSuiteSection = "overview" | "acquire" | "structure" | "organise" | "assignment" | "exceptions";

const SECTIONS: ReadonlyArray<Readonly<{
  id: CatalogueSuiteSection;
  step: string;
  label: string;
  href: string;
  title: string;
}>> = [
  { id: "overview", step: "1", label: "Overview", href: "/admin/catalogue", title: "Catalogue dashboard and health" },
  { id: "acquire", step: "2", label: "Acquire", href: "/admin/catalogue-crawler", title: "Crawl websites and import source catalogues" },
  { id: "structure", step: "3", label: "Structure", href: "/admin/catalogue/structure", title: "Taxonomy, Product Types and governed attributes" },
  { id: "organise", step: "4", label: "Vendor Matching", href: "/admin/matching", title: "Commercial vendor submissions and canonical matching" },
  { id: "assignment", step: "5", label: "Vendor Assignment", href: "/admin/catalogue-intake", title: "Supplier PIM evidence and vendor assortment assignment" },
  { id: "exceptions", step: "6", label: "Exceptions", href: "/admin/catalogue/exceptions", title: "Strong-identity conflicts requiring human review" }
] as const;

function activeSection(pathname: string): CatalogueSuiteSection | undefined {
  if (pathname === "/admin/catalogue") return "overview";
  if (pathname.startsWith("/admin/catalogue/exceptions")) return "exceptions";

  if (
    pathname.startsWith("/admin/catalogue-crawler")
    || pathname.startsWith("/admin/catalogue-intake/import")
  ) return "acquire";

  if (
    pathname.startsWith("/admin/catalogue/structure")
    || pathname.startsWith("/admin/catalogue/attribute-")
    || pathname.startsWith("/admin/categories")
    || pathname.startsWith("/admin/catalogue-intake/attributes")
    || pathname.startsWith("/admin/catalogue-intake/values")
    || pathname.startsWith("/admin/catalogue-intake/intelligence")
  ) return "structure";

  if (pathname.startsWith("/admin/matching")) return "organise";
  if (pathname.startsWith("/admin/catalogue-intake")) return "assignment";
  return undefined;
}

export function AdminCatalogueSuiteNavigation({ availableRoutes }: { availableRoutes: ReadonlySet<string> }) {
  const pathname = usePathname();
  const active = activeSection(pathname);
  if (!active) return null;

  const visibleSections = SECTIONS.filter((section) => availableRoutes.has(section.href));
  if (visibleSections.length === 0) return null;

  return <div className="shell admin-local-tabs-shell admin-catalogue-suite-shell">
    <nav className="admin-local-tabs admin-catalogue-suite-nav" aria-label="Catalogue Suite">
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
