import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" }
};

export default function TermsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
