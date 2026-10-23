import type { Metadata } from "next";
import FinishMagicLink from "./finish-magic-link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ολοκλήρωση σύνδεσης",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// No server-side rendering of fragment credentials; the browser holds them
// only until the client immediately scrubs its own address bar.
export default function FinishPage() {
  return <FinishMagicLink />;
}
