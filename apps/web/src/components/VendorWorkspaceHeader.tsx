"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { VENDOR_WORKSPACE_NAVIGATION } from "../lib/workspace-navigation";
import { VendorBreadcrumbs, VendorContextNavigation, VendorDomainNavigation } from "./VendorDomainNavigation";
import trialStyles from "./VendorTrial.module.css";

// Replaces the older WorkspaceNavigation accordion with domain navigation while preserving every existing route.

export function VendorWorkspaceHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState<readonly string[]>([]);
  const [csrfToken, setCsrfToken] = useState("");
  const [dropshippingOnly, setDropshippingOnly] = useState(false);
  const [trial, setTrial] = useState<{
    active: boolean;
    expiresAt: string;
    vendorName: string;
    productCount: number;
    mediaCount: number;
    brandConfigured: boolean;
    storefrontConfigured: boolean;
  }>();
  const [trialGuideOpen, setTrialGuideOpen] = useState(false);
  const [operatingContext, setOperatingContext] = useState<{
    marketId: string;
    hubId?: string;
    locationId?: string;
    operatingModel: "MANAGED" | "SELF_GOVERNED";
    capabilities: readonly string[];
  }>();

  // Mobile navigation should behave like a real app drawer: route changes close it,
  // Escape closes overlays, and the underlying page does not continue scrolling.
  useEffect(() => {
    setMenuOpen(false);
    setTrialGuideOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen && !trialGuideOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setTrialGuideOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [menuOpen, trialGuideOpen]);

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
        trial?: {
          active?: boolean;
          expiresAt?: string;
          vendorName?: string;
          productCount?: number;
          mediaCount?: number;
          brandConfigured?: boolean;
          storefrontConfigured?: boolean;
        };
        account?: { roles?: readonly string[] };
      } | undefined) => {
        if (!active) return;
        if (Array.isArray(payload?.account?.roles)) setRoles(payload.account.roles);
        if (typeof payload?.csrfToken === "string") setCsrfToken(payload.csrfToken);
        setDropshippingOnly(payload?.dropshippingOnly === true);
        if (payload?.trial?.active === true && payload.trial.expiresAt && payload.trial.vendorName) {
          setTrial({
            active: true,
            expiresAt: payload.trial.expiresAt,
            vendorName: payload.trial.vendorName,
            productCount: Number(payload.trial.productCount ?? 0),
            mediaCount: Number(payload.trial.mediaCount ?? 0),
            brandConfigured: payload.trial.brandConfigured === true,
            storefrontConfigured: payload.trial.storefrontConfigured === true
          });
        } else {
          setTrial(undefined);
        }
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
        { label: "Κέντρο dropshipping", href: "/vendor/dropshipping", icon: "⇄" },
        { label: "Στατιστικά", href: "/vendor/dropshipping/analytics", icon: "↗" },
        { label: "Χρειάζονται προσοχή", href: "/vendor/dropshipping/attention", icon: "!" },
        { label: "Κατάσταση ροής", href: "/vendor/dropshipping/health", icon: "↻" },
        { label: "Δραστηριότητα", href: "/vendor/dropshipping/activity", icon: "◷" },
        ...group.links.filter((link) => link.href !== "/vendor/catalog" && link.href !== "/vendor/catalog/feed")
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
  const trialCompletedSetup = trial
    ? [trial.brandConfigured, trial.storefrontConfigured, trial.productCount > 0].filter(Boolean).length
    : 0;
  const trialProgress = Math.round((trialCompletedSetup / 3) * 100);
  const trialSteps = trial ? [
    {
      label: "1 · Προφίλ καταστήματος",
      detail: "Συμπλήρωσε περιγραφή, εμφάνιση, λογότυπο και βασικές εικόνες.",
      href: "/vendor/trial#storefront-builder",
      state: trial.brandConfigured && trial.storefrontConfigured ? "done" : "todo"
    },
    {
      label: "2 · Πρώτα προϊόντα",
      detail: "Πρόσθεσε τα προϊόντα που θέλεις να προετοιμάσεις για δημοσίευση.",
      href: "/vendor/catalog",
      state: trial.productCount > 0 ? "done" : "todo"
    },
    {
      label: "3 · Προεπισκόπηση",
      detail: "Δες το κατάστημά σου όπως θα το βλέπει ο πελάτης.",
      href: "/vendor/preview",
      state: "explore"
    },
    {
      label: "4 · Τι ακολουθεί",
      detail: "Δες τα τελευταία βήματα πριν από την ενεργοποίηση.",
      href: "/vendor/trial#activation",
      state: "explore"
    }
  ] as const : [];

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
        <button className="workspace-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="vendor-workspace-navigation" aria-label={menuOpen ? "Κλείσιμο μενού συνεργάτη" : "Άνοιγμα μενού συνεργάτη"} onClick={() => setMenuOpen((current) => !current)}>
          <span>{menuOpen ? "Κλείσιμο" : "Μενού"}</span><i aria-hidden="true" />
        </button>
      </div>
      <VendorDomainNavigation id="vendor-workspace-navigation" groups={navigation} onNavigate={() => setMenuOpen(false)} />
      <div className="workspace-footer workspace-footer-stacked">
        <span className="workspace-session"><i aria-hidden="true" /> Συνδεδεμένος · ιδιωτικός χώρος</span>
        <div className="workspace-footer-actions">
          <Link className="workspace-footer-action workspace-public-link" href="/" onClick={() => setMenuOpen(false)}>Δημόσια σελίδα <span aria-hidden="true">↗</span></Link>
          <button className="workspace-footer-action" type="button" onClick={logout} disabled={busy}>{busy ? "Έξοδος…" : "Αποσύνδεση"}<span aria-hidden="true">↗</span></button>
        </div>
      </div>
    </header>
    {trial?.active && <>
      <div className={trialStyles.trialBanner}>
        <strong>✦ 3ήμερη δοκιμή · {trial.vendorName}</strong>
        <span>Η πώληση παραμένει κλειδωμένη μέχρι την ενεργοποίηση.</span>
        <button
          type="button"
          className={trialStyles.trialBannerButton}
          aria-expanded={trialGuideOpen}
          aria-controls="vendor-trial-guide"
          onClick={() => setTrialGuideOpen((current) => !current)}
        >
          Οδηγός · {trialProgress}%
        </button>
        <Link href="/vendor/preview" className={trialStyles.trialBannerLink}>Προεπισκόπηση →</Link>
      </div>
      {trialGuideOpen && <div className={trialStyles.guideBackdrop} onMouseDown={() => setTrialGuideOpen(false)}>
        <aside
          id="vendor-trial-guide"
          className={trialStyles.guideDrawer}
          role="dialog"
          aria-modal="true"
          aria-label="Οδηγός δοκιμής συνεργάτη"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={trialStyles.guideHeader}>
            <div>
              <span className={trialStyles.guideEyebrow}>Γρήγορη προετοιμασία</span>
              <h2>Οδηγός</h2>
              <p>Ρύθμισε μόνο τα βασικά πρώτα. Τα υπόλοιπα εργαλεία μπορείς να τα εξερευνήσεις όταν τα χρειαστείς.</p>
            </div>
            <button type="button" className={trialStyles.guideClose} onClick={() => setTrialGuideOpen(false)} aria-label="Κλείσιμο οδηγού">×</button>
          </div>
          <div className={trialStyles.guideProgress} aria-label={`Πρόοδος προετοιμασίας ${trialProgress}%`}>
            <span style={{ width: `${trialProgress}%` }} />
          </div>
          <div className={trialStyles.guideSummary}>
            <strong>{trialCompletedSetup}/3 βασικές ρυθμίσεις</strong>
            <span>{trial.productCount} προϊόντα · {trial.mediaCount} αρχεία</span>
          </div>
          <div className={trialStyles.guideSteps}>
            {trialSteps.map((step) => <Link
              key={step.label}
              href={step.href}
              onClick={() => setTrialGuideOpen(false)}
              className={`${trialStyles.guideStep} ${step.state === "done" ? trialStyles.guideStepDone : ""} ${step.state === "todo" ? trialStyles.guideStepTodo : ""}`}
            >
              <span className={trialStyles.guideStepIcon}>{step.state === "done" ? "✓" : step.state === "todo" ? "○" : "↗"}</span>
              <span><strong>{step.label}</strong><small>{step.detail}</small></span>
            </Link>)}
          </div>
          <div className={trialStyles.guideFooter}>
            <Link href="/vendor/trial" onClick={() => setTrialGuideOpen(false)}>Άνοιξε την πλήρη προετοιμασία →</Link>
            <small>Ο οδηγός παραμένει διαθέσιμος όσο η δοκιμή είναι ενεργή.</small>
          </div>
        </aside>
      </div>}
    </>}
    <div className="vendor-topbar">
      <div className="vendor-topbar-main">
        <div className="vendor-breadcrumbs"><VendorBreadcrumbs groups={navigation} /></div>
        <Link className="vendor-daily-launch" href="/daily?install=1" aria-label="Εγκατάσταση εφαρμογής KONTA MOY Daily"><span aria-hidden="true">↓</span> Εγκατάσταση Daily</Link>
      </div>
      <VendorContextNavigation groups={navigation} />
    </div>
  </>;
}
