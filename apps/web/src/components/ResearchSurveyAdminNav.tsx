import Link from "next/link";

export type ResearchSurveyAdminSection =
  | "overview"
  | "settings"
  | "questions"
  | "evaluation"
  | "sampling"
  | "fieldwork"
  | "balance"
  | "contacts"
  | "invitations"
  | "simulation"
  | "kad"
  | "consent"
  | "delivery"
  | "quality"
  | "protocol"
  | "lifecycle"
  | "evidence";

export type ResearchSurveyAdminGroup = "design" | "fieldwork" | "governance";

export const RESEARCH_SURVEY_ADMIN_SECTIONS: ReadonlyArray<Readonly<{
  key: ResearchSurveyAdminSection;
  label: string;
  description: string;
  group: ResearchSurveyAdminGroup;
}>> = [
  { key: "overview", label: "Overview", description: "Live survey state, readiness and key metrics.", group: "design" },
  { key: "settings", label: "Survey settings", description: "Title, population, methodology, language, deadline and public results destination.", group: "design" },
  { key: "questions", label: "Questions", description: "Questionnaire structure, wording, answer options, order and analysis keys.", group: "design" },
  { key: "evaluation", label: "Evaluation & analysis", description: "Preregistered evaluation plus versioned later exploratory analyses.", group: "design" },
  { key: "sampling", label: "Sampling", description: "Population frame and reproducible sample draws.", group: "fieldwork" },
  { key: "fieldwork", label: "Email & fieldwork", description: "Templates, invitation batches, reminders and fieldwork actions.", group: "fieldwork" },
  { key: "balance", label: "Fieldwork balance", description: "Response balance across the frozen sampling strata.", group: "fieldwork" },
  { key: "contacts", label: "Email contacts", description: "Current contactable research frame and suppression state.", group: "fieldwork" },
  { key: "invitations", label: "Invitations", description: "Invitation lifecycle, expiry and response state.", group: "fieldwork" },
  { key: "simulation", label: "Workflow simulation", description: "Test inbox, invitation link, submission, and Admin notification without actual Research records.", group: "fieldwork" },
  { key: "kad", label: "ΚΑΔ", description: "Research-frame composition by canonical activity group.", group: "fieldwork" },
  { key: "consent", label: "Consent", description: "Current participant consent choices.", group: "fieldwork" },
  { key: "delivery", label: "Delivery", description: "SES delivery delays and deliverability exceptions.", group: "fieldwork" },
  { key: "quality", label: "Quality", description: "Manual response-quality review queue.", group: "governance" },
  { key: "protocol", label: "Protocol", description: "Deviations, amendments and corrective evidence.", group: "governance" },
  { key: "lifecycle", label: "Lifecycle & publication", description: "Controlled study transitions and publication state.", group: "governance" },
  { key: "evidence", label: "Evidence", description: "Reconstructable frame-to-release evidence chain.", group: "governance" }
];

const GROUPS: ReadonlyArray<Readonly<{
  key: ResearchSurveyAdminGroup;
  label: string;
  description: string;
}>> = [
  { key: "design", label: "Survey design", description: "Settings, questionnaire and evaluation plan for this survey only." },
  { key: "fieldwork", label: "Fieldwork", description: "Sample, contacts, invitations and delivery for this survey only." },
  { key: "governance", label: "Governance & publication", description: "Quality, protocol, lifecycle and evidence for this survey only." }
];

export function ResearchSurveyAdminNav({
  slug,
  current
}: {
  slug: string;
  current: ResearchSurveyAdminSection;
}) {
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);

  return <section className="shell vendor-section" aria-label="Survey workspace navigation">
    <div className="workspace-action-bar" style={{ alignItems: "flex-start", gap: 16 }}>
      <span>
        <strong>Survey workspace</strong><br />
        Everything below applies only to this survey. Global Research configuration is kept separately.
      </span>
      <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
        <Link prefetch={false} className="button button-secondary" href="/admin/research/surveys">All surveys</Link>
        <Link prefetch={false} className="button" href={root + "/workflow?phase=pilot"}>Guided Pilot</Link>
        <Link prefetch={false} className="button button-secondary" href={root + "/workflow?phase=main"}>Guided main study</Link>
        <Link prefetch={false} className="button button-secondary" href={root + "/simulation"}>Run simulation</Link>
        <Link prefetch={false} className="button button-secondary" href="/admin/research/handbook">Admin handbook</Link>
        <Link prefetch={false} className="button button-secondary" href="/admin/research/settings">Global Research settings</Link>
      </div>
    </div>

    <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
      {GROUPS.map((group) => <div className="workspace-queue-card" key={group.key}>
        <div style={{ marginBottom: 10 }}>
          <strong>{group.label}</strong><br />
          <small>{group.description}</small>
        </div>
        <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
          {RESEARCH_SURVEY_ADMIN_SECTIONS.filter((item) => item.group === group.key).map((item) => {
            const href = item.key === "overview" ? root : root + "/" + item.key;
            return <Link prefetch={false}
              aria-current={current === item.key ? "page" : undefined}
              className={current === item.key ? "button" : "button button-secondary"}
              href={href}
              key={item.key}
              title={item.description}
            >
              {item.label}
            </Link>;
          })}
        </div>
      </div>)}
    </div>
  </section>;
}
