import "server-only";
// @ts-ignore pdfmake ships no reliable ESM type definition for the browser bundle.
import pdfMakeModule from "pdfmake/build/pdfmake.js";
// @ts-ignore pdfmake virtual fonts bundle has no reliable ESM type definition.
import fontsModule from "pdfmake/build/vfs_fonts.js";
import type { PressKitHighlight } from "./research-press-kit";

const make = ((pdfMakeModule as { default?: unknown }).default ?? pdfMakeModule) as {
  addVirtualFileSystem?: (vfs: Record<string, string>) => void;
  vfs?: Record<string, string>;
  createPdf: (definition: unknown) => { getBuffer: (callback: (value: Uint8Array) => void) => void };
};
const rawFonts = (fontsModule as { default?: unknown }).default ?? fontsModule;
const vfs = ((rawFonts as { pdfMake?: { vfs?: Record<string, string> }; vfs?: Record<string, string> }).pdfMake?.vfs
  ?? (rawFonts as { vfs?: Record<string, string> }).vfs ?? rawFonts) as Record<string, string>;

export async function renderResearchPressReleasePdf(highlights: readonly PressKitHighlight[], publishedAt: string): Promise<Uint8Array> {
  if (!vfs || typeof vfs["Roboto-Regular.ttf"] !== "string") throw new Error("RESEARCH_PRESS_PDF_FONT_UNAVAILABLE");
  if (make.addVirtualFileSystem) make.addVirtualFileSystem(vfs); else make.vfs = vfs;
  const date = new Date(publishedAt).toLocaleDateString("el-GR", { timeZone: "Europe/Athens", day: "numeric", month: "long", year: "numeric" });
  const content: unknown[] = [
    { text: "KONTA MOY  /  RESEARCH", style: "brand" },
    { text: "ΔΕΛΤΙΟ ΤΥΠΟΥ  ·  ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ 2026", style: "overline", margin: [0, 25, 0, 7] },
    { text: "Ψηφιακή επανάσταση στα χαρτιά. Αγώνας επιβίωσης πίσω από τις βιτρίνες.", style: "title", margin: [0, 0, 0, 18] },
    { text: "Η καθημερινότητα των επιχειρήσεων μέσα από τις απαντήσεις τους", style: "subtitle", margin: [0, 0, 0, 22] },
    { text: "Η έρευνα «Ελληνικό Λιανεμπόριο 2026» του KONTA MOY καταγράφει πώς οι συμμετέχουσες επιχειρήσεις περιγράφουν την οικονομική πίεση, την ψηφιακή τους λειτουργία, τις σχέσεις με τους πελάτες και τις προοπτικές τους. Πίσω από τη συζήτηση για την ψηφιακή μετάβαση βρίσκονται πραγματικές καθημερινές επιλογές: λειτουργικά έξοδα, απόθεμα, χρόνος και δυνατότητα επένδυσης.", style: "body" },
    { text: "Τα βασικά αριθμητικά ευρήματα", style: "section", margin: [0, 18, 0, 10] },
    ...highlights.slice(0, 7).map(item => ({
      stack: [
        { text: item.formatted + "  —  " + item.title, style: "number" },
        { text: item.insight + "  Βάση: n=" + item.n.toLocaleString("el-GR") + " · " + item.question + ".", style: "small", margin: [0, 4, 0, 12] }
      ]
    })),
    { text: "Από το εύρημα στη λύση", style: "section", margin: [0, 14, 0, 10] },
    { text: "Τα αποτελέσματα ανοίγουν μια δημόσια συζήτηση: πώς μπορούν να μειωθούν τα διοικητικά βάρη, να γίνει πιο προσιτή η τεχνολογία διαχείρισης και να αποκτήσουν μικρότερες επιχειρήσεις πρακτική υποστήριξη, αντί για ακόμη μία ψηφιακή υποχρέωση; Αυτές είναι προτάσεις για συζήτηση, όχι αιτιώδη συμπεράσματα της έρευνας.", style: "body" },
    { text: "Πώς να διαβάσετε σωστά τους αριθμούς", style: "section", margin: [0, 17, 0, 10] },
    { text: "Τα ποσοστά βασίζονται στις έγκυρες απαντήσεις των συμμετεχουσών επιχειρήσεων. Οι βάσεις (n) διαφέρουν ανά ερώτηση. Η συμμετοχή ήταν εθελοντική και τα ευρήματα δεν τεκμηριώνουν αυτομάτως αντιπροσωπευτικότητα όλου του ελληνικού λιανεμπορίου. Σε ερωτήσεις πολλαπλής επιλογής τα ποσοστά δεν αθροίζονται υποχρεωτικά στο 100%. Η αναλυτική μεθοδολογία και οι περιορισμοί διατίθενται δημόσια.", style: "small" },
    { text: "Πηγή και πλήρη αποτελέσματα", style: "section", margin: [0, 20, 0, 8] },
    { text: "https://kontamou.site/research/greek-retail-2026/results", link: "https://kontamou.site/research/greek-retail-2026/results", style: "link" },
    { text: "Μεθοδολογία: https://kontamou.site/research/greek-retail-2026/methodology", style: "small", margin: [0, 7, 0, 12] },
    { text: "Γραφείο Τύπου / research@kontamou.site", style: "contact" }
  ];
  const document = {
    info: { title: "Ελληνικό Λιανεμπόριο 2026 | Δελτίο Τύπου", author: "KONTA MOY · SP BUSINESS LAB", subject: "Δημοσιευμένα ευρήματα Ελληνικού Λιανεμπορίου 2026" },
    pageSize: "A4", pageMargins: [47, 49, 47, 60],
    defaultStyle: { font: "Roboto", fontSize: 10.5, color: "#253d30", lineHeight: 1.34 },
    styles: {
      brand: { fontSize: 12, bold: true, color: "#246442", characterSpacing: 1.4 },
      overline: { fontSize: 8, bold: true, color: "#4b7857", characterSpacing: 1.2 },
      title: { fontSize: 26, bold: true, color: "#173e2c", lineHeight: 1.12 },
      subtitle: { fontSize: 13, color: "#52725a" },
      body: { fontSize: 11, lineHeight: 1.47 },
      section: { fontSize: 15, bold: true, color: "#1a5535" },
      number: { fontSize: 12, bold: true, color: "#1d5336" },
      small: { fontSize: 9.1, color: "#526c5a", lineHeight: 1.4 },
      link: { fontSize: 9.4, color: "#236146", decoration: "underline" },
      contact: { fontSize: 10, bold: true, color: "#23583a" }
    }, content,
    footer: (page: number, pages: number) => ({
      margin: [47, 10, 47, 0],
      columns: [
        { text: "KONTA MOY Research  ·  " + date, fontSize: 8, color: "#688271" },
        { text: String(page) + " / " + String(pages), alignment: "right", fontSize: 8, color: "#688271" }
      ]
    })
  };
  return await new Promise<Uint8Array>((resolve, reject) => {
    try { make.createPdf(document).getBuffer(buffer => resolve(buffer)); } catch (error) { reject(error); }
  });
}
