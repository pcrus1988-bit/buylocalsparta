import type { Metadata } from "next";
import "../admin-operational-ux.css";
import "../admin-operational-dashboard.css";
import "../admin-seo-operational.css";
import { ScopedPwaInstallClient } from "../../components/ScopedPwaInstallClient";

export const metadata: Metadata = {
  applicationName: "KONTA MOY Admin",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KONTA MOY Admin",
    statusBarStyle: "default"
  },
  formatDetection: { telephone: false }
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    {children}
    <ScopedPwaInstallClient appName="Admin" serviceWorkerPath="/admin-sw.js" scope="/admin" />
  </>;
}
