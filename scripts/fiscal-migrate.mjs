// Run ONLY with FISCAL_DATABASE_URL, after provisioning a separate Fiscal database.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
const url=process.env.FISCAL_DATABASE_URL;
if(!url)throw new Error("FISCAL_DATABASE_URL required");
function identity(raw){const u=new URL(raw);return [u.hostname.toLowerCase(),u.port||"5432",decodeURIComponent(u.pathname).replace(/\/+$/,"")].join("|");}
if([process.env.DATABASE_URL,process.env.POSTGRES_URL].filter(Boolean).some(x=>identity(x)===identity(url)))throw new Error("Cannot migrate the marketplace database");
const db=new pg.Client({connectionString:url,connectionTimeoutMillis:5000,application_name:"konta-moy-fiscal-migration"});
await db.connect();
try{
 await db.query("SELECT pg_advisory_lock(80411, 102)");
 for(const name of (await readdir(resolve("fiscal/migrations"))).filter(x=>/^[0-9]+_[a-z0-9_]+\.sql$/.test(x)).sort()){
  const source=await readFile(resolve("fiscal/migrations",name),"utf8");
  const hash=createHash("sha256").update(source).digest("hex");
  const table=await db.query("SELECT to_regclass('public.fiscal_schema_migrations') AS name");
  const previous=table.rows[0].name ? await db.query("SELECT sha256 FROM fiscal_schema_migrations WHERE name=$1",[name]):{rows:[]};
  if(previous.rows[0]){
   if(previous.rows[0].sha256!==hash)throw new Error("Fiscal migration checksum mismatch: "+name);
   console.log("verified",name);continue;
  }
  // SQL files have legacy outer BEGIN/COMMIT wrappers. Execute their bodies
  // in a transaction which also records the checksum, never separately.
  // This prevents a partially applied version from lacking migration history.
  const envelope=source.match(/^\s*BEGIN;\s*([\s\S]*?)\s*COMMIT;\s*$/i);
  if(!envelope)throw new Error("Fiscal migration must have BEGIN/COMMIT envelope: "+name);
  await db.query("BEGIN");
  try{
   await db.query(envelope[1]);
   await db.query("INSERT INTO fiscal_schema_migrations(name,sha256) VALUES($1,$2)",[name,hash]);
   await db.query("COMMIT");
  }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}
  console.log("applied",name);
 }
}finally{
 await db.query("SELECT pg_advisory_unlock(80411, 102)").catch(()=>{});
 await db.end();
}
