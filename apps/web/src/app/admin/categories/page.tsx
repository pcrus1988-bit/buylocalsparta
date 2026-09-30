import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Categories & Policies",
  robots: { index: false, follow: false }
};

export default function Page() {
  redirect("/admin/products?view=categories");
}
