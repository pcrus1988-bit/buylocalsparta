/**
 * M34: LIVE READ-ONLY INVENTORY of the independently hosted FISCAL database's
 * storage catalog. No Storage API client, service-role credential, upload route,
 * read URL, background worker or bucket mutation exists in this module.
 *
 * Seeing a private empty bucket is only configuration evidence, NEVER
 * authorization to collect, store, view or release identity documents.
 */
// Resolve the server-only PG client only inside the protected live probe; this\n// keeps pure policy and SQL contract tests independent of the Next.js runtime.

export const FISCAL_VAULT_QUARANTINE_BUCKET="fiscal-kyb-quarantine";
export const FISCAL_VAULT_CIPHERTEXT_LIMIT=12*1024*1024;
export const FISCAL_VAULT_CIPHERTEXT_MIMES=Object.freeze(["application/octet-stream"] as const);

export const FISCAL_VAULT_CATALOG_SQL=`
 SELECT
  to_regclass('storage.buckets') IS NOT NULL AS has_buckets,
  to_regclass('storage.objects') IS NOT NULL AS has_objects,
  COALESCE((
   SELECT c.relrowsecurity FROM pg_class c
   WHERE c.oid=to_regclass('storage.objects')
  ),false) AS objects_rls_enabled
`;
export const FISCAL_VAULT_BUCKET_SQL=`
 SELECT public AS is_public,
        file_size_limit::text AS file_size_limit,
        allowed_mime_types
 FROM storage.buckets WHERE id=$1 LIMIT 1
`;
export const FISCAL_VAULT_OBJECT_COUNT_SQL=`
 SELECT count(*)::int AS item_count
 FROM storage.objects WHERE bucket_id=$1
`;
/* Deliberately strict: ANY policy may expand public access, even if a
 * policy currently appears to filter by another bucket. */
export const FISCAL_VAULT_POLICY_COUNT_SQL=`
 SELECT count(*)::int AS policy_count FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
`;

type RawCatalog=Readonly<{
 has_buckets:boolean;has_objects:boolean;objects_rls_enabled:boolean;
}>;
type RawBucket=Readonly<{
 is_public:boolean;file_size_limit:string|null;allowed_mime_types:string[]|null;
}>;
type RawCount=Readonly<{item_count:number}>;
type RawPolicy=Readonly<{policy_count:number}>;

export type FiscalVaultReadiness=Readonly<{
 status:"unavailable"|"not_provisioned"|"unsafe_configuration"|"configured_unverified";
 bucketExists:boolean;privateBucket:boolean;objectRlsEnabled:boolean;
 exactMimeAllowlist:boolean;boundedCiphertextSize:boolean;
 zeroAccessiblePolicies:boolean;quarantineEmpty:boolean;
 configurationMatchesPlan:boolean;
 storageExternallyVerified:false;managedKmsVerified:false;
 independentScannerVerified:false;immutableAuditVerified:false;
 lawfulRetentionVerified:false;
 acceptingUploads:false;acceptingBytes:false;canReadDocuments:false;
 legalIssuanceEnabled:false;
}>;

function frozen(
 status:FiscalVaultReadiness["status"],
 fields:Pick<FiscalVaultReadiness,
 "bucketExists"|"privateBucket"|"objectRlsEnabled"|"exactMimeAllowlist"|
 "boundedCiphertextSize"|"zeroAccessiblePolicies"|"quarantineEmpty">
):FiscalVaultReadiness{
 const configurationMatchesPlan=fields.bucketExists&&fields.privateBucket&&
  fields.objectRlsEnabled&&fields.exactMimeAllowlist&&
  fields.boundedCiphertextSize&&fields.zeroAccessiblePolicies&&
  fields.quarantineEmpty;
 return Object.freeze({
  status,...fields,configurationMatchesPlan,
  storageExternallyVerified:false as const,
  managedKmsVerified:false as const,independentScannerVerified:false as const,
  immutableAuditVerified:false as const,lawfulRetentionVerified:false as const,
  acceptingUploads:false as const,acceptingBytes:false as const,
  canReadDocuments:false as const,legalIssuanceEnabled:false as const
 });
}
const denied={
 bucketExists:false,privateBucket:false,objectRlsEnabled:false,
 exactMimeAllowlist:false,boundedCiphertextSize:false,
 zeroAccessiblePolicies:false,quarantineEmpty:false
} as const;

export function evaluateFiscalVaultCatalog(
 catalog:RawCatalog|null,
 bucket:RawBucket|null,
 policy:RawPolicy|null,
 count:RawCount|null
):FiscalVaultReadiness{
 if(!catalog||catalog.has_buckets!==true||catalog.has_objects!==true)
  return frozen("unavailable",denied);
 if(!bucket)
  return frozen("not_provisioned",{
   ...denied,objectRlsEnabled:catalog.objects_rls_enabled===true
  });
 const mime=bucket.allowed_mime_types;
 const size=bucket.file_size_limit;
 const fields={
  bucketExists:true,
  privateBucket:bucket.is_public===false,
  objectRlsEnabled:catalog.objects_rls_enabled===true,
  exactMimeAllowlist:Array.isArray(mime)&&mime.length===1&&
   mime[0]===FISCAL_VAULT_CIPHERTEXT_MIMES[0],
  boundedCiphertextSize:size===String(FISCAL_VAULT_CIPHERTEXT_LIMIT),
  zeroAccessiblePolicies:policy?.policy_count===0,
  quarantineEmpty:count?.item_count===0
 };
 return frozen(Object.values(fields).every(Boolean)?
  "configured_unverified":"unsafe_configuration",fields);
}

/** Runtime error details, bucket object names, secrets and client URLs
 * must never reach the admin page or logs. */
export async function getFiscalVaultLiveReadiness():Promise<FiscalVaultReadiness>{
 const {fiscalDatabaseConfigured,fiscalPool}=await import("./fiscal-runtime");
 if(!fiscalDatabaseConfigured())return frozen("unavailable",denied);
 try{
  const catalog=await fiscalPool().query<RawCatalog>(FISCAL_VAULT_CATALOG_SQL);
  const row=catalog.rows[0];
  if(!row||!row.has_buckets||!row.has_objects)
   return evaluateFiscalVaultCatalog(row??null,null,null,null);
  const [bucket,policies,objects]=await Promise.all([
   fiscalPool().query<RawBucket>(FISCAL_VAULT_BUCKET_SQL,
    [FISCAL_VAULT_QUARANTINE_BUCKET]),
   fiscalPool().query<RawPolicy>(FISCAL_VAULT_POLICY_COUNT_SQL),
   fiscalPool().query<RawCount>(FISCAL_VAULT_OBJECT_COUNT_SQL,
    [FISCAL_VAULT_QUARANTINE_BUCKET])
  ]);
  return evaluateFiscalVaultCatalog(row,bucket.rows[0]??null,
   policies.rows[0]??null,objects.rows[0]??null);
 }catch{
  return frozen("unavailable",denied);
 }
}
