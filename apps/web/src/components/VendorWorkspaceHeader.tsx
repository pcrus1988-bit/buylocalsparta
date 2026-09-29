"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { VENDOR_WORKSPACE_NAVIGATION } from "../lib/workspace-navigation";
import { VendorBreadcrumbs, VendorContextNavigation, VendorDomainNavigation } from "./VendorDomainNavigation";

// Replaces the older WorkspaceNavigation accordion with domain navigation while preserving every existing route.

export function VendorWorkspaceHeader() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState<readonly string[]>([]);
  const [csrfToken, setCsrfToken] = useState("");
  const [dropshippingOnly, setDropshippingOnly] = useState(false);
  const [operatingContext, setOperatingContext] = useState<{
    marketId: string;
    hubId?: string;
    locationId?: string;
    operatingModel: "MANAGED" | "SELF_GOVERNED";
    capabilities: readonly string[];
  }>();

  useEffect(() => {
    let active = true;
    void fetch("/api/vendor/auth-context", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : undefined)
      .then((payload: {
        csrfToken?: string;
        dropshippingOnly?: boolean;
        operatingContext?: {
          marketId?: string;
          hubId?: string;
          locationId?: string;
          operatingModel?: "MANAGED" | "SELF_GOVERNED";
          capabilities?: readonly string[];
        };
        account?: { roles?: readonly string[] };
      } | undefined) => {
        if (!active) return;
        if (Array.isArray(payload?.account?.roles)) setRoles(payload.account.roles);
        if (typeof payload?.csrfToken === "string") setCsrfToken(payload.csrfToken);
        setDropshippingOnly(payload?.dropshippingOnly === true);
        if (payload?.operatingContext?.marketId && payload.operatingContext.operatingModel) {
          setOperatingContext({
            marketId: payload.operatingContext.marketId,
            hubId: payload.operatingContext.hubId,
            locationId: payload.operatingContext.locationId,
            operatingModel: payload.operatingContext.operatingModel,
            capabilities: Array.isArray(payload.operatingContext.capabilities) ? payload.operatingContext.capabilities : []
          });
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const navigation = useMemo(() => {
    const roleFiltered = roles.includes("vendor_owner") ? VENDOR_WORKSPACE_NAVIGATION : VENDOR_WORKSPACE_NAVIGATION
      .map((group) => ({ ...group, links: group.links.filter((link) => link.href !== "/vendor/daily-access") }))
      .filter((group) => group.links.length > 0)
      .map((group) => group.href === "/vendor/daily-access" ? { ...group, href: group.links[0]?.href } : group);

    const selfGovernedOnly = new Set([
      "catalogue.import",
      "local_delivery.manage",
      "aade.manage",
      "promotions.manage",
      "seo.source_data.manage",
      "subscription.manage"
    ]);
    const capabilityFiltered = roleFiltered
      .map((group) => ({
        ...group,
        links: group.links.filter((link) => {
          if (!link.vendorCapability) return true;
          if (!operatingContext) return !selfGovernedOnly.has(link.vendorCapability);
          return operatingContext.capabilities.includes(link.vendorCapability);
        })
      }))
      .filter((group) => group.links.length > 0)
      .map((group) => group.links.some((link) => link.href === group.href) ? group : { ...group, href: group.links[0]?.href });

    if (!dropshippingOnly) return capabilityFiltered;
    return capabilityFiltered.map((group) => group.href === "/vendor/catalog" ? {
      ...group,
      label: "Dropshipping",
      href: "/vendor/dropshipping",
      icon: "⇄",
      links: [
        { label: "Dropshipping Control Centre", href: "/vendor/dropshipping", icon: "⇄" },
        { label: "Analytics", href: "/vendor/dropshipping/analytics", icon: "↗" },
        { label: "Needs attention", href: "/vendor/dropshipping/attention", icon: "!" },
        { label: "Feed health", href: "/vendor/dropshipping/health", icon: "↻" },
        { label: "Activity", href: "/vendor/dropshipping/activity", icon: "◷" },
        ...group.links.filter((link) => link.href !== "/vendor/catalog")
      ]
    } : group);
  }, [roles, dropshippingOnly, operatingContext]);

  const marketLabel = operatingContext?.marketId === "sparta"
    ? "Σπάρτη"
    : (operatingContext?.marketId ?? "sparta")
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toLocaleUpperCase("el") + part.slice(1))
        .join(" ");
  const selfGoverned = operatingContext?.operatingModel === "SELF_GOVERNED";

  async function logout() {
    setBusy(true);
    try {
      let token = csrfToken;
      if (!token) {
        const session = await fetch("/api/vendor/auth-context", { cache: "no-store" });
        if (!session.ok) {
          router.replace("/vendor/login");
          router.refresh();
          return;
        }
        const payload = await session.json() as { csrfToken?: string };
        token = payload.csrfToken ?? "";
      }
      if (!token) throw new Error("vendor_session_missing_csrf");
      await fetch("/api/vendor/logout", { method: "POST", headers: { "x-csrf-token": token } });
      router.replace("/vendor/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className={`workspace-header vendor-header${menuOpen ? " is-menu-open" : ""}`}>
      <div className="workspace-brand-row">
        <Link className="brand workspace-identity" href="/vendor" onClick={() => setMenuOpen(false)}>
          {selfGoverned
            ? <span aria-hidden="true" style={{ fontWeight: 900, letterSpacing: ".08em", fontSize: "0.78rem" }}>ΚΟΝΤΑ ΜΟΥ</span>
            : <img src="/brand/kontamou-sparta-logo.webp" alt="ΚΟΝΤΑ ΜΟΥ Σπάρτη" width={78} height={52} style={{ display: "block", width: "78px", height: "52px", objectFit: "contain" }} />}
          <span>
            <strong>Χώρος συνεργάτη</strong>
            <small>{selfGoverned ? `Αυτοδιαχειριζόμενο HUB · ${marketLabel}${operatingContext?.hubId ? ` · ${operatingContext.hubId}` : ""}` : "ΚΟΝΤΑ ΜΟΥ Σπάρτη"}</small>
          </span>
        </Link>
        <button className="workspace-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="vendor-workspace-navigation" onClick={() => setMenuOpen((current) => !current)}>
          <span>{menuOpen ? "Κλείσιμο" : "Μενού"}</span><i aria-hidden="true" />
        </button>
      </div>
      <VendorDomainNavigation id="vendor-workspace-navigation" groups={navigation} onNavigate={() => setMenuOpen(false)} />
      <div className="workspace-footer workspace-footer-stacked">
        <span className="workspace-session"><i aria-hidden="true" /> Online · ιδιωτικό scope</span>
        <div className="workspace-footer-actions">
          <Link className="workspace-footer-action workspace-public-link" href="/" onClick={() => setMenuOpen(false)}>Δημόσιο site <span aria-hidden="true">↗</span></Link>
          <button className="workspace-footer-action" type="button" onClick={logout} disabled={busy}>{busy ? "Έξοδος…" : "Αποσύνδεση"}<span aria-hidden="true">↗</span></button>
        </div>
      </div>
    </header>
    <div className="vendor-topbar">
      <div className="vendor-topbar-main">
        <div className="vendor-breadcrumbs"><VendorBreadcrumbs groups={navigation} /></div>
        <Link className="vendor-daily-launch" href="/daily?install=1"><span aria-hidden="true">↓</span> Download App · KONTA MOY Daily</Link>
      </div>
      <VendorContextNavigation groups={navigation} />
    </div>
  </>;
}
