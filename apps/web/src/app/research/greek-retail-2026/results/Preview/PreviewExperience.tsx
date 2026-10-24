"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./Preview.module.css";
import { ResearchResultsWorkbench } from "../ResearchResultsWorkbench";
import { GREECE_REGIONS } from "../../../../../lib/research-geographic-core";

type Metric = Readonly<{ label: string; value: string; detail: string }>;
type Bar = Readonly<{ label: string; value: number }>;
type Relationship = Readonly<{
  title: string;
  source: string;
  a: string;
  b: string;
  aValue: number;
  bValue: number;
  aN: number;
  bN: number;
  note: string;
}>;
type Chapter = Readonly<{
  number: string;
  short: string;
  title: string;
  heading: string;
  description: string;
  questions: string;
  focus: string;
  metrics: readonly Metric[];
  bars: readonly Bar[];
  barsTitle: string;
  relationships: readonly Relationship[];
  scientific: string;
  limitations: string;
}>;

/**
 * All chart values below are DESIGN FIXTURES and are NOT derived from survey
 * responses. This page intentionally makes no DB request and never exposes
 * the private EXP01 marketplace-choice experiment.
 */
const CHAPTERS: readonly Chapter[] = [
  {
    number: "01", short: "Οικονομία", title: "Οικονομικές πιέσεις και βιωσιμότητα",
    heading: "Το κόστος ανεβαίνει. Τι συμβαίνει με την κερδοφορία;",
    description: "Πώς συνδέονται τα λειτουργικά έξοδα, ο τζίρος και η αντιλαμβανόμενη οικονομική αντοχή των επιχειρήσεων.",
    questions: "Q02 · Q21 · Q27",
    focus: "Κόστος, κερδοφορία, βιωσιμότητα",
    metrics: [
      {label:"Αναφέρουν αύξηση λειτουργικού κόστους",value:"72,4%",detail:"Ενδεικτικό n=800 · 95% ΔΕ 69,2–75,6%"},
      {label:"Αναφέρουν μείωση κερδοφορίας",value:"58,1%",detail:"Ενδεικτικό n=793 · 95% ΔΕ 54,5–61,7%"},
      {label:"Αύξηση τζίρου αλλά πτώση κερδών",value:"21,6%",detail:"Ενδεικτικό n=762 · 95% ΔΕ 18,7–24,5%"}
    ],
    barsTitle: "Ενδεικτική κατάταξη οικονομικών πιέσεων",
    bars: [
      {label:"Ανατιμήσεις προμηθευτών",value:72},
      {label:"Μειωμένη αγοραστική δύναμη",value:67},
      {label:"Φορολογική επιβάρυνση",value:57},
      {label:"Ενέργεια",value:46}
    ],
    relationships: [
      {title:"Λειτουργικό κόστος × Κερδοφορία",source:"Q21 × Q21",a:"Αυξημένο κόστος",b:"Σταθερό ή χαμηλότερο κόστος",aValue:64.2,bValue:40.1,aN:570,bN:223,
        note:"Η διαφορά περιγράφει συσχέτιση δύο αυτοαναφερόμενων μεταβολών. Δεν αποδεικνύει ότι το κόστος προκάλεσε τη μεταβολή της κερδοφορίας."},
      {title:"Μέγεθος επιχείρησης × Κερδοφορία",source:"Q02 × Q21",a:"1 εργαζόμενος",b:"5 ή περισσότεροι",aValue:65.4,bValue:43.7,aN:280,bN:198,
        note:"Η σύγκριση πρέπει να συνεκτιμά κλάδο, γεωγραφική σύνθεση και μη απόκριση. Δεν ερμηνεύεται ως αιτιώδες αποτέλεσμα του μεγέθους."}
    ],
    scientific:"Στο υποθετικό παράδειγμα, η συνύπαρξη αυξημένου λειτουργικού κόστους και υποχώρησης κερδοφορίας θα μπορούσε να υποδεικνύει συμπίεση περιθωρίων. Για έγκυρο συμπέρασμα απαιτείται εξέταση της ακριβούς βάσης υπολογισμού, της στάθμισης και των παραγόντων που επηρεάζουν ταυτόχρονα τις δύο απαντήσεις.",
    limitations:"Τα στοιχεία αφορούν αναφερόμενες κατευθύνσεις μεταβολών, όχι πραγματικά λογιστικά ποσά ή μέτρηση καθαρού περιθωρίου κέρδους."
  },
  {
    number:"02",short:"Ψηφιακή μετάβαση",title:"Ψηφιακή ετοιμότητα και ηλεκτρονικό εμπόριο",
    heading:"Πόσο ψηφιακό είναι σήμερα το ελληνικό λιανεμπόριο;",
    description:"Δυνατότητες ηλεκτρονικών πωλήσεων, εργαλεία καταλόγου, συγχρονισμός αποθέματος και εμπόδια ψηφιοποίησης.",
    questions:"Q03 · Q04 · Q05 · Q06 · Q22 · Q24",
    focus:"Ψηφιακές δυνατότητες και online εμπόριο",
    metrics:[
      {label:"Δείκτης ψηφιακής ετοιμότητας",value:"54,8/100",detail:"Ενδεικτικό n=804 · 95% ΔΕ 52,0–57,6"},
      {label:"Διαθέτουν δικό τους e-shop",value:"38,6%",detail:"Ενδεικτικό n=811 · 95% ΔΕ 35,2–42,0%"},
      {label:"Δεν έχουν online πωλήσεις",value:"44,9%",detail:"Ενδεικτικό n=805 · 95% ΔΕ 41,4–48,4%"}
    ],
    barsTitle:"Ενδεικτική διαθεσιμότητα ψηφιακών εργαλείων",
    bars:[
      {label:"Ψηφιακός κατάλογος",value:64},
      {label:"Online πληρωμές",value:47},
      {label:"Διαχείριση αποθέματος",value:39},
      {label:"Συγχρονισμός σε πραγματικό χρόνο",value:23}
    ],
    relationships:[
      {title:"Ψηφιακός κατάλογος × Προσδοκία ανάπτυξης",source:"Q05 × Q17",a:"Πλήρης ψηφιακός κατάλογος",b:"Χωρίς ψηφιακό κατάλογο",aValue:52.1,bValue:33.2,aN:312,bN:254,
        note:"Οι πιο ανεπτυγμένες επιχειρήσεις μπορεί να διαθέτουν περισσότερους πόρους ή να ανήκουν σε διαφορετικούς κλάδους."},
      {title:"E-shop × Προσδοκία αύξησης πωλήσεων",source:"Q03 × Q17",a:"Με δικό τους e-shop",b:"Χωρίς δικό τους e-shop",aValue:55.8,bValue:36.7,aN:325,bN:440,
        note:"Η σχέση είναι περιγραφική. Δεν αποδεικνύει ότι η δημιουργία e-shop προκαλεί αισιοδοξία ή ανάπτυξη."}
    ],
    scientific:"Στο υποθετικό παράδειγμα, οι επιχειρήσεις με ισχυρότερες ψηφιακές δυνατότητες εμφανίζουν συχνότερα θετικές προσδοκίες. Η διαφορά χρειάζεται έλεγχο ως προς το μέγεθος, τον κλάδο και τη γεωγραφία πριν θεωρηθεί γενικεύσιμη.",
    limitations:"Ο δείκτης αποτελεί σύνθετη βαθμολογία από τις δηλωμένες λειτουργικές δυνατότητες και δεν είναι μέτρο τεχνολογικής παραγωγικότητας."
  },
  {
    number:"03",short:"Πελάτες",title:"Πελάτες και τοπική αγορά",
    heading:"Η τοπική σχέση παραμένει καθοριστική;",
    description:"Ανακάλυψη προϊόντων, απόκτηση νέων πελατών, τοπική εξάρτηση και η σχέση μεταξύ online παρουσίας και φυσικού καταστήματος.",
    questions:"Q09 · Q10 · Q11 · Q12 · Q25 · Q26",
    focus:"Τοπική αγορά και πελατειακές σχέσεις",
    metrics:[
      {label:"Κυρίως τοπική πελατεία",value:"63,7%",detail:"Ενδεικτικό n=798 · 95% ΔΕ 60,3–67,1%"},
      {label:"Εξάρτηση από συστάσεις πελατών",value:"71,2%",detail:"Ενδεικτικό n=807 · 95% ΔΕ 68,1–74,3%"},
      {label:"Αναφέρουν ενίσχυση του φυσικού καταστήματος",value:"39,4%",detail:"Ενδεικτικό n=614 · 95% ΔΕ 35,5–43,3%"}
    ],
    barsTitle:"Ενδεικτικές πηγές απόκτησης πελατών",
    bars:[
      {label:"Από στόμα σε στόμα",value:71},
      {label:"Περαστικοί/φυσική κίνηση",value:62},
      {label:"Αναζήτηση Google",value:43},
      {label:"Κοινωνικά δίκτυα",value:38}
    ],
    relationships:[
      {title:"Τοπικοί πελάτες × Σημασία online ανακάλυψης",source:"Q11 × Q12",a:"76–100% τοπική πελατεία",b:"Έως 50% τοπική πελατεία",aValue:74.3,bValue:56.7,aN:345,bN:250,
        note:"Η υψηλή δηλωμένη σημασία της online ανακάλυψης είναι στάση, όχι παρατηρημένη μεταβολή πωλήσεων."},
      {title:"E-shop × Επίδραση στο φυσικό κατάστημα",source:"Q03 × Q25",a:"Με δικό τους e-shop",b:"Χωρίς δικό τους e-shop",aValue:49.5,bValue:28.2,aN:316,bN:262,
        note:"Στη σύγκριση περιλαμβάνονται μόνο οι επιλέξιμες επιχειρήσεις με απάντηση για την πραγματική, όχι υποθετική, επίδραση."}
    ],
    scientific:"Στο παράδειγμα, οι τοπικά εξαρτώμενες επιχειρήσεις δηλώνουν μεγαλύτερη σημασία της ψηφιακής ανακάλυψης. Το εύρημα θα αποτελούσε ένδειξη σχετικής αντίληψης και όχι απόδειξη ότι η ψηφιακή προβολή αύξησε την επισκεψιμότητα.",
    limitations:"Οι απαντήσεις για τον ρόλο της online παρουσίας στη φυσική επισκεψιμότητα είναι προσωπικές εκτιμήσεις συμμετεχόντων."
  },
  {
    number:"04",short:"Καθημερινότητα",title:"Λειτουργικές δυσκολίες και εμπόδια ανάπτυξης",
    heading:"Πού χάνεται ο χρόνος των επιχειρήσεων;",
    description:"Απόθεμα, καταλογογράφηση, διοικητικές διαδικασίες, πληρωμές και εμπόδια που εμποδίζουν την ανάπτυξη.",
    questions:"Q05 · Q06 · Q07 · Q08 · Q18",
    focus:"Δυσκολίες καθημερινής λειτουργίας",
    metrics:[
      {label:"Δείκτης λειτουργικών δυσκολιών",value:"61,3/100",detail:"Ενδεικτικό n=799 · 95% ΔΕ 58,3–64,3"},
      {label:"Δυσκολία εύρεσης νέων πελατών",value:"4,1/5",detail:"Ενδεικτικό n=803 · 95% ΔΕ 3,9–4,3"},
      {label:"Επιλέγουν την τεχνολογία ως εμπόδιο",value:"34,7%",detail:"Ενδεικτικό n=798 · 95% ΔΕ 31,4–38,0%"}
    ],
    barsTitle:"Ενδεικτική σοβαρότητα λειτουργικών δυσκολιών",
    bars:[
      {label:"Απόκτηση νέων πελατών",value:81},
      {label:"Διοικητικές απαιτήσεις",value:75},
      {label:"Ενημέρωση προϊόντων",value:66},
      {label:"Έλεγχος αποθέματος",value:57}
    ],
    relationships:[
      {title:"Εργαλεία αποθέματος × Λειτουργική δυσκολία",source:"Q05 × Q07",a:"Με ολοκληρωμένα εργαλεία",b:"Χωρίς ψηφιακά εργαλεία",aValue:31.1,bValue:63.8,aN:260,bN:321,
        note:"Υψηλότερη τιμή σημαίνει εντονότερη δηλωμένη δυσκολία. Η διαφορά δεν αποδεικνύει ότι το εργαλείο αποτελεί την αιτία."},
      {title:"Ψηφιακός κατάλογος × Δυσκολία ενημέρωσης",source:"Q05 × Q07",a:"Με ψηφιακό κατάλογο",b:"Χωρίς ψηφιακό κατάλογο",aValue:34.6,bValue:61.2,aN:290,bN:269,
        note:"Η σύγκριση περιορίζεται σε όσους έχουν απαντήσει στις αντίστοιχες ερωτήσεις και στις δύο ομάδες."}
    ],
    scientific:"Στο υποθετικό σενάριο, οι επιχειρήσεις χωρίς οργανωμένα ψηφιακά εργαλεία δηλώνουν συχνότερα σοβαρές δυσκολίες. Η ερμηνεία οφείλει να εξετάσει την πολυπλοκότητα της λειτουργίας και όχι μόνο τη χρήση λογισμικού.",
    limitations:"Οι κλίμακες αποτυπώνουν τη βιωμένη δυσκολία και δεν μετρούν πραγματικές εργατοώρες ή οικονομικό κόστος."
  },
  {
    number:"05",short:"Προοπτικές",title:"Εμπιστοσύνη, επενδύσεις και ανάπτυξη",
    heading:"Υπάρχει θέληση για επένδυση — αλλά και δυνατότητα;",
    description:"Προσδοκίες για τους επόμενους 12 μήνες, επενδυτικά σχέδια και αισιοδοξία για την εξέλιξη της επιχείρησης.",
    questions:"Q16 · Q17 · Q19 · Q20 · Q21",
    focus:"Επενδύσεις, αισιοδοξία και χρηματοδότηση",
    metrics:[
      {label:"Δείκτης επιχειρηματικής εμπιστοσύνης",value:"41,7/100",detail:"Ενδεικτικό n=789 · 95% ΔΕ 38,9–44,5"},
      {label:"Προσδοκούν μείωση πωλήσεων",value:"46,2%",detail:"Ενδεικτικό n=807 · 95% ΔΕ 42,8–49,6%"},
      {label:"Δεν σχεδιάζουν σημαντική επένδυση",value:"37,1%",detail:"Ενδεικτικό n=799 · 95% ΔΕ 33,8–40,4%"}
    ],
    barsTitle:"Ενδεικτικοί τομείς σχεδιαζόμενων επενδύσεων",
    bars:[
      {label:"Online διαφήμιση",value:55},
      {label:"Ιδιόκτητο e-shop",value:43},
      {label:"Εξοπλισμός καταστήματος",value:39},
      {label:"ERP/λογισμικό",value:32}
    ],
    relationships:[
      {title:"Δυνατότητα χρηματοδότησης × Επενδυτικά σχέδια",source:"Q20 × Q16",a:"Χαμηλή εμπιστοσύνη",b:"Υψηλή εμπιστοσύνη",aValue:52.3,bValue:22.7,aN:357,bN:244,
        note:"Το μετρώμενο αποτέλεσμα είναι η απουσία σχεδίου σημαντικής επένδυσης· δεν πρόκειται για πραγματική απόφαση τραπεζικής χρηματοδότησης."},
      {title:"Μείωση κερδοφορίας × Επιχειρηματική απαισιοδοξία",source:"Q21 × Q19",a:"Μειωμένη κερδοφορία",b:"Σταθερή/αυξημένη κερδοφορία",aValue:71.4,bValue:36.5,aN:417,bN:315,
        note:"Τα αποτελέσματα μπορεί να επηρεάζονται από κοινού από εξωτερικές οικονομικές συνθήκες."}
    ],
    scientific:"Στο υποθετικό παράδειγμα, η μειωμένη εμπιστοσύνη στη δυνατότητα χρηματοδότησης συνδέεται με υψηλότερη συχνότητα απουσίας επενδυτικών σχεδίων. Πιθανή ερμηνεία είναι ο περιορισμός διαθέσιμων πόρων, χωρίς να τεκμηριώνεται αιτιώδης μηχανισμός.",
    limitations:"Οι μετρήσεις αισιοδοξίας και πωλήσεων αφορούν προσδοκίες και δεν συνιστούν οικονομική πρόβλεψη."
  },
  {
    number:"06",short:"Συγκρίσεις",title:"Διαφορές ανά περιοχή, κλάδο και μέγεθος",
    heading:"Δεν βιώνουν όλες οι επιχειρήσεις την ίδια πραγματικότητα.",
    description:"Σύγκριση των δεικτών σε περιοχές, κλάδους και διαφορετικές κατηγορίες μεγέθους, μόνο όπου επαρκεί η δειγματοληπτική βάση.",
    questions:"Q02 · Q05 · Q17 · Q19 · Q21 · Q27",
    focus:"Περιφερειακές, κλαδικές και διαρθρωτικές διαφορές",
    metrics:[
      {label:"Περιφερειακές ενότητες προς διερεύνηση",value:"13",detail:"Ενδεικτική δομή χάρτη · όχι κάλυψη δείγματος"},
      {label:"Βασικοί δείκτες σύγκρισης",value:"3",detail:"Ψηφιακή ετοιμότητα · Δυσκολίες · Εμπιστοσύνη"},
      {label:"Ελάχιστο n ανά δημοσιεύσιμη ομάδα",value:"30",detail:"Κανόνας απόκρυψης · δεν εγγυάται επάρκεια αβεβαιότητας"}
    ],
    barsTitle:"Ενδεικτικό δείγμα περιφερειακών διαφορών (όχι πραγματική κατάταξη)",
    bars:[
      {label:"Πελοπόννησος",value:63},
      {label:"Αττική",value:57},
      {label:"Κεντρική Μακεδονία",value:51},
      {label:"Κρήτη",value:44}
    ],
    relationships:[
      {title:"Μέγεθος επιχείρησης × Απαισιοδοξία",source:"Q02 × Q19",a:"1 εργαζόμενος",b:"5 ή περισσότεροι",aValue:61.2,bValue:38.9,aN:288,bN:219,
        note:"Ο αριθμός εργαζομένων δεν εξηγεί από μόνος του την καταγεγραμμένη διαφορά."},
      {title:"Μέγεθος επιχείρησης × Μείωση κερδοφορίας",source:"Q02 × Q21",a:"1 εργαζόμενος",b:"5 ή περισσότεροι",aValue:64.7,bValue:42.8,aN:279,bN:215,
        note:"Τα υποσύνολα πρέπει να έχουν επαρκές n, δημοσιεύσιμο αριθμό περιπτώσεων και τεκμηριωμένη αξιολόγηση σχεδιαστικής αβεβαιότητας."}
    ],
    scientific:"Στο τελικό δημοσιευμένο σύνολο, οι περιφερειακές, κλαδικές και κατά μέγεθος διαφορές θα εξετάζονται με τα έγκυρα βάρη της μελέτης και ρητή αναφορά της στατιστικής αβεβαιότητας. Μια οπτική απόκλιση μεταξύ ομάδων δεν σημαίνει κατ’ ανάγκη αξιόπιστη διαφορά.",
    limitations:"Οι λεπτομερείς γεωγραφικές κατατάξεις αποκρύπτονται όταν το διαθέσιμο δείγμα είναι μικρό ή επιτρέπει έμμεση αναγνώριση συμμετεχόντων."
  }
];

const indicatorCards = [
  {label:"Ψηφιακή ετοιμότητα",value:"54,8",outOf:"/ 100",width:54.8},
  {label:"Λειτουργικές δυσκολίες",value:"61,3",outOf:"/ 100",width:61.3},
  {label:"Επιχειρηματική εμπιστοσύνη",value:"41,7",outOf:"/ 100",width:41.7}
] as const;

const percent = (value: number) =>
  value.toLocaleString("el-GR",{minimumFractionDigits:1,maximumFractionDigits:1});
const integer = (value: number) => value.toLocaleString("el-GR");

export function ResearchResultsPreviewExperience() {
  const [chapterIndex,setChapterIndex] = useState(0);
  const [relationIndex,setRelationIndex] = useState(0);
  const [showMethod,setShowMethod] = useState(true);
  const chapter = CHAPTERS[chapterIndex] ?? CHAPTERS[0]!;
  const relationship = chapter.relationships[relationIndex] ?? chapter.relationships[0]!;
  const diff = relationship.aValue-relationship.bValue;

  return <div className={styles.content}>
    <section className={styles.hero}>
      <div className={styles.heroText}>
        <div className={styles.superline}><span className={styles.dot} /> KONTA MOY RESEARCH <span className={styles.separator}>/</span> ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ 2026</div>
        <div className={styles.chip}>ΣΧΕΔΙΑΣΤΙΚΗ ΠΡΟΕΠΙΣΚΟΠΗΣΗ · ΟΧΙ ΠΡΑΓΜΑΤΙΚΑ ΑΠΟΤΕΛΕΣΜΑΤΑ</div>
        <h1>Πίσω από τους αριθμούς, <em>η πραγματικότητα της αγοράς.</em></h1>
        <p>Έξι ενότητες. Μετρήσιμα ευρήματα. Διασταυρώσεις απαντήσεων. Επιστημονική ερμηνεία με σαφή όρια.</p>
        <div className={styles.heroActions}>
          <a className={styles.primaryAction} href="#explore">Εξερεύνηση του σχεδιασμού <span aria-hidden="true">↗</span></a>
          <Link href="/research/greek-retail-2026/results" className={styles.secondaryAction}>Επίσημη σελίδα αποτελεσμάτων</Link>
        </div>
      </div>
      <div className={styles.heroGraphic} aria-label="Ενδεικτικοί τρεις κεντρικοί δείκτες">
        <div className={styles.paperTop}><span>RESEARCH / 2026</span><span>ΔΕΙΓΜΑ ΟΘΟΝΗΣ</span></div>
        <div className={styles.paperTitle}>Τρεις κεντρικοί δείκτες</div>
        {indicatorCards.map((item,i)=><div className={styles.heroIndicator} key={item.label}>
          <div className={styles.indicatorMeta}><span>0{i+1} / {item.label}</span><strong>{item.value}<small>{item.outOf}</small></strong></div>
          <div className={styles.indicatorTrack}><div style={{width:item.width+"%"}} /></div>
        </div>)}
        <div className={styles.heroPaperFooter}>Οπτική δοκιμή · Τα στοιχεία είναι απολύτως ενδεικτικά</div>
      </div>
    </section>

    <div className={styles.demoRibbon} role="note">
      <strong>DEMO DATA — ΕΝΔΕΙΚΤΙΚΟ</strong>
      <span>Όλα τα ποσοστά, οι δείκτες, τα n, τα διαστήματα εμπιστοσύνης και οι διαφορές σε αυτή την προεπισκόπηση είναι κατασκευασμένα αποκλειστικά για να δείξουν τον σχεδιασμό. Δεν προέρχονται από την έρευνα.</span>
    </div>

    <ResearchResultsWorkbench mode="preview" geography={{
      regions:GREECE_REGIONS.map((r,i)=>({key:r.key,label:r.label,started:65+(i*53)%285}))
    }}/>
    
    <section id="explore" className={styles.explore} aria-labelledby="chapters-title">
      <div className={styles.sectionIntro}>
        <div><div className={styles.overline}>Η ΤΕΛΙΚΗ ΔΟΜΗ ΤΗΣ ΕΚΘΕΣΗΣ</div><h2 id="chapters-title">Έξι κεφάλαια. Μία ολοκληρωμένη εικόνα.</h2></div>
        <p>Επιλέξτε μια ενότητα για να δείτε ένα λειτουργικό παράδειγμα των τελικών καρτών, γραφημάτων, διασταυρώσεων και επιστημονικών σχολίων.</p>
      </div>
      <div className={styles.chapterPicker} role="group" aria-label="Επιλογή ερευνητικής ενότητας">
        {CHAPTERS.map((item,index)=><button key={item.number}
          type="button" aria-pressed={index===chapterIndex}
          className={index===chapterIndex ? styles.pickerActive : styles.picker}
          onClick={()=>{setChapterIndex(index);setRelationIndex(0);}}>
          <span className={styles.pickerNumber}>{item.number}</span>
          <span><strong>{item.short}</strong><small>{item.title}</small></span>
          <span className={styles.pickerArrow} aria-hidden="true">↗</span>
        </button>)}
      </div>
    </section>

    <section className={styles.report} aria-labelledby="chapter-heading">
      <header className={styles.reportHeader}>
        <div className={styles.reportHeaderCopy}>
          <span className={styles.reportEyebrow}>ΕΝΟΤΗΤΑ {chapter.number} <span>—</span> {chapter.focus}</span>
          <h2 id="chapter-heading">{chapter.heading}</h2>
          <p>{chapter.description}</p>
          <div className={styles.questionTags}><span>Ερωτήσεις {chapter.questions}</span><span>Σταθμισμένα δεδομένα στην τελική έκδοση</span></div>
        </div>
        <div className={styles.chapterBadge} aria-hidden="true">{chapter.number}<small>/ 06</small></div>
      </header>

      <div className={styles.sectionLabel}><span>01</span> Ενδεικτικά αριθμητικά ευρήματα <small>ΠΑΡΑΔΕΙΓΜΑ ΠΑΡΟΥΣΙΑΣΗΣ</small></div>
      <div className={styles.metricsGrid}>
        {chapter.metrics.map((metric,index)=><article key={metric.label} className={index===0?styles.mainMetric:styles.metric}>
          <div className={styles.metricTop}><span>{index===0?"ΚΕΝΤΡΙΚΟ ΕΥΡΗΜΑ":"ΜΕΤΡΗΣΗ 0"+(index+1)}</span><span className={styles.mockPill}>DEMO</span></div>
          <strong>{metric.value}</strong>
          <p>{metric.label}</p>
          <small>{metric.detail}</small>
        </article>)}
      </div>

      <div className={styles.twoColumns}>
        <section className={styles.chartPanel} aria-labelledby="ranking-heading">
          <div className={styles.panelHeading}><div><span className={styles.panelEyebrow}>ΚΑΤΑΝΟΜΗ / ΣΥΧΝΟΤΗΤΑ</span><h3 id="ranking-heading">{chapter.barsTitle}</h3></div><span className={styles.mockPill}>DEMO</span></div>
          <div className={styles.barList}>
            {chapter.bars.map((bar,index)=><div className={styles.barRow} key={bar.label}>
              <div className={styles.barLabel}><span>{bar.label}</span><strong>{bar.value}%</strong></div>
              <div className={styles.track}><div className={index===0?styles.trackFillMain:styles.trackFill} style={{width:bar.value+"%"}} /></div>
            </div>)}
          </div>
          <div className={styles.chartNote}>Ενδεικτική απεικόνιση πολλαπλών απαντήσεων: τα επιμέρους ποσοστά δεν χρειάζεται να αθροίζουν στο 100%.</div>
        </section>
        <section className={styles.methodPanel} aria-labelledby="reader-heading">
          <div className={styles.panelHeading}><div><span className={styles.panelEyebrow}>ΠΩΣ ΔΙΑΒΑΖΟΥΜΕ ΤΑ ΔΕΔΟΜΕΝΑ</span><h3 id="reader-heading">Από τον αριθμό στο νόημα</h3></div></div>
          <div className={styles.methodSteps}>
            <div><span>01</span><p>Η τιμή δείχνει <strong>τι δήλωσαν οι συμμετέχοντες</strong>, όχι απαραίτητα τι συνέβη αντικειμενικά στην αγορά.</p></div>
            <div><span>02</span><p>Κάθε μέτρηση συνοδεύεται από <strong>βάση απαντήσεων (n)</strong> και έγκυρη εκτίμηση αβεβαιότητας, όταν αυτή είναι δυνατή.</p></div>
            <div><span>03</span><p>Οι διαφοροποιήσεις μεταξύ ομάδων περιγράφονται ως <strong>σχέσεις, όχι αιτιακές εξηγήσεις</strong>.</p></div>
          </div>
          <div className={styles.methodFootnote}>Η επιστημονική ερμηνεία θα βασίζεται αποκλειστικά στην τελική ελεγμένη ανάλυση.</div>
        </section>
      </div>

      <section className={styles.relationPanel} aria-labelledby="relations-heading">
        <div className={styles.panelHeading}>
          <div><span className={styles.panelEyebrow}>02 / ΔΙΑΣΤΑΥΡΩΣΕΙΣ ΑΠΑΝΤΗΣΕΩΝ</span><h3 id="relations-heading">Πώς συνδέονται οι απαντήσεις μεταξύ τους;</h3></div>
          <span className={styles.mockPill}>DEMO</span>
        </div>
        <div className={styles.relationTabs} role="group" aria-label="Επιλογή σχέσης">
          {chapter.relationships.map((rel,index)=><button type="button" key={rel.title}
            aria-pressed={relationIndex===index}
            onClick={()=>setRelationIndex(index)}
            className={relationIndex===index?styles.relationTabActive:styles.relationTab}>
            {index===0?"Σχέση Α":"Σχέση Β"} <span>{rel.title}</span>
          </button>)}
        </div>
        <div className={styles.relationOverview}>
          <div><div className={styles.relationTitle}>{relationship.title}</div><div className={styles.relationSource}>Ερωτήσεις {relationship.source} · συγκρίσιμες ομάδες</div></div>
          <div className={styles.delta}><span>ΔΙΑΦΟΡΑ ΟΜΑΔΩΝ</span><strong>{diff>0?"+":""}{percent(diff)} <small>μ.π.</small></strong></div>
        </div>
        <div className={styles.compareGrid}>
          {[{label:relationship.a,value:relationship.aValue,n:relationship.aN,kind:"A"},{label:relationship.b,value:relationship.bValue,n:relationship.bN,kind:"B"}].map((group)=><div className={styles.compareCard} key={group.kind}>
            <div className={styles.compareLabel}><span>ΟΜΑΔΑ {group.kind}</span><strong>{group.label}</strong></div>
            <div className={styles.compareNumber}>{percent(group.value)}%</div>
            <div className={styles.compareTrack}><span style={{width:group.value+"%"}} /></div>
            <small>Ενδεικτικό μη σταθμισμένο n = {integer(group.n)}</small>
          </div>)}
        </div>
        <p className={styles.relationInterpretation}>{relationship.note}</p>
        <div className={styles.relationDisclosure}>Δεν παρουσιάζεται στατιστική σημαντικότητα ή διάστημα αβεβαιότητας για τη διαφορά χωρίς έγκυρο έλεγχο με βάση τον δειγματοληπτικό σχεδιασμό.</div>
      </section>

      <section className={styles.scientific} aria-labelledby="scientific-heading">
        <div className={styles.scientificMark}>03 / SCIENTIFIC INTERPRETATION</div>
        <div className={styles.scientificInner}>
          <div className={styles.scientificLeft}><h3 id="scientific-heading">Τι σημαίνουν πραγματικά αυτά τα στοιχεία;</h3><p>Παράδειγμα επιστημονικής ερμηνείας — όχι συμπέρασμα της έρευνας.</p></div>
          <div className={styles.scientificRight}><div className={styles.scientificText}>{chapter.scientific}</div>
            <button className={styles.methodToggle} type="button" onClick={()=>setShowMethod(!showMethod)} aria-expanded={showMethod}>
              {showMethod?"Απόκρυψη περιορισμών":"Προβολή επιστημονικών περιορισμών"} <span aria-hidden="true">{showMethod?"−":"+"}</span>
            </button>
            {showMethod&&<p className={styles.limitation}>{chapter.limitations}</p>}
          </div>
        </div>
      </section>
    </section>

    <section className={styles.bottom} aria-label="Δημοσίευση τελικών αποτελεσμάτων">
      <div><span className={styles.overline}>ΤΕΛΙΚΗ ΕΚΔΟΣΗ / 01.11.2026</span><h2>Έτοιμο το πλαίσιο. Τα συμπεράσματα θα τα δώσουν τα δεδομένα.</h2><p>Η τελική σελίδα θα αντικαταστήσει τους ενδεικτικούς αριθμούς μόνο με ελεγμένες εκτιμήσεις. Ανεπαρκείς υποομάδες δεν θα εμφανίζουν παραπλανητικά συμπεράσματα.</p></div>
      <div className={styles.bottomActions}><Link href="/research/greek-retail-2026/methodology">Δείτε τη μεθοδολογία ↗</Link><Link href="/research/greek-retail-2026/results">Επίσημη σελίδα αποτελεσμάτων ↗</Link></div>
    </section>
  </div>;
}
