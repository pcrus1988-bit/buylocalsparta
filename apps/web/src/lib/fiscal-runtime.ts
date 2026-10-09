import { Pool } from "pg";

const globalPool = globalThis as typeof globalThis & { __kmFiscalPool?: Pool };
function identity(raw:string):string {
  const u=new URL(raw);
  return [u.hostname.toLowerCase(),u.port||"5432",decodeURIComponent(u.pathname).replace(/\/+$/,"")].join("|");
}
export function fiscalDatabaseConfigured():boolean { return Boolean(process.env.FISCAL_DATABASE_URL?.trim()); }
export function fiscalPool():Pool {
  const address=process.env.FISCAL_DATABASE_URL?.trim();
  if(!address)throw new Error("FISCAL_DATABASE_URL_NOT_CONFIGURED");
  const marketplace=[process.env.DATABASE_URL,process.env.POSTGRES_URL].filter((x):x is string=>Boolean(x?.trim()));
  if(marketplace.some(x=>identity(x)===identity(address)))throw new Error("FISCAL_DATABASE_MUST_BE_INDEPENDENT");
  return globalPool.__kmFiscalPool??(globalPool.__kmFiscalPool=new Pool({
    connectionString:address,max:2,idleTimeoutMillis:10_000,connectionTimeoutMillis:5_000,
    application_name:"konta-moy-fiscal"
  }));
}
export const fiscalLanes=[
  {id:"b2c",title:"B2C · Retail",detail:"Retail receipts and e-commerce"},
  {id:"pos",title:"POS · All-in-One",detail:"Physical checkout and terminal certification"},
  {id:"b2b",title:"B2B",detail:"Business invoices and credit documents"},
  {id:"b2g",title:"B2G",detail:"EN 16931, Greek CIUS and public sector"}
] as const;
// Certification is not complete: no fiscal issuance can be performed by this service.
export function assertFiscalIssuanceAllowed():never {throw new Error("FISCAL_ISSUANCE_NOT_CERTIFIED");}
