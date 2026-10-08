import Link from "next/link";
import { ResearchSurveyForm } from "./ResearchSurveyForm";
import type { ResearchSurveyContext } from "../lib/research-survey-runtime";
import styles from "./ResearchSurveyPage.module.css";

/** Reuses the exact participant page structure and question controls, with writes disabled. */
export function ResearchSurveySimulationView({ context, returnHref }: {
  context: ResearchSurveyContext;
  returnHref: string;
}) {
  return <div className={styles.shell}>
    <div style={{
      maxWidth: 920, margin: "0 auto 18px", border: "1px solid #e4c666",
      borderRadius: 16, padding: "14px 18px", background: "#fff3cd",
      color: "#554000", display: "flex", gap: 12, flexWrap: "wrap",
      justifyContent: "space-between", alignItems: "center"
    }} role="status">
      <span><strong>ΠΡΟΕΠΙΣΚΟΠΗΣΗ · ΜΟΝΟ ΔΟΚΙΜΗ</strong>
        <span style={{ display: "block", fontSize: 13 }}>
          Πραγματικές ερωτήσεις της έκδοσης {context.instrument.version}. Καμία απάντηση, συγκατάθεση ή email δεν αποθηκεύεται.
        </span>
      </span>
      <Link href={returnHref} style={{ fontWeight: 800, color: "#554000", textDecoration: "underline" }}>
        Επιστροφή στη διαχείριση
      </Link>
    </div>
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · RESEARCH</div>
      <span>Πρόσκληση συμμετοχής · ΠΡΟΕΠΙΣΚΟΠΗΣΗ</span>
      <h1>{context.study.title}</h1>
      {context.study.subtitle && <p>{context.study.subtitle}</p>}
      <div className={styles.meta}>
        <span>Ερευνητικός φορέας: {context.study.sponsor}</span>
        <a href={"/research/" + encodeURIComponent(context.study.slug) + "/methodology"}
           target="_blank" rel="noreferrer">Μεθοδολογία &amp; διαφάνεια</a>
      </div>
      <div className={styles.trust}>
        <span>Προαιρετική συμμετοχή</span>
        <span>Προστασία προσωπικών δεδομένων</span>
        <span>Οι απαντήσεις κλειδώνουν μετά την ολοκλήρωση</span>
      </div>
    </header>
    <ResearchSurveyForm
      key={context.study.slug + "-" + context.instrument.version}
      slug={context.study.slug}
      token="simulation-no-live-invite"
      initial={context}
      previewMode
    />
  </div>;
}
