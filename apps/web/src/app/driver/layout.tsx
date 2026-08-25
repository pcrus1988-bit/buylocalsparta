import type { Metadata } from "next";
import { ScopedPwaInstallClient } from "../../components/ScopedPwaInstallClient";

export const metadata: Metadata = {
  applicationName: "KONTA MOY Driver",
  manifest: "/driver/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KONTA MOY Driver",
    statusBarStyle: "default"
  },
  formatDetection: { telephone: false }
};

export default function DriverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    {children}
    <ScopedPwaInstallClient appName="Driver" serviceWorkerPath="/driver-sw.js" scope="/driver/" />
  </>;
}
