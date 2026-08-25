import type { Metadata } from "next";
import { Comfortaa } from "next/font/google";
import "./globals.css";
import "./storefront-merchants.css";
import "./storefront-advice.css";
import "./storefront-content.css";
import "./storefront-merchant-media.css";
import "./dashboard-ux.css";
import "./dashboard-premium.css";
import "./site-polish.css";
import "./footer-polish.css";
import "./workspace-polish.css";
import "./checkout-polish.css";
import "./dashboard-luxury.css";
import "./workspace-pages.css";
import "./workspace-metrics-polish.css";
import "./workspace-queue-polish.css";
import "./typography-readability.css";
import "./customer-account-ux.css";
import "./customer-engagement-actions.css";
import "./customer-account-onboarding.css";
import "./ask-local-clarifications.css";
import "./customer-profile-security.css";
import "./customer-support.css";
import "./customer-returns-lifecycle.css";
import "./customer-fulfilment-progress.css";
import "./customer-notification-lifecycle.css";
import "./customer-saved-search-editing.css";
import "./customer-saved-product-alerts.css";
import "./customer-recent-history-controls.css";
import "./vendor-information-architecture.css";
import "./vendor-lifecycle.css";
import "./vendor-login.css";
import "./admin-information-architecture.css";
import "./admin-domain-workspaces.css";
import "./admin-dashboard-customizer.css";
import "./admin-directory-search.css";
import "./admin-orders-directory.css";
import "./admin-order-record.css";
import "./admin-status-semantics.css";
import "./admin-local-tabs.css";
import "./admin-partner-record.css";
import "./admin-matching-split.css";
import "./admin-commercial-finance.css";
import "./admin-nav-icons.css";
import "./admin-queue-split.css";
import "./admin-insights.css";
import "./admin-tax-documents.css";
import "./privacy-consent.css";
import "./legal-pages.css";
import "./accessibility-controls.css";
import "./site-utility-launcher.css";
import { CartProvider } from "../components/CartProvider";
import { PrivacyConsentProvider } from "../components/PrivacyConsentProvider";
import { AccessibilityPreferences } from "../components/AccessibilityPreferences";
import { SiteUtilityLauncher } from "../components/SiteUtilityLauncher";
import { getSeoGlobalSettingsSnapshot } from "../lib/seo-settings";

const comfortaa = Comfortaa({ subsets: ["greek", "latin"], display: "swap", variable: "--font-comfortaa" });

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSeoGlobalSettingsSnapshot();
  return {
    metadataBase: new URL(settings.canonicalOrigin),
    title: { default: settings.defaultTitle, template: settings.titleTemplate },
    description: settings.defaultDescription,
    keywords: ["Σπάρτη", "τοπικά καταστήματα", "ΚΟΝΤΑ ΜΟΥ", "marketplace", "Λακωνία", "online αγορές"],
    openGraph: {
      title: settings.defaultOpenGraphTitle,
      description: settings.defaultOpenGraphDescription,
      images: settings.defaultOpenGraphImage ? [settings.defaultOpenGraphImage] : undefined,
      siteName: settings.siteName,
      locale: "el_GR",
      type: "website",
      url: "/"
    },
    verification: settings.googleSiteVerification ? { google: settings.googleSiteVerification } : undefined,
    robots: settings.indexingEnabled ? undefined : { index: false, follow: false, noarchive: true, nosnippet: true }
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="el" className={comfortaa.variable}>
    <body>
      <PrivacyConsentProvider><CartProvider>{children}</CartProvider></PrivacyConsentProvider>
      <AccessibilityPreferences />
      <SiteUtilityLauncher />
    </body>
  </html>;
}
