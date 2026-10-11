/**
 * Safe, non-sensitive diagnostics for independent FISCAL PostgreSQL connections.
 * Never return a DSN, hostname, username, password, port string from user input,
 * query parameters, or a raw parser/database error.
 * The profile is an allowlisted category only, suitable for server-side logs.
 */
export type FiscalConnectionProfile =
  | "missing"
  | "malformed_uri"
  | "shared_transaction_pooler"
  | "shared_pooler_wrong_port_or_user"
  | "dedicated_pooler_ipv6_risk"
  | "supabase_direct_connection"
  | "unrecognized_connection";

export function classifyFiscalConnectionProfile(raw:string|undefined):FiscalConnectionProfile {
  if(!raw?.trim())return "missing";
  try {
    const url=new URL(raw.trim());
    if(!["postgres:","postgresql:"].includes(url.protocol))
      return "malformed_uri";
    if(!url.hostname||!url.pathname||url.pathname==="/")
      return "malformed_uri";

    const host=url.hostname.toLowerCase();
    const port=url.port||"5432";
    const poolerUser=/^postgres\.[a-z0-9]{10,40}$/i.test(decodeURIComponent(url.username));
    if(host.endsWith(".pooler.supabase.com")){
      return port==="6543"&&poolerUser
        ? "shared_transaction_pooler":"shared_pooler_wrong_port_or_user";
    }

    if(/^db\.[a-z0-9]+\.supabase\.co$/.test(host)){
      // Dedicated pooler on 6543 usually requires IPv6 connectivity.
      // Do not assume this hostname is a shared IPv4-compatible pooler.
      return port==="6543"?"dedicated_pooler_ipv6_risk":"supabase_direct_connection";
    }
    return "unrecognized_connection";
  }catch{return "malformed_uri";}
}
