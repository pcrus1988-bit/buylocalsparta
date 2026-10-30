import type { Metadata } from "next";
import Link from "next/link";
import { ResearchPublicNavigation } from "../../../../components/ResearchPublicNavigation";
import { SiteFooter } from "../../../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../../../lib/seo-metadata";
import { getPublishedGreekRetailResults } from "../../../../lib/research-survey-release";
import { publicResultPoints } from "../../../../lib/research-public-results-data";
import { PRESS_KIT_RESULTS, PRESS_KIT_STUDY, pressKitHighlights } from "../../../../lib/research-press-kit";
import styles from "./PressKit.module.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/greek-retail-2026/press", {
    title: "Γραφείο Τύπου & Media Kit | Ελληνικό Λιανεμπόριο 2026 · KONTA MOY",
    description: "Δελτίο Τύπου, βασικά ευρήματα με την πηγή και τη βάση απαντήσεων, γραφήματα, μεθοδολογία και υλικό προς δημοσίευση για την έρευνα Ελληνικό Λιανεμπόριο 2026.",
    keywords: ["KONTA MOY press kit", "Ελληνικό Λιανεμπόριο 2026 δελτίο τύπου", "υλικό για ΜΜΕ", "έρευνα λιανεμπορίου 2026"]
  });
}

const storyAngles = [
  {
    number: "01", topic: "ΟΙΚΟΝΟΜΙΑ",
    title: "Πόσο κοστίζει τελικά να κρατάς ανοιχτό ένα κατάστημα;",
    explanation: "Η άνοδος του λειτουργικού κόστους και η πορεία της κερδοφορίας ως δύο ξεχωριστοί δείκτες. Όχι αυθαίρετη αιτιώδης σύνδεση.",
    href: PRESS_KIT_RESULTS + "#research-workbench"
  },
  {
    number: "02", topic: "ΨΗΦΙΑΚΗ ΜΕΤΑΒΑΣΗ",
    title: "Ψηφιακή στην εφορία. Είναι ψηφιακή και στην αποθήκη;",
    explanation: "Μια σύγκριση των δηλωμένων ψηφιακών εργαλείων. Η διαφορά μεταξύ υποχρεωτικής συμμόρφωσης και καθημερινής οργάνωσης.",
    href: PRESS_KIT_RESULTS + "#research-workbench"
  },
  {
    number: "03", topic: "ΤΟΠΙΚΗ ΑΓΟΡΑ",
    title: "Ο πελάτης αλλάζει. Το μικρό κατάστημα πώς τον βρίσκει;",
    explanation: "Η σημασία των συστάσεων, της φυσικής επισκεψιμότητας και των online καναλιών στην προσέλκυση πελατών.",
    href: PRESS_KIT_RESULTS + "#research-workbench"
  },
  {
    number: "04", topic: "ΜΕΛΛΟΝ",
    title: "Επένδυση ή αναβολή; Οι αποφάσεις πίσω από τη βιτρίνα.",
    explanation: "Προοπτικές, διαθέσιμη χρηματοδότηση και δηλωμένες προθέσεις. Οι προθέσεις δεν είναι πραγματοποιημένες επενδύσεις.",
    href: PRESS_KIT_RESULTS + "#research-workbench"
  }
] as const;

const resources = [
  { number: "03", group: "ΕΡΕΥΝΑ", title: "Διαδραστικά αποτελέσματα", summary: "Διαγράμματα, νομοί και οι δημοσιευμένοι δείκτες με τις βάσεις τους.", href: PRESS_KIT_RESULTS, label: "Άνοιγμα αποτελεσμάτων" },
  { number: "04", group: "ΕΡΕΥΝΑ", title: "Πλήρης μεθοδολογία", summary: "Δείγμα, επιλογή επιχειρήσεων, έλεγχοι ποιότητας, στάθμιση και περιορισμοί.", href: PRESS_KIT_STUDY + "/methodology", label: "Διαβάστε τη μεθοδολογία" },
  { number: "05", group: "ΟΠΤΙΚΟ ΥΛΙΚΟ", title: "Επίσημο λογότυπο KONTA MOY", summary: "Αρχείο SVG του επίσημου λογοτύπου για δημοσιογραφική αναφορά.", href: "/brand/kontamou-logo.svg", label: "Λήψη λογοτύπου" },
  { number: "06", group: "ΑΝΘΡΩΠΟΙ", title: "Η φωνή της Ελλάδας", summary: "Μόνο εγκεκριμένα, ανωνυμοποιημένα αποσπάσματα από την ανοικτή ερώτηση.", href: "/api/research/greek-retail-2026/voices-export", label: "Λήψη εγκεκριμένων απαντήσεων · PDF" }
] as const;

export default async function ResearchPressKitPage() {
  let published: Awaited<ReturnType<typeof getPublishedGreekRetailResults>>;
  try {
    published = await getPublishedGreekRetailResults("greek-retail-2026");
  } catch (error) {
    console.error("research_press_kit_release_unavailable", error instanceof Error ? error.name : "UnknownError");
  }
  const highlights = published ? pressKitHighlights(publicResultPoints(published.estimates)) : [];
  const lead = highlights.find(item => item.key === "business_financial_trends_12m.operating_costs.share.increased") ?? highlights[0];
  const publishedLabel = published ? new Date(published.publishedAt).toLocaleDateString("el-GR", {
    timeZone: "Europe/Athens", day: "numeric", month: "long", year: "numeric"
  }) : undefined;

  return <main className={styles.shell}>
    <div className={styles.container}>
      <ResearchPublicNavigation active="press" studySlug="greek-retail-2026" />
      <div className={styles.kicker}><span className={styles.pulse} aria-hidden="true" /> KONTA MOY RESEARCH / MEDIA CENTRE <span>Ελληνικό Λιανεμπόριο 2026</span></div>
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>ΤΟ ΓΡΑΦΕΙΟ ΤΥΠΟΥ · ΕΛΕΥΘΕΡΟ ΥΛΙΚΟ ΓΙΑ ΜΜΕ</span>
          <h1>Η αγορά έχει <em>μια ιστορία</em> να πει.</h1>
          <p className={styles.lead}>Τα στοιχεία, οι άνθρωποι και το πλαίσιο πίσω από την έρευνα «Ελληνικό Λιανεμπόριο 2026» — σε έναν χώρο σχεδιασμένο για δημοσιογράφους και συντάκτες.</p>
          <div className={styles.ctas}>
            {published ? <a className={styles.primary} href="/research/greek-retail-2026/press/press-release.pdf">Λήψη Δελτίου Τύπου (PDF) <span aria-hidden="true">↗</span></a> : null}
            <a className={styles.secondary} href="#downloads">Όλο το υλικό <span aria-hidden="true">↓</span></a>
          </div>
          <p className={styles.sourceNote}>{published ? "Δημοσιευμένη μελέτη · " + publishedLabel : "Τα επιβεβαιωμένα αρχεία της δημοσίευσης δεν είναι προσωρινά διαθέσιμα."} · <Link href={PRESS_KIT_RESULTS}>Πηγή δεδομένων</Link></p>
        </div>
        <div className={styles.cover}>
          <span className={styles.coverTop}>ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ / 2026</span>
          <span className={styles.coverRule} />
          <strong>Ψηφιακή επανάσταση<br />στα χαρτιά.<br /><em>Αγώνας επιβίωσης</em><br />πίσω από τις βιτρίνες.</strong>
          <span className={styles.coverBottom}>PRESS / FEATURE STORY <span>01 — 26</span></span>
        </div>
      </header>

      <nav className={styles.inPageNav} aria-label="Ενότητες γραφείου Τύπου">
        <a href="#numbers">Οι αριθμοί</a><a href="#stories">Ιδέες για ρεπορτάζ</a><a href="#downloads">Λήψεις</a><a href="#about">Σχετικά</a><a href="#contact">Επικοινωνία</a>
      </nav>

      <section id="numbers" className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>01 / QUICK FACTS</span><h2>Οι αριθμοί που αξίζουν την προσοχή.</h2></div>
          <p>Μόνο ελεγμένα, δημοσιευμένα εθνικά ευρήματα. Κάθε ποσοστό συνοδεύεται από τη δική του βάση απαντήσεων.</p>
        </div>
        {published && highlights.length ? <div className={styles.numbers}>
          {highlights.slice(0, 6).map(item => <article className={styles.numberCard} key={item.key}>
            <strong>{item.formatted}</strong><h3>{item.title}</h3><p>{item.insight}</p>
            <span>Βάση: n={item.n.toLocaleString("el-GR")} · {item.question}</span>
          </article>)}
        </div> : <div className={styles.notice}>Τα επαληθευμένα δημοσιευμένα ποσοστά δεν είναι διαθέσιμα αυτή τη στιγμή. Δεν εμφανίζουμε πρόχειρα ή δοκιμαστικά στοιχεία. <Link href={PRESS_KIT_RESULTS}>Δείτε την κατάσταση της μελέτης.</Link></div>}
        <p className={styles.caveat}>Τα ποσοστά προέρχονται από απαντήσεις συμμετεχουσών επιχειρήσεων, όχι από απογραφή ή αποδεδειγμένα αντιπροσωπευτικό δείγμα όλων των ελληνικών καταστημάτων. Ερωτήσεις πολλαπλών επιλογών μπορεί να υπερβαίνουν συνολικά το 100%. <Link href={PRESS_KIT_STUDY + "/methodology"}>Μεθοδολογική τεκμηρίωση →</Link></p>
      </section>

      <section id="stories" className={[styles.section, styles.storiesSection].join(" ")}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>02 / STORY ANGLES</span><h2>Τέσσερις ιστορίες που μπορούν να ανοίξουν τη συζήτηση.</h2></div>
          <p>Προτεινόμενες δημοσιογραφικές γωνίες, όχι επιπλέον αποτελέσματα της μελέτης.</p>
        </div>
        <div className={styles.storyGrid}>
          {storyAngles.map(story => <article className={styles.story} key={story.number}>
            <div className={styles.storyMeta}><span>{story.number}</span><span>{story.topic}</span></div>
            <h3>{story.title}</h3><p>{story.explanation}</p>
            <Link href={story.href}>Τεκμηρίωση & στοιχεία <span aria-hidden="true">↗</span></Link>
          </article>)}
        </div>
      </section>

      <section id="downloads" className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>03 / DOWNLOAD CENTRE</span><h2>Όλα όσα χρειάζονται, χωρίς αναμονή.</h2></div>
          <p>Αρχεία και επίσημες πηγές για άμεση χρήση σε άρθρα, εκπομπές και παρουσιάσεις.</p>
        </div>
        <div className={styles.downloads}>
          <div className={styles.downloadItem}>
            <span className={styles.downloadIndex}>01</span><div><span className={styles.resourceType}>ΔΕΛΤΙΟ ΤΥΠΟΥ</span><h3>Επίσημο Δελτίο Τύπου</h3><p>Δημοσιογραφική σύνοψη της έρευνας, με ποσοστά και πραγματικές βάσεις.</p></div>
            {published ? <a href="/research/greek-retail-2026/press/press-release.pdf">Λήψη PDF ↓</a> : <span className={styles.disabledLink}>Μη διαθέσιμο</span>}
          </div>
          <div className={styles.downloadItem}>
            <span className={styles.downloadIndex}>02</span><div><span className={styles.resourceType}>ΔΕΔΟΜΕΝΑ</span><h3>Βασικοί δείκτες · CSV</h3><p>Εθνικά αποτελέσματα για χρήση σε πίνακες, διαγράμματα και γραφήματα. Με n και πηγή.</p></div>
            {published && highlights.length ? <a href="/research/greek-retail-2026/press/facts.csv">Λήψη CSV ↓</a> : <span className={styles.disabledLink}>Μη διαθέσιμο</span>}
          </div>
          {resources.map(resource => <div className={styles.downloadItem} key={resource.number}>
            <span className={styles.downloadIndex}>{resource.number}</span><div><span className={styles.resourceType}>{resource.group}</span><h3>{resource.title}</h3><p>{resource.summary}</p></div>
            <a href={resource.href} download={resource.href.endsWith(".svg") ? "kontamou-logo.svg" : undefined}>{resource.label} <span aria-hidden="true">↗</span></a>
          </div>)}
        </div>
      </section>

      <section id="about" className={styles.aboutSection}>
        <div><span className={styles.eyebrow}>04 / ABOUT</span><h2>Μια έρευνα για την αγορά που λειτουργεί κάθε μέρα.</h2></div>
        <div><p>Το KONTA MOY, πρωτοβουλία της SP BUSINESS LAB, αναπτύσσει ψηφιακές υπηρεσίες για την τοπική αγορά. Η έρευνα «Ελληνικό Λιανεμπόριο 2026» καταγράφει τις απόψεις των συμμετεχουσών επιχειρήσεων για το κόστος, την οργάνωση, τα ψηφιακά εργαλεία και την επόμενη ημέρα.</p>
          <p>Η παρουσίαση των ευρημάτων διαχωρίζεται από τις εμπορικές υπηρεσίες του KONTA MOY. Η περιγραφή του δείγματος, οι εξαιρέσεις και τα όρια γενίκευσης είναι δημόσια διαθέσιμα.</p>
          <Link href="/about">Περισσότερα για το KONTA MOY ↗</Link>
        </div>
      </section>

      <section id="contact" className={styles.contact}>
        <span className={styles.eyebrow}>05 / PRESS CONTACT</span>
        <h2>Θέλετε να συνεχίσετε την ιστορία;</h2>
        <p>Για επιπλέον στοιχεία, διευκρινίσεις, δημοσιογραφικές ερωτήσεις ή συνέντευξη, επικοινωνήστε με το γραφείο έρευνας.</p>
        <a href="mailto:research@kontamou.site?subject=Press%20enquiry%20-%20Greek%20Retail%202026">research@kontamou.site <span aria-hidden="true">↗</span></a>
      </section>
      <div className={styles.credit}>Προτεινόμενη αναφορά: «Πηγή: KONTA MOY Research, Ελληνικό Λιανεμπόριο 2026». Τα γραφήματα και τα αποσπάσματα χρειάζονται σαφή απόδοση πηγής. <Link href="/research/privacy">Πολιτική ιδιωτικότητας</Link>.</div>
    </div>
    <SiteFooter />
  </main>;
}
