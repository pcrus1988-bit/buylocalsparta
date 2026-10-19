/**
 * Disposable-CI-only exact SQL smoke: creates a synthetic storage catalog
 * in one transaction, then rolls it all back. Never targets live Supabase.
 */
import assert from "node:assert/strict";
import pg from "pg";
import {
 FISCAL_VAULT_QUARANTINE_BUCKET,FISCAL_VAULT_CIPHERTEXT_LIMIT,
 FISCAL_VAULT_CATALOG_SQL,FISCAL_VAULT_BUCKET_SQL,
 FISCAL_VAULT_OBJECT_COUNT_SQL,FISCAL_VAULT_POLICY_COUNT_SQL,
 evaluateFiscalVaultCatalog
} from "../apps/web/src/lib/fiscal-kyb-vault-live-readiness.ts";
const connectionString=process.env.FISCAL_DATABASE_URL??"";
let url;
try{url=new URL(connectionString);}catch{throw new Error("CI_EPHEMERAL_ONLY");}
if(process.env.CI!=="true"||
 !["localhost","127.0.0.1","::1"].includes(url.hostname)||
 url.pathname!=="/fiscal_ci"||
 connectionString===process.env.DATABASE_URL)
 throw new Error("CI_EPHEMERAL_ONLY");
const db=new pg.Client({connectionString,connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query("BEGIN");
 const missing=await db.query(FISCAL_VAULT_CATALOG_SQL);
 assert.equal(missing.rows[0].has_buckets,false);
 await db.query("CREATE SCHEMA storage");
 await db.query(`
 CREATE TABLE storage.buckets (
   id text PRIMARY KEY,
   public boolean NOT NULL DEFAULT false,
   file_size_limit bigint,
   allowed_mime_types text[]
 );
 CREATE TABLE storage.objects (
   bucket_id text NOT NULL,
   name text NOT NULL
 );
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 `);
 const check=async()=>{
  const [catalog,bucket,policy,count]=await Promise.all([
   db.query(FISCAL_VAULT_CATALOG_SQL),
   db.query(FISCAL_VAULT_BUCKET_SQL,[FISCAL_VAULT_QUARANTINE_BUCKET]),
   db.query(FISCAL_VAULT_POLICY_COUNT_SQL),
   db.query(FISCAL_VAULT_OBJECT_COUNT_SQL,[FISCAL_VAULT_QUARANTINE_BUCKET])
  ]);
  return evaluateFiscalVaultCatalog(catalog.rows[0],bucket.rows[0]??null,
   policy.rows[0],count.rows[0]);
 };
 assert.equal((await check()).status,"not_provisioned");
 await db.query(`
 INSERT INTO storage.buckets(id,public,file_size_limit,allowed_mime_types)
 VALUES ($1,false,$2,ARRAY['application/octet-stream']::text[])
 `,[FISCAL_VAULT_QUARANTINE_BUCKET,FISCAL_VAULT_CIPHERTEXT_LIMIT]);
 assert.equal((await check()).status,"configured_unverified");
 await db.query("UPDATE storage.buckets SET public=true WHERE id=$1",
  [FISCAL_VAULT_QUARANTINE_BUCKET]);
 assert.equal((await check()).status,"unsafe_configuration");
 await db.query("UPDATE storage.buckets SET public=false WHERE id=$1",
  [FISCAL_VAULT_QUARANTINE_BUCKET]);
 await db.query("CREATE POLICY synthetic_unsafe ON storage.objects FOR SELECT USING (true)");
 assert.equal((await check()).status,"unsafe_configuration");
 await db.query("DROP POLICY synthetic_unsafe ON storage.objects");
 await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ($1,'synthetic-no-documents')",
  [FISCAL_VAULT_QUARANTINE_BUCKET]);
 assert.equal((await check()).status,"unsafe_configuration");
 console.log("FISCAL VAULT READINESS SQL ACCEPTANCE PASSED (disposable CI, rollback)");
}finally{
 await db.query("ROLLBACK").catch(()=>undefined);
 await db.end();
}
