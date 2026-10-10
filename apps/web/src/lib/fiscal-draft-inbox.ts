import { fiscalPool } from "./fiscal-runtime";
import type { FiscalActor } from "./fiscal-auth";
import type {FiscalCalculatedLine} from "./fiscal-preview-calculator";

export const FISCAL_INBOX_PAGE_SIZE=25;
export type FiscalInboxLane="b2c"|"pos"|"b2b"|"b2g";
export type FiscalInboxSource="console"|"external_api"|"marketplace";
export type FiscalInboxFilters={lane?:FiscalInboxLane;source?:FiscalInboxSource;after?:string};
export type FiscalInboxRow={
  id:string;lane:FiscalInboxLane;source:FiscalInboxSource;external_id:string|null;
  reference:string|null;gross_minor:string|null;created_at:Date;created_at_exact:string;
};
export type FiscalInboxDetail=FiscalInboxRow & {
 lines:FiscalCalculatedLine[];net_minor:string|null;vat_minor:string|null;
 discount_minor:string|null;calculation_kind:string|null;
 counterparty:null|{
  id:string;kind:"business"|"public_body";legalName:string;vatNumber:string;
  countryCode:"GR";verificationStatus:"unverified"
 };
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function fiscalInboxFilters(input:{lane?:string;source?:string;after?:string}):FiscalInboxFilters {
  const lane=["b2c","pos","b2b","b2g"].includes(input.lane??"")?input.lane as FiscalInboxLane:undefined;
  const source=["console","external_api","marketplace"].includes(input.source??"")?input.source as FiscalInboxSource:undefined;
  return {lane,source,after:input.after?.slice(0,256)};
}
function parseAfter(token:string|undefined):{createdAt:string;id:string}|null {
  if(!token||token.length>256)return null;
  try {
    const raw=Buffer.from(token,"base64url").toString("utf8");
    const [createdAt,id,...extra]=raw.split("|");
    if(extra.length||!UUID.test(id??"")||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(createdAt??"")||
      !Number.isFinite(Date.parse(createdAt.slice(0,23)+"Z"))||
      new Date(createdAt.slice(0,23)+"Z").toISOString()!==createdAt.slice(0,23)+"Z")return null;
    return {createdAt,id};
  }catch{return null;}
}
export function fiscalInboxNextCursor(row:FiscalInboxRow):string {
  return Buffer.from(row.created_at_exact+"|"+row.id,"utf8").toString("base64url");
}

/** Never load drafts by org alone. Membership is checked by PostgreSQL for every query. */
export async function listFiscalMerchantInbox(
  actor:Pick<FiscalActor,"id">,organizationId:string,filters:FiscalInboxFilters
):Promise<{rows:FiscalInboxRow[];nextCursor:string|null}> {
  if(!UUID.test(organizationId)||!UUID.test(actor.id))return {rows:[],nextCursor:null};
  const after=parseAfter(filters.after);
  // An invalid cursor fails closed instead of silently presenting a different page.
  if(filters.after&&!after)return {rows:[],nextCursor:null};
  const query=await fiscalPool().query<FiscalInboxRow>(
    `SELECT d.id,d.lane,d.source,d.external_id,
      left(d.payload->>'reference',120) AS reference,
      d.payload->>'grossMinor' AS gross_minor,d.created_at,
      to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_exact
     FROM fiscal_document_intakes d
     INNER JOIN fiscal_memberships m ON m.organization_id=d.organization_id AND m.user_id=$2
     INNER JOIN fiscal_users u ON u.id=m.user_id AND u.disabled_at IS NULL
     WHERE d.organization_id=$1 AND d.status='draft'
       AND ($3::text IS NULL OR d.lane=$3)
       AND ($4::text IS NULL OR d.source=$4)
       AND ($5::timestamptz IS NULL OR (d.created_at,d.id)<($5::timestamptz,$6::uuid))
     ORDER BY d.created_at DESC,d.id DESC LIMIT $7`,
    [organizationId,actor.id,filters.lane??null,filters.source??null,
      after?.createdAt??null,after?.id??null,FISCAL_INBOX_PAGE_SIZE+1]
  );
  const hasMore=query.rows.length>FISCAL_INBOX_PAGE_SIZE;
  const rows=query.rows.slice(0,FISCAL_INBOX_PAGE_SIZE);
  return {rows,nextCursor:hasMore?fiscalInboxNextCursor(rows[rows.length-1]):null};
}

/** One read-only document view. Unknown IDs and cross-tenant IDs are indistinguishable. */
export async function getFiscalMerchantDraft(
  actor:Pick<FiscalActor,"id">,organizationId:string,draftId:string
):Promise<FiscalInboxDetail|null>{
 if(!UUID.test(organizationId)||!UUID.test(draftId)||!UUID.test(actor.id))return null;
 const result=await fiscalPool().query<FiscalInboxDetail>(
   `SELECT d.id,d.lane,d.source,d.external_id,
      left(d.payload->>'reference',120) AS reference,
      d.payload->>'grossMinor' AS gross_minor,
      d.payload->>'netMinor' AS net_minor,
      d.payload->>'vatMinor' AS vat_minor,
      d.payload->>'discountMinor' AS discount_minor,
      d.payload->>'calculationKind' AS calculation_kind,
      d.payload->'counterparty' AS counterparty,
      COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
        'description',l.description,'quantityMilli',l.quantity_milli,
        'unitPriceMinor',l.unit_price_minor,'vatRateBps',l.vat_rate_bps,
        'discountBps',l.discount_bps,'beforeDiscountMinor',l.before_discount_minor,
        'discountMinor',l.discount_minor,'netMinor',l.net_minor,
        'vatMinor',l.vat_minor,'grossMinor',l.gross_minor
       ) ORDER BY l.line_no)
       FROM fiscal_document_intake_lines l
       WHERE l.organization_id=d.organization_id AND l.draft_id=d.id
      ),'[]'::jsonb) AS lines,d.created_at,
      to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_exact
    FROM fiscal_document_intakes d
    INNER JOIN fiscal_memberships m ON m.organization_id=d.organization_id AND m.user_id=$2
    INNER JOIN fiscal_users u ON u.id=m.user_id AND u.disabled_at IS NULL
    WHERE d.organization_id=$1 AND d.id=$3 AND d.status='draft'
    LIMIT 1`,[organizationId,actor.id,draftId]);
 return result.rows[0]??null;
}
