import {FISCAL_SUPABASE_ROOT_CA} from "./fiscal-supabase-root-ca.ts";

type FiscalPgSsl = {ca:string;rejectUnauthorized:true;servername:string};
export type FiscalPgConnectionOptions = {connectionString:string;ssl?:FiscalPgSsl};

/**
 * Supabase's shared Supavisor pooler presents a certificate signed by the
 * Supabase Root 2021 CA rather than a general system CA.
 *
 * Preserve both encryption and CA/hostname verification, including when a URL
 * came from Supabase Connect with ?sslmode=require. pg-connection-string's SSL
 * query parsing can override an explicitly supplied ssl object: remove its
 * SSL-specific URL parameters before passing an explicit verified TLS context.
 *
 * Local disposable CI PostgreSQL keeps its original connection handling.
 */
export function fiscalPgConnectionOptions(address:string):FiscalPgConnectionOptions {
  const url=new URL(address);
  if(!["postgresql:","postgres:"].includes(url.protocol))
    throw new Error("FISCAL_DATABASE_URL_INVALID_SCHEME");

  const hostname=url.hostname.toLowerCase();
  if(!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(hostname))
    return {connectionString:address};

  // Drop URL-level SSL options: node-postgres prioritizes them over config.ssl.
  for(const parameter of [
    "sslmode","ssl","sslcert","sslkey","sslrootcert","sslpassword","uselibpqcompat"
  ])url.searchParams.delete(parameter);

  return {
    connectionString:url.toString(),
    ssl:{
      ca:FISCAL_SUPABASE_ROOT_CA,
      rejectUnauthorized:true,
      servername:hostname
    }
  };
}
