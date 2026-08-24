import type { Metadata } from "next";
import { DailySandwichMenu } from "../../components/DailySandwichMenu";

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
  return <><DailySandwichMenu />{children}</>;
}
