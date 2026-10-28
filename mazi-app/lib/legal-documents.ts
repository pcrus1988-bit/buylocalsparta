import {legalCoreV3} from "./legal/v3-core";
import {legalFinanceV3} from "./legal/v3-finance";
import {legalDataV3} from "./legal/v3-data";

export type LegalSection = {heading:string; paragraphs:readonly string[]};
export type LegalRecord = {title:string; eyebrow:string; summary:string; status:"current"|"proposed"; sections:readonly LegalSection[]};
export const LEGAL_DATE="28.10.2026";
export const LEGAL_VERSION="mazi-legal-v3-20261028";
// These pricing constants are referenced by commercial UI and regression checks.
// The General Terms document does NOT contain or render these values.
export const HUB_PRO_MONTHLY_EUR=99;
export const SERVICE_CREDIT_MONTHLY_EUR=250;
export const MEMBERSHIP_MONTHLY_EUR=250;

/** Single authoritative registry. Each subject is owned by exactly one policy. */
export const legalRecords={
  ...legalCoreV3,
  ...legalFinanceV3,
  ...legalDataV3
} as const satisfies Record<string,LegalRecord>;
export type LegalSlug=keyof typeof legalRecords;
export const legalOrder:readonly LegalSlug[]=[
  "terms","membership","services","fund","award","marketing",
  "community","governance","privacy","retention","cookies","compliance"
];
export const legalRelations:Record<LegalSlug,readonly LegalSlug[]>={
  terms:["membership","services","community","privacy","compliance"],
  membership:["terms","services","fund","marketing","award"],
  services:["membership","marketing","privacy","retention"],
  fund:["membership","award","governance","privacy"],
  award:["fund","membership","privacy","retention"],
  marketing:["membership","services","privacy","governance"],
  community:["terms","privacy","retention","compliance"],
  governance:["fund","marketing","privacy","compliance"],
  privacy:["retention","cookies","community","compliance"],
  retention:["privacy","cookies","governance"],
  cookies:["privacy","retention"],
  compliance:["terms","membership","community","privacy"]
};
export function legalUrl(slug:LegalSlug){
 return slug==="terms"?"/terms":slug==="privacy"?"/privacy":`/legal/${slug}`;
}
