import type {LegalSlug} from "../legal-documents";

/** Each statute is shown only beside the subject it actually governs. */
export type LegalSource={label:string;url:string};
const gdpr={label:"ΓΚΠΔ · Κανονισμός (ΕΕ) 2016/679",url:"https://eur-lex.europa.eu/eli/reg/2016/679/oj"};
const dsa={label:"DSA · Κανονισμός (ΕΕ) 2022/2065 (κατά το εφαρμοστέο μέρος)",url:"https://eur-lex.europa.eu/eli/reg/2022/2065/oj"};
const p2b={label:"P2B · Κανονισμός (ΕΕ) 2019/1150 (μόνο αν συντρέχει το πεδίο εφαρμογής)",url:"https://eur-lex.europa.eu/eli/reg/2019/1150/oj"};
const hdpa={label:"ΑΠΔΠΧ · Δικαιώματα και εφαρμοστέα νομοθεσία",url:"https://www.dpa.gr/el"};
const cookies={label:"ΑΠΔΠΧ · Cookies και τοπική αποθήκευση",url:"https://www.dpa.gr/enimerwtiko/thematikes_enotites/electronikesepikoinwnies/cookies/cookies_diadiktuo_cookies"};
const vat={label:"Ν. 5144/2024 · Άρθρο 16, ΦΠΑ και κουπόνια",url:"https://tax2.taxheaven.gr/law/5144/2024/arthro/16"};
const books={label:"Ν. 4308/2014 · Άρθρο 7, διατήρηση λογιστικών αρχείων",url:"https://www.taxheaven.gr/law/4308/2014/arthro/7"};
const deminimis={label:"Κανονισμός (ΕΕ) 2023/2831 · de minimis, μόνο για πραγματικές κρατικές ενισχύσεις",url:"https://eur-lex.europa.eu/eli/reg/2023/2831/oj"};
const safety={label:"Κανονισμός (ΕΕ) 2023/988 · Ασφάλεια προϊόντων, κατά περίπτωση",url:"https://eur-lex.europa.eu/eli/reg/2023/988/oj"};
export const legalSourceMap:Record<LegalSlug,readonly LegalSource[]>={
 terms:[dsa,p2b],
 membership:[vat,books],
 services:[vat],
 fund:[books],
 award:[deminimis,books],
 marketing:[gdpr,cookies],
 governance:[books,gdpr],
 privacy:[gdpr,hdpa],
 retention:[gdpr,books],
 cookies:[cookies,gdpr],
 community:[dsa,safety],
 compliance:[gdpr,dsa,p2b,vat,books]
};
