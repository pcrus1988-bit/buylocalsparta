/**
 * Synthetic-only credit allocation playground.
 *
 * The application supplies user-edited demonstration amounts, never an actual
 * invoice, merchant ledger, or certified tax document. No persistence, access
 * to fiscal records, payment commands or network operations are possible here.
 */
import {previewFiscalSandboxCredit} from "./fiscal-sandbox-credit-allocation.ts";
import type {FiscalTestCreditLane} from "./fiscal-sandbox-credit-allocation.ts";

export type FiscalCreditLabRow=Readonly<{
  original: string;
  previouslyCredited: string;
  proposedCredit: string;
}>;
export type FiscalCreditLabInput=Readonly<{
  lane: FiscalTestCreditLane;
  rows: readonly FiscalCreditLabRow[];
}>;

const MAX_GROSS_MINOR=1_000_000_000_000;
const SYNTHETIC_DRAFT_ID="11111111-1111-4111-8111-111111111111";
const LANES:readonly string[]=["b2c","pos","b2b","b2g"];

/** Exact integer cents, allowing decimal comma or point but no grouping. */
export function parseFiscalCreditLabEuro(raw:unknown,allowZero=false):number{
  if(typeof raw!=="string")throw new Error("LAB_INVALID_AMOUNT");
  const match=/^(0|[1-9][0-9]{0,10})(?:[,.]([0-9]{1,2}))?$/.exec(raw.trim());
  if(!match)throw new Error("LAB_INVALID_AMOUNT");
  const cents=BigInt(match[1])*100n+BigInt((match[2]??"").padEnd(2,"0")||"0");
  if((!allowZero&&cents===0n)||cents>BigInt(MAX_GROSS_MINOR))
    throw new Error("LAB_INVALID_AMOUNT");
  return Number(cents);
}

export function previewFiscalCreditLab(input:FiscalCreditLabInput){
  if(!input||!LANES.includes(input.lane)||
     !Array.isArray(input.rows)||input.rows.length<1||input.rows.length>12)
    throw new Error("LAB_INVALID_INPUT");
  let total=0n;
  const originals:{lineNo:number;grossMinor:number}[]=[];
  const previous:{lineNo:number;amountMinor:number}[]=[];
  const proposed:{lineNo:number;amountMinor:number}[]=[];
  for(let i=0;i<input.rows.length;i++){
    const row=input.rows[i];
    if(!row||typeof row!=="object"||
      Object.keys(row).some(key=>!["original","previouslyCredited","proposedCredit"].includes(key)))
      throw new Error("LAB_INVALID_INPUT");
    const gross=parseFiscalCreditLabEuro(row.original);
    const old=parseFiscalCreditLabEuro(row.previouslyCredited,true);
    const next=parseFiscalCreditLabEuro(row.proposedCredit,true);
    if(old+next>gross)throw new Error("LAB_OVERALLOCATED");
    total+=BigInt(gross);
    if(total>BigInt(MAX_GROSS_MINOR))throw new Error("LAB_TOTAL_TOO_LARGE");
    originals.push({lineNo:i+1,grossMinor:gross});
    if(old>0)previous.push({lineNo:i+1,amountMinor:old});
    if(next>0)proposed.push({lineNo:i+1,amountMinor:next});
  }
  if(proposed.length===0)throw new Error("LAB_EMPTY_PROPOSAL");
  // "previous" represents only a synthetic user-input aggregate, never a
  // claimed complete history of any real document's adjustments.
  return previewFiscalSandboxCredit({
    original:{
      draftId:SYNTHETIC_DRAFT_ID,lane:input.lane,currency:"EUR",
      grossMinor:Number(total),lines:originals
    },
    previous:previous.length?[{externalId:"DEMO-PREVIOUS-001",lines:previous}]:[],
    candidate:{externalId:"DEMO-CANDIDATE-001",lines:proposed}
  });
}
