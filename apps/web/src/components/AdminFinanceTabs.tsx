"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const financeTabs = [
  { href: "/admin/finance", label: "Settlements" },
  { href: "/admin/finance/vendor-billing", label: "Vendor Billing" },
  { href: "/admin/finance/agreements", label: "Agreements" },
  { href: "/admin/finance/agreements/sla", label: "SLA" },
  { href: "/admin/tax", label: "Tax & myDATA" }
] as const;

function active(pathname: string, href: string) {
  if (href === "/admin/finance") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminFinanceTabs() {
  const pathname = usePathname();
  return <nav className="admin-local-tabs admin-finance-tabs" aria-label="Finance workspace sections">
    {financeTabs.map((tab) => <Link href={tab.href} key={tab.href} aria-current={active(pathname, tab.href) ? "page" : undefined}>{tab.label}</Link>)}
  </nav>;
}
