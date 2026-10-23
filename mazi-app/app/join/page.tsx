import type {Metadata} from "next";
import JoinForm from "./join-form";
export const dynamic="force-dynamic";
export const metadata:Metadata={
 title:"Αίτηση ενδιαφέροντος με ΑΦΜ · ΜΑΖΙ",
 description:"Εκδήλωση ενδιαφέροντος με ΑΦΜ και επίσημα στοιχεία ΓΕΜΗ. Η είσοδος στο ΜΑΖΙ πραγματοποιείται μόνο κατόπιν πρόσκλησης."
};
export default async function Join(){
 return <main id="content"><section className="subhero"><div className="shell">
  <span className="eyebrow light">ΜΑΖΙ / ΓΙΑ ΑΝΕΞΑΡΤΗΤΕΣ ΕΠΙΧΕΙΡΗΣΕΙΣ</span>
  <h1>Δεν εγγράφεσαι.<br/><em>Μας γνωρίζεις.</em></h1>
  <p>Η ένταξη γίνεται μόνο με πρόσκληση, μετά από πραγματικό έλεγχο της επιχείρησης και του νόμιμου εκπροσώπου.</p>
 </div></section><JoinForm/></main>;
}
