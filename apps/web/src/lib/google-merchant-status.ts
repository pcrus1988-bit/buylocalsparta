import "server-only";

import { getGoogleMerchantAccessToken } from "./google-merchant-auth";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const PRODUCTS_API = "https://merchantapi.googleapis.com/products/v1";
const ACCOUNTS_API = "https://merchantapi.googleapis.com/accounts/v1";
const ACCOUNT_ID = "5849642952";
const DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/${process.env.GOOGLE_MERCHANT_DATA_SOURCE_ID?.trim() || "10734504819"}`;
const STATUS_SETTINGS_KEY = "merchant.google.status.v1";

type DestinationStatus = Readonly<{
  reportingContext?: string;
  approvedCountries?: readonly string[];
  pendingCountries?: readonly string[];
  disapprovedCountries?: readonly string[];
}>;

type ItemIssue = Readonly<{
  code?: string;
  severity?: string;
  resolution?: string;
  attribute?: string;
  reportingContext?: string;
  description?: string;
  detail?: string;
  applicableCountries?: readonly string[];
  documentation?: string;
}>;

type Product = Readonly<{
  name?: string;
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  dataSource?: string;
  productStatus?: Readonly<{
    destinationStatuses?: readonly DestinationStatus[];
    itemLevelIssues?: readonly ItemIssue[];
  }>;
}>;

type ProductPage = Readonly<{ products?: readonly Product[]; nextPageToken?: string }>;
type AccountIssue = Readonly<{
  name?: string;
  title?: string;
  severity?: string;
  detail?: string;
  documentationUri?: string;
  impactedDestinations?: readonly Readonly<{
    reportingContext?: string;
    impacts?: readonly Readonly<{ regionCode?: string; severity?: string }>[];
  }>[];
}>;
type AccountIssuePage = Readonly<{ accountIssues?: readonly AccountIssue[]; nextPageToken?: string }>;

function issueCode(name: string | undefined, fallback: string): string {
  const value = String(name ?? "").split("/").pop()?.trim();
  return value || fallback;
}

function destinationState(status: DestinationStatus | undefined, country = "GR"): "approved" | "pending" | "disapproved" | "unknown" {
  if (!status) return "unknown";
  if (status.disapprovedCountries?.includes(country)) return "disapproved";
  if (status.pendingCountries?.includes(country)) return "pending";
  if (status.approvedCountries?.includes(country)) return "approved";
  return "unknown";
}

async function apiJson<T>(token: string, url: URL | string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Merchant status request failed (${response.status}): ${(await response.text()).replace(/\s+/g, " ").slice(0, 700)}`);
  return await response.json() as T;
}

async function readStatusCursor(): Promise<string | null> {
  const result = await getProductionPostgresRuntime().nativePool.query<{ value: unknown }>(`SELECT s.value FROM system_settings s JOIN markets m ON m.id=s.market_id WHERE m.code='sparta' AND s.key=$1 LIMIT 1`, [STATUS_SETTINGS_KEY]);
  const value = result.rows[0]?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const cursor = (value as Record<string, unknown>).nextPageToken;
  return typeof cursor === "string" && cursor.trim() ? cursor : null;
}

async function writeStatusCursor(nextPageToken?: string): Promise<void> {
  const value = JSON.stringify({ nextPageToken: nextPageToken?.trim() || null, updatedAt: new Date().toISOString() });
  await getProductionPostgresRuntime().nativePool.query(`
    INSERT INTO system_settings(market_id,key,value,version,updated_by,updated_at)
    SELECT m.id,$1,$2::jsonb,1,NULL,now() FROM markets m WHERE m.code='sparta'
    ON CONFLICT(market_id,key) DO UPDATE SET value=excluded.value,version=system_settings.version+1,updated_at=now(),updated_by=NULL
  `,[STATUS_SETTINGS_KEY,value]);
}

async function persistProduct(product: Product): Promise<{ processed: number; approved: number; pending: number; disapproved: number }> {
  if (!product.offerId || product.contentLanguage !== "el" || product.feedLabel !== "GR" || product.dataSource !== DATA_SOURCE) return { processed: 0, approved: 0, pending: 0, disapproved: 0 };
  const pool = getProductionPostgresRuntime().nativePool;
  const variant = await pool.query<{ id: string }>(`SELECT id FROM public.canonical_variants WHERE public_id=$1 LIMIT 1`, [product.offerId]);
  const variantId = variant.rows[0]?.id;
  if (!variantId) return { processed: 0, approved: 0, pending: 0, disapproved: 0 };

  const destinations = product.productStatus?.destinationStatuses ?? [];
  const shopping = destinationState(destinations.find((d) => d.reportingContext === "SHOPPING_ADS"));
  const free = destinationState(destinations.find((d) => d.reportingContext === "FREE_LISTINGS"));
  const overall = shopping === "disapproved" || free === "disapproved" ? "disapproved" : shopping === "pending" || free === "pending" ? "pending" : shopping === "approved" || free === "approved" ? "approved" : "unknown";
  const sync = await pool.query<{ id: string }>(`
    INSERT INTO public.merchant_product_sync(canonical_variant_id,offer_id,merchant_account_id,data_source_name,content_language,feed_label,google_product_name,sync_status,merchant_processing_status,shopping_ads_status,free_listings_status,destination_statuses,last_status_check_at,updated_at)
    VALUES($1,$2,$3,$4,'el','GR',$5,'synced',$6,$7,$8,$9::jsonb,now(),now())
    ON CONFLICT(merchant_account_id,content_language,feed_label,offer_id) DO UPDATE SET canonical_variant_id=excluded.canonical_variant_id,data_source_name=excluded.data_source_name,google_product_name=excluded.google_product_name,merchant_processing_status=excluded.merchant_processing_status,shopping_ads_status=excluded.shopping_ads_status,free_listings_status=excluded.free_listings_status,destination_statuses=excluded.destination_statuses,last_status_check_at=now(),updated_at=now()
    RETURNING id
  `,[variantId,product.offerId,ACCOUNT_ID,DATA_SOURCE,product.name ?? null,overall,shopping,free,JSON.stringify(destinations)]);
  const syncId = sync.rows[0]!.id;
  const issues = product.productStatus?.itemLevelIssues ?? [];
  const seen: string[] = [];
  for (const raw of issues) {
    const code = raw.code?.trim() || "unknown_issue";
    const context = raw.reportingContext?.trim() || "";
    const attribute = raw.attribute?.trim() || "";
    const key = `${code}\u001f${context}\u001f${attribute}`;
    seen.push(key);
    await pool.query(`
      INSERT INTO public.merchant_product_issues(merchant_sync_id,canonical_variant_id,issue_code,severity,resolution,affected_attribute,reporting_context,description,detail,applicable_countries,documentation_url,last_seen_at,resolved_at,raw_issue_payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11,now(),NULL,$12::jsonb)
      ON CONFLICT(merchant_sync_id,issue_code,reporting_context,affected_attribute) DO UPDATE SET severity=excluded.severity,resolution=excluded.resolution,description=excluded.description,detail=excluded.detail,applicable_countries=excluded.applicable_countries,documentation_url=excluded.documentation_url,last_seen_at=now(),resolved_at=NULL,raw_issue_payload=excluded.raw_issue_payload
    `,[syncId,variantId,code,raw.severity ?? null,raw.resolution ?? null,attribute,context,raw.description ?? null,raw.detail ?? null,[...(raw.applicableCountries ?? [])],raw.documentation ?? null,JSON.stringify(raw)]);
  }
  const open = await pool.query<{ id: string; issue_code: string; reporting_context: string | null; affected_attribute: string | null }>(`SELECT id,issue_code,reporting_context,affected_attribute FROM public.merchant_product_issues WHERE merchant_sync_id=$1 AND resolved_at IS NULL`,[syncId]);
  const seenSet = new Set(seen);
  const resolvedIds = open.rows.filter((r) => !seenSet.has(`${r.issue_code}\u001f${r.reporting_context ?? ""}\u001f${r.affected_attribute ?? ""}`)).map((r) => r.id);
  if (resolvedIds.length) await pool.query(`UPDATE public.merchant_product_issues SET resolved_at=now() WHERE id=ANY($1::uuid[])`,[resolvedIds]);
  return { processed: 1, approved: overall === "approved" ? 1 : 0, pending: overall === "pending" ? 1 : 0, disapproved: overall === "disapproved" ? 1 : 0 };
}

async function reconcileAccountIssues(token: string): Promise<number> {
  const pool = getProductionPostgresRuntime().nativePool;
  const all: AccountIssue[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${ACCOUNTS_API}/accounts/${ACCOUNT_ID}/issues`);
    url.searchParams.set("page_size","1000");
    url.searchParams.set("language_code","el-GR");
    url.searchParams.set("time_zone.id","Europe/Athens");
    if (pageToken) url.searchParams.set("page_token",pageToken);
    const page = await apiJson<AccountIssuePage>(token,url);
    all.push(...(page.accountIssues ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  const seen: string[] = [];
  for (const raw of all) {
    const code = issueCode(raw.name, raw.title || "unknown_account_issue");
    seen.push(code);
    const destinations = [...new Set((raw.impactedDestinations ?? []).map((d) => d.reportingContext).filter((x): x is string => Boolean(x)))];
    const countries = [...new Set((raw.impactedDestinations ?? []).flatMap((d) => d.impacts ?? []).map((i) => i.regionCode).filter((x): x is string => Boolean(x)))];
    await pool.query(`
      INSERT INTO public.merchant_account_issues(merchant_account_id,issue_code,severity,description,affected_destinations,affected_countries,resolution,documentation_url,last_seen_at,resolved_at,raw_issue_payload)
      VALUES($1,$2,$3,$4,$5::text[],$6::text[],NULL,$7,now(),NULL,$8::jsonb)
      ON CONFLICT(merchant_account_id,issue_code) DO UPDATE SET severity=excluded.severity,description=excluded.description,affected_destinations=excluded.affected_destinations,affected_countries=excluded.affected_countries,documentation_url=excluded.documentation_url,last_seen_at=now(),resolved_at=NULL,raw_issue_payload=excluded.raw_issue_payload
    `,[ACCOUNT_ID,code,raw.severity ?? null,raw.detail ?? raw.title ?? null,destinations,countries,raw.documentationUri ?? null,JSON.stringify(raw)]);
  }
  await pool.query(`UPDATE public.merchant_account_issues SET resolved_at=now() WHERE merchant_account_id=$1 AND resolved_at IS NULL AND NOT(issue_code=ANY($2::text[]))`,[ACCOUNT_ID,seen.length ? seen : ["__none__"]]);
  return all.length;
}

export async function reconcileGoogleMerchantStatus(): Promise<Readonly<{ status: "reconciled" | "skipped"; processed: number; approved: number; pending: number; disapproved: number; accountIssues: number; nextPage: boolean }>> {
  if (!productionDatabaseConfigured()) return { status: "skipped", processed: 0, approved: 0, pending: 0, disapproved: 0, accountIssues: 0, nextPage: false };
  const token = await getGoogleMerchantAccessToken();
  const cursor = await readStatusCursor();
  const url = new URL(`${PRODUCTS_API}/accounts/${ACCOUNT_ID}/products`);
  url.searchParams.set("pageSize","1000");
  if (cursor) url.searchParams.set("pageToken",cursor);
  const page = await apiJson<ProductPage>(token,url);
  let processed = 0, approved = 0, pending = 0, disapproved = 0;
  for (const product of page.products ?? []) {
    const result = await persistProduct(product);
    processed += result.processed; approved += result.approved; pending += result.pending; disapproved += result.disapproved;
  }
  await writeStatusCursor(page.nextPageToken);
  const accountIssues = await reconcileAccountIssues(token);
  await getProductionPostgresRuntime().nativePool.query(`INSERT INTO public.merchant_sync_runs(run_type,status,processed_count,approved_count,pending_count,disapproved_count,metadata,finished_at) VALUES('status_reconciliation','synced',$1,$2,$3,$4,$5::jsonb,now())`,[processed,approved,pending,disapproved,JSON.stringify({ accountIssues, nextPage: Boolean(page.nextPageToken) })]);
  return { status: "reconciled", processed, approved, pending, disapproved, accountIssues, nextPage: Boolean(page.nextPageToken) };
}
