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
import "./customer-mobile-commerce.css";
import { CartProvider } from "../components/CartProvider";
import { CustomerMobileCommerceProvider } from "../components/CustomerMobileCommerceNav";
import { PrivacyConsentProvider } from "../components/PrivacyConsentProvider";
import { AccessibilityPreferences } from "../components/AccessibilityPreferences";
import { SiteUtilityLauncher } from "../components/SiteUtilityLauncher";
import { getSeoGlobalSettingsSnapshot } from "../lib/seo-settings";
import { KONTA_MOY_EMAIL_COMPANY } from "@buy-local-sparta/resend-notifications";
import { SpeedInsights } from "@vercel/speed-insights/next";

const comfortaa = Comfortaa({ subsets: ["greek", "latin"], display: "swap", variable: "--font-comfortaa" });

const LOCAL_COMMERCE_DESCRIPTION = "Το ΚΟΝΤΑ ΜΟΥ είναι πλατφόρμα τοπικού εμπορίου από τη Σπάρτη. Οι πελάτες μπορούν να ανακαλύπτουν προϊόντα, να ζητούν συμβουλή μέσω Ask Local και να αγοράζουν από περισσότερα τοπικά καταστήματα με ένα καλάθι και ένα checkout. Για τις μικρές επιχειρήσεις προσφέρει ψηφιακή βιτρίνα, διαχείριση παραγγελιών και εκπλήρωσης, υποστήριξη παράδοσης και πανελλαδική online ορατότητα χωρίς να χρειάζεται να λειτουργούν δικό τους e-shop.";

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSeoGlobalSettingsSnapshot();
  return {
    metadataBase: new URL(settings.canonicalOrigin),
    title: { default: settings.defaultTitle, template: settings.titleTemplate },
    description: settings.defaultDescription,
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: "/favicon.svg"
    },
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { settings } = await getSeoGlobalSettingsSnapshot();
  const origin = settings.canonicalOrigin.replace(/\/$/, "");
  const websiteId = `${origin}/#website`;
  const organizationId = `${origin}/#organization`;
  const serviceId = `${origin}/#local-commerce-service`;
  const rootStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: settings.siteName,
        alternateName: ["ΚΟΝΤΑ ΜΟΥ", "KONTA MOU"],
        url: origin,
        description: LOCAL_COMMERCE_DESCRIPTION,
        inLanguage: "el-GR",
        publisher: { "@id": organizationId },
        about: { "@id": serviceId }
      },
      {
        "@type": "OnlineStore",
        "@id": organizationId,
        name: settings.siteName,
        alternateName: ["ΚΟΝΤΑ ΜΟΥ", "KONTA MOU", KONTA_MOY_EMAIL_COMPANY.descriptor],
        legalName: KONTA_MOY_EMAIL_COMPANY.legalName,
        url: origin,
        description: LOCAL_COMMERCE_DESCRIPTION,
        email: KONTA_MOY_EMAIL_COMPANY.email,
        telephone: `+30${KONTA_MOY_EMAIL_COMPANY.phone}`,
        taxID: KONTA_MOY_EMAIL_COMPANY.taxNumber,
        identifier: {
          "@type": "PropertyValue",
          name: "ΓΕΜΗ",
          value: KONTA_MOY_EMAIL_COMPANY.gemiNumber
        },
        logo: {
          "@type": "ImageObject",
          url: `${origin}/brand/kontamou-sparta-logo.webp`
        },
        address: KONTA_MOY_EMAIL_COMPANY.address,
        areaServed: [
          { "@type": "City", name: "Σπάρτη" },
          { "@type": "AdministrativeArea", name: "Λακωνία" },
          { "@type": "Country", name: "Ελλάδα" }
        ],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer service",
          email: KONTA_MOY_EMAIL_COMPANY.email,
          telephone: `+30${KONTA_MOY_EMAIL_COMPANY.phone}`,
          availableLanguage: ["el"]
        }
      },
      {
        "@type": "Service",
        "@id": serviceId,
        name: "ΚΟΝΤΑ ΜΟΥ · Υποδομή τοπικού εμπορίου",
        alternateName: "KONTA MOU local-commerce platform",
        serviceType: "Local-commerce marketplace and merchant e-commerce infrastructure",
        description: LOCAL_COMMERCE_DESCRIPTION,
        url: `${origin}/about`,
        provider: { "@id": organizationId },
        areaServed: [
          { "@type": "City", name: "Σπάρτη" },
          { "@type": "AdministrativeArea", name: "Λακωνία" },
          { "@type": "Country", name: "Ελλάδα" }
        ],
        audience: [
          { "@type": "Audience", audienceType: "Πελάτες που θέλουν να αγοράζουν από τοπικά καταστήματα" },
          { "@type": "BusinessAudience", audienceType: "Μικρές και μεσαίες τοπικές επιχειρήσεις λιανικής" }
        ]
      }
    ]
  };

  return <html lang="el" className={comfortaa.variable}>
    <head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(rootStructuredData).replaceAll("<", "\\u003c") }}
      />
    </head>
    <body>
      <PrivacyConsentProvider><CartProvider><CustomerMobileCommerceProvider>{children}</CustomerMobileCommerceProvider></CartProvider></PrivacyConsentProvider>
      <AccessibilityPreferences />
      <SiteUtilityLauncher />
      <SpeedInsights />
    </body>
  </html>;
}