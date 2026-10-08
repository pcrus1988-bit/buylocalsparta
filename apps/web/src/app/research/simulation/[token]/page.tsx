import type { Metadata } from "next";
import Link from "next/link";
import { ResearchSimulationParticipant } from "../../../../components/ResearchSimulationParticipant";
import { readSimulationToken } from "../../../../lib/research-workflow-simulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Δοκιμή ροής έρευνας · KONTA MOY",
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
  referrer: "no-referrer"
};

export default async function ResearchSimulationLinkPage({ params }: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let invitation;
  try {
    invitation = readSimulationToken(token, "invitation");
  } catch {
    return <main className="vendor-app" style={{ padding: "40px 16px" }}>
      <div className="shell vendor-section" style={{ maxWidth: 760, margin: "0 auto" }}>
        <div className="eyebrow">KONTA MOY · TEST ONLY</div>
        <h1>Ο δοκιμαστικός σύνδεσμος δεν είναι πλέον διαθέσιμος.</h1>
        <p>Η πρόσκληση έληξε ή ο σύνδεσμος δεν είναι έγκυρος. Δημιουργήστε νέο τεστ από τη διαχείριση.</p>
        <Link href="/research">Παρατηρητήριο Ελληνικού Λιανεμπορίου</Link>
      </div>
    </main>;
  }
  return <main className="vendor-app" style={{ padding: "40px 16px" }}>
    <ResearchSimulationParticipant
      slug={invitation.slug}
      token={token}
      expiresAt={invitation.expiresAt}
    />
  </main>;
}
