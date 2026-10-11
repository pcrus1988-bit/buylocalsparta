import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validHubClaimWebsite, validHubClaimSocial } from "../apps/web/src/lib/hub-claim-fields.ts";
const read=(path:string)=>readFileSync(path,"utf8");
const canonicalIframeMigration=read("db/migrations/0437_hub_claim_website_embed.sql");
const schemaRuntime=read("packages/postgres-runtime/src/index.ts");
assert.ok(canonicalIframeMigration.includes("website_embed_enabled"),"Original iframe migration 0437 must be preserved");
assert.ok(schemaRuntime.includes("EXPECTED_SCHEMA_VERSION = 438"),"Rich CLAIM release must depend on version 438");

const files={
  migration:read("db/migrations/0438_hub_claim_profiles_media_inquiries.sql"),
  runtime:read("apps/web/src/lib/hub-claim-runtime.ts"),
  home:read("apps/web/src/app/vendor/claim/page.tsx"),
  public:read("apps/web/src/app/hubs/[hubSlug]/business/[id]/page.tsx"),
  editor:read("apps/web/src/components/HubClaimProfileEditor.tsx"),
  embed:read("apps/web/src/components/VendorExternalWebsiteFrame.tsx"),
  storage:read("apps/web/src/lib/hub-claim-media.ts"),
  upload:read("apps/web/src/app/api/hubs/claim/media/route.ts"),
  inquiry:read("apps/web/src/app/api/hubs/claim/inquiry/route.ts"),
  review:read("apps/web/src/app/admin/hubs/claim-media/page.tsx"),
  config:read("apps/web/next.config.ts"),
  preview:read("apps/web/src/app/admin/hubs/plan-preview/page.tsx")
};
for(const url of ["javascript:alert(1)","http://example.com","https://127.0.0.1/","https://192.168.0.1/","https://localhost/","https://admin:pw@example.com/","https://kontamou.site/","https://example.local","https://example.test","https://[::1]/"]){
  assert.equal(validHubClaimWebsite(url),undefined,"Unsafe iframe URL: "+url);
}
assert.equal(validHubClaimWebsite("https://www.example.org/shop"),"https://www.example.org/shop");
assert.equal(validHubClaimSocial("https://www.youtube.com/x","instagram"),undefined);
assert.equal(validHubClaimSocial("https://instagram.com/some-store","instagram"),"https://instagram.com/some-store");
const checks:Record<keyof typeof files,string[]>={
  migration:["CREATE TABLE IF NOT EXISTS public.hub_claim_profiles","CREATE TABLE IF NOT EXISTS public.hub_claim_media","CREATE TABLE IF NOT EXISTS public.hub_claim_inquiries","ENABLE ROW LEVEL SECURITY"],
  runtime:["h.owner_user_id IS NOT NULL","h.status='converted'","u.email_verified_at IS NOT NULL",'form.get("websiteEmbedEnabled") === "on"'],
  home:["HubClaimMediaUpload","listOwnedHubClaimInquiries"],
  public:["HubClaimInquiryForm","VendorExternalWebsiteFrame"],
  editor:['name="websiteEmbedEnabled"','name="openingHours"','name="description"'],
  embed:['setLoaded(true)','referrerPolicy="strict-origin-when-cross-origin"','sandbox='],
  storage:["PRIVATE_STORAGE_VERIFICATION_FAILED","CLAIM_GALLERY_LIMIT_FOUR","getHubClaimImageAccess"],
  upload:["assertCustomerCsrf","uploadOwnedHubClaimImage"],
  inquiry:["PostgresFixedWindowRateLimiter","INVALID_ORIGIN","body.consent"],
  review:["super_admin","assertAdminCsrf"],
  config:['source: "/hubs/:hubSlug/business/:id"',"CLAIM_EXTERNAL_FRAME_POLICY"],
  preview:["HubClaimProfileEditor profile={profile} preview"]
};
for(const [key,tokens] of Object.entries(checks)){
  for(const token of tokens)assert.ok(files[key as keyof typeof files].includes(token),key+": missing "+token);
}
assert.ok(!files.storage.includes("UPDATE vendor_businesses"),"CLAIM must not grant commerce");
console.log("CLAIM expanded profile, consent, iframe and media security checks passed.");
