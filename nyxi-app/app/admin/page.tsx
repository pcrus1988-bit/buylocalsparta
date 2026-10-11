import { notFound } from "next/navigation";
export const metadata = { title: "NYXI Reviewer", robots: { index: false, follow: false } };
// Fail closed until Agent 4 verifies reviewer identity, permissions and audit trail.
export default function ReviewerPage() { notFound(); }
