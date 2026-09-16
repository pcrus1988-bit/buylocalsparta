import type { Metadata } from "next";
import { OperationalFullscreenShell } from "../../components/OperationalFullscreenShell";
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
  return <OperationalFullscreenShell background="#f2f1ec">
    {children}
    <ScopedPwaInstallClient appName="Driver" serviceWorkerPath="/driver-sw.js" scope="/driver" />
  </OperationalFullscreenShell>;
}
