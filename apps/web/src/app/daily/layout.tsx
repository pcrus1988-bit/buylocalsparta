import type { Metadata } from "next";
import { DailySandwichMenu } from "../../components/DailySandwichMenu";
import { ScopedPwaInstallClient } from "../../components/ScopedPwaInstallClient";

export const metadata: Metadata = {
  applicationName: "KONTA MOY Daily",
  manifest: "/daily/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KONTA MOY Daily",
    statusBarStyle: "default"
  },
  formatDetection: { telephone: false }
};

export default function DailyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    <DailySandwichMenu />
    {children}
    <ScopedPwaInstallClient appName="Daily" serviceWorkerPath="/daily-sw.js" scope="/daily/" placement="daily" />
  </>;
}
