import "server-only";

import postcodePrefectures from "./research-postcode-prefecture-map.json";
import { GREECE_REGIONS, greekRegionForPrefecture, normalizedPrefecture, type GreekRegionKey } from "./research-geographic-core";
import { GREECE_PREFECTURES } from "./research-prefectures";

/** Never return, serialize or log a postcode from this resolver.
 * Polygons are the bundled 55 historic νομοί; regions are the 13 administrative
 * περιφέρειες. A postcode wins over an inconsistent historic GEMI prefecture.
 */
const VALID_REGIONS = new Set<string>(GREECE_REGIONS.map(r=>r.key));
const LABELS = new Map<string,string>(GREECE_PREFECTURES.map(p=>[p.key,p.label]));
const CODES = new Set(GREECE_PREFECTURES.map(p=>p.key));
const POSTCODE_MAP = postcodePrefectures as Record<string, readonly [string,string]>;

/** For postal references missing from the point dataset, only use established
 * legacy source names. Do not infer a νομός from the first 2–3 digits alone.
 */
const SOURCE_PREFECTURES: Record<string,string> = {
 "ΠΕΛΛΗΣ":"Pella","ΕΥΡΥΤΑΝΙΑΣ":"Euritania","ΛΑΡΙΣΑΣ":"Larisa","ΛΑΡΙΣΗΣ":"Larisa",
 "ΛΑΚΩΝΙΑΣ":"Lakonia","ΗΡΑΚΛΕΙΟΥ":"Heraklio","ΕΒΡΟΥ":"Evros","ΣΑΜΟΥ":"Samos",
 "ΧΑΛΚΙΔΙΚΗΣ":"Chalkidiki","ΣΕΡΡΩΝ":"Serres","ΚΟΖΑΝΗΣ":"Kozani",
 "ΗΜΑΘΙΑΣ":"Imathia","ΦΘΙΩΤΙΔΑΣ":"Fthiotida","ΧΙΟΥ":"Chios","ΑΧΑΙΑΣ":"Achaia",
 "ΦΛΩΡΙΝΑΣ":"Florina","ΠΡΕΒΕΖΑΣ":"Preveza","ΕΥΒΟΙΑΣ":"Evia",
 "ΓΡΕΒΕΝΩΝ":"Grevena","ΑΘΗΝΩΝ":"Athens","ΚΕΦΑΛΛΗΝΙΑΣ":"Kefallonia",
 "ΚΕΦΑΛΟΝΙΑΣ":"Kefallonia","ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ":"East Attica",
 "ΡΟΔΟΠΗΣ":"Rodopi","ΚΟΡΙΝΘΙΑΣ":"Korinthos","ΧΑΝΙΩΝ":"Chania",
 "ΛΕΣΒΟΥ":"Lesvos","ΑΡΚΑΔΙΑΣ":"Arkadia","ΚΑΣΤΟΡΙΑΣ":"Kastoria",
 "ΖΑΚΥΝΘΟΥ":"Zakynthos","ΔΡΑΜΑΣ":"Drama","ΚΥΚΛΑΔΩΝ":"Kyklades",
 "ΛΕΥΚΑΔΑΣ":"Lefkada","ΒΟΙΩΤΙΑΣ":"Viotia","ΛΑΣΙΘΙΟΥ":"Lasithio",
 "ΡΕΘΥΜΝΗΣ":"Rethymno","ΡΕΘΥΜΝΟΥ":"Rethymno","ΜΑΓΝΗΣΙΑΣ":"Magnisia",
 "ΑΡΓΟΛΙΔΑΣ":"Argolida","ΚΑΒΑΛΑΣ":"Kavala","ΗΛΕΙΑΣ":"Ilia",
 "ΚΑΡΔΙΤΣΑΣ":"Karditsa","ΑΡΤΑΣ":"Arta","ΘΕΣΣΑΛΟΝΙΚΗΣ":"Thessaloniki",
 "ΞΑΝΘΗΣ":"Xanthi","ΔΩΔΕΚΑΝΗΣΟΥ":"Dodekanisa","ΚΙΛΚΙΣ":"Kilkis",
 "ΜΕΣΣΗΝΙΑΣ":"Mesinia","ΘΕΣΠΡΩΤΙΑΣ":"Thesprotia","ΤΡΙΚΑΛΩΝ":"Trikala",
 "ΚΕΡΚΥΡΑΣ":"Kerkyra","ΠΙΕΡΙΑΣ":"Pieria","ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ":"West Attica",
 "ΙΩΑΝΝΙΝΩΝ":"Ioannina","ΦΩΚΙΔΑΣ":"Fokida",
 "ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ":"Aitoloakarnania","ΠΕΙΡΑΙΑ":"Peiraias and islands",
 "ΠΕΙΡΑΙΩΣ":"Peiraias and islands"
};

export type ResearchAdministrativeGeography = Readonly<{
 regionCode:GreekRegionKey|"";
 prefectureCode:string;
 prefectureLabel:string;
 source:"postcode"|"legacy_prefecture"|"unresolved";
}>;

export function resolveResearchAdministrativeGeography(
  postcode:unknown,sourcePrefecture:unknown
):ResearchAdministrativeGeography {
  const raw = typeof postcode==="string" ? postcode.replace(/\s+/g,"") : "";
  const matched = /^\d{5}$/.test(raw) ? POSTCODE_MAP[raw] : undefined;
  if (matched && VALID_REGIONS.has(matched[1])) {
    const prefectureCode=CODES.has(matched[0])?matched[0]:"";
    return {
      regionCode:matched[1] as GreekRegionKey,prefectureCode,
      prefectureLabel:LABELS.get(prefectureCode)??"",source:"postcode"
    };
  }
  const historic=typeof sourcePrefecture==="string"?sourcePrefecture:"";
  const regionCode=greekRegionForPrefecture(historic)??"";
  const prefectureCode=SOURCE_PREFECTURES[normalizedPrefecture(historic)]??"";
  return {
    regionCode,prefectureCode,
    prefectureLabel:LABELS.get(prefectureCode)??"",
    source:regionCode?"legacy_prefecture":"unresolved"
  };
}
