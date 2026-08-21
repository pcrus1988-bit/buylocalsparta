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

export function AdminFinanceTabs() {
  const pathname = usePathname();
  const current = [...financeTabs].filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
  return <nav className="admin-local-tabs admin-finance-tabs" aria-label="Finance workspace sections">
    {financeTabs.map((tab) => <Link href={tab.href} key={tab.href} aria-current={current?.href === tab.href ? "page" : undefined}>{tab.label}</Link>)}
  </nav>;
}
