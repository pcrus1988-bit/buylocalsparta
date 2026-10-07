import Link from "next/link";

export type ResearchSurveyAdminSection =
  | "overview"
  | "sampling"
  | "fieldwork"
  | "balance"
  | "contacts"
  | "invitations"
  | "kad"
  | "consent"
  | "delivery"
  | "quality"
  | "protocol"
  | "lifecycle"
  | "evidence";

export const RESEARCH_SURVEY_ADMIN_SECTIONS: ReadonlyArray<Readonly<{
  key: ResearchSurveyAdminSection;
  label: string;
  description: string;
}>> = [
  { key: "overview", label: "Overview", description: "Live survey state and key metrics." },
  { key: "sampling", label: "Sampling", description: "Population frame and reproducible sample draws." },
  { key: "fieldwork", label: "Email & fieldwork", description: "Templates, invitation batches, reminders and fieldwork actions." },
  { key: "balance", label: "Fieldwork balance", description: "Response balance across the frozen sampling strata." },
  { key: "contacts", label: "Email contacts", description: "Current contactable research frame and suppression state." },
  { key: "invitations", label: "Invitations", description: "Invitation lifecycle, expiry and response state." },
  { key: "kad", label: "ΚΑΔ", description: "Research-frame composition by canonical activity group." },
  { key: "consent", label: "Consent", description: "Current participant consent choices." },
  { key: "delivery", label: "Delivery", description: "SES delivery delays and deliverability exceptions." },
  { key: "quality", label: "Quality", description: "Manual response-quality review queue." },
  { key: "protocol", label: "Protocol", description: "Deviations, amendments and corrective evidence." },
  { key: "lifecycle", label: "Lifecycle & publication", description: "Controlled study transitions and publication state." },
  { key: "evidence", label: "Evidence", description: "Reconstructable frame-to-release evidence chain." }
];

export function ResearchSurveyAdminNav({
  slug,
  current
}: {
  slug: string;
  current: ResearchSurveyAdminSection;
}) {
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  return <section className="shell vendor-section">
    <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
      <Link className="button button-secondary" href="/admin/research/surveys">All surveys</Link>
      {RESEARCH_SURVEY_ADMIN_SECTIONS.map((item) => {
        const href = item.key === "overview" ? root : root + "/" + item.key;
        return <Link
          aria-current={current === item.key ? "page" : undefined}
          className={current === item.key ? "button" : "button button-secondary"}
          href={href}
          key={item.key}
        >
          {item.label}
        </Link>;
      })}
    </div>
  </section>;
}
