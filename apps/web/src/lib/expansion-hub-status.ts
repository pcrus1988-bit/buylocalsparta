import { EXPANSION_HUBS, type ExpansionHub } from "./expansion-hubs.ts";

export type ExpansionHubDisplayState = "inactive" | "prospect" | "active";

type HubStatusRecord = Readonly<{
  id: string;
  slug: string;
  state: Exclude<ExpansionHubDisplayState, "inactive">;
  prospectCount?: number;
  researchStatus: "IN_PROGRESS" | "ACTIVE_REFERENCE";
}>;

// Status snapshot aligned by stable hub_id + seo slug with:
// KONTA_MOU_131_HUB_LIVE_VENDOR_RESEARCH / Hub_Research_Coverage.
// Snapshot date: 2026-09-08.
//
// Rules used by the customer location map:
// - ACTIVE_REFERENCE / active vendors -> green
// - IN_PROGRESS with in-scope prospect rows -> yellow
// - every other hub -> grey (inactive / queued-not-started)
//
// Do not key these records by array position. Hub identity is the KM-HUB-xxx id
// from the expansion master, with slug retained as a second alignment guard.
const HUB_STATUS_RECORDS: readonly HubStatusRecord[] = [
  { id: "KM-HUB-001", slug: "athina", state: "prospect", prospectCount: 301, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-002", slug: "megara", state: "prospect", prospectCount: 24, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-004", slug: "lavrio", state: "prospect", prospectCount: 11, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-006", slug: "poros", state: "prospect", prospectCount: 3, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-008", slug: "korinthos", state: "prospect", prospectCount: 297, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-010", slug: "nafplio", state: "prospect", prospectCount: 34, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-012", slug: "tripoli", state: "prospect", prospectCount: 44, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-015", slug: "sparti", state: "active", researchStatus: "ACTIVE_REFERENCE" },
  { id: "KM-HUB-019", slug: "kalamata", state: "prospect", prospectCount: 17, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-022", slug: "patra", state: "prospect", prospectCount: 17, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-025", slug: "pyrgos", state: "prospect", prospectCount: 2, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-027", slug: "agrinio", state: "prospect", prospectCount: 4, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-029", slug: "lamia", state: "prospect", prospectCount: 13, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-041", slug: "larisa", state: "prospect", prospectCount: 7, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-042", slug: "volos", state: "prospect", prospectCount: 3, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-051", slug: "ioannina", state: "prospect", prospectCount: 11, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-089", slug: "rethymno", state: "prospect", prospectCount: 1, researchStatus: "IN_PROGRESS" },
  { id: "KM-HUB-115", slug: "rodos", state: "prospect", prospectCount: 3, researchStatus: "IN_PROGRESS" }
];

const HUB_STATUS_BY_ID = new Map(HUB_STATUS_RECORDS.map((record) => [record.id, record] as const));

export function getExpansionHubDisplayState(hub: ExpansionHub): ExpansionHubDisplayState {
  return HUB_STATUS_BY_ID.get(hub.id)?.state ?? "inactive";
}

export function getExpansionHubProspectCount(hub: ExpansionHub): number | undefined {
  return HUB_STATUS_BY_ID.get(hub.id)?.prospectCount;
}

export function getExpansionHubStateLabel(hub: ExpansionHub): string {
  const state = getExpansionHubDisplayState(hub);
  if (state === "active") return "Ενεργή";
  if (state === "prospect") return "Με prospect vendors";
  return "Ανενεργή";
}

export function getExpansionHubStateDescription(hub: ExpansionHub): string {
  const state = getExpansionHubDisplayState(hub);
  if (state === "active") return "Ενεργή τοπική αγορά";
  if (state === "prospect") {
    const count = getExpansionHubProspectCount(hub);
    return count ? `Υπό ανάπτυξη · ${count} prospect vendors` : "Υπό ανάπτυξη · prospect vendors";
  }
  return "Ανενεργό hub";
}

export function assertExpansionHubStatusAlignment(): void {
  const seen = new Set<string>();
  for (const record of HUB_STATUS_RECORDS) {
    if (seen.has(record.id)) throw new Error(`Duplicate expansion hub status record: ${record.id}`);
    seen.add(record.id);

    const hub = EXPANSION_HUBS.find((candidate) => candidate.id === record.id);
    if (!hub) throw new Error(`Expansion hub status references unknown hub: ${record.id}`);
    if (hub.slug !== record.slug) {
      throw new Error(`Expansion hub status slug mismatch for ${record.id}: master=${hub.slug}, status=${record.slug}`);
    }
  }

  const sparta = HUB_STATUS_BY_ID.get("KM-HUB-015");
  if (!sparta || sparta.state !== "active" || sparta.slug !== "sparti") {
    throw new Error("Sparta must remain the active reference hub KM-HUB-015 / sparti");
  }
}
