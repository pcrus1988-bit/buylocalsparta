import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseStaffInviteCreate,parseStaffInviteRevoke,parseStaffInviteClaim} from "../src/lib/drinkstock-staff-invite-policy.ts";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const data={email:"bartender@venue.gr",bar:true,waiter:false,requestKey:"6ebecae3-f120-4a4e-a3f9-91dc121a53d2"};
test("only explicit bounded email and at least one station can be invited",()=>{
 assert.deepEqual(parseStaffInviteCreate({...data,email:"  BARTENDER@Venue.GR  "}),data);
 for(const x of [
  {...data,bar:false},{...data,bar:"yes"},{...data,waiter:"no"},
  {...data,requestKey:"oops"},{...data,email:"invalid"},
  {...data,email:"a".repeat(255)+"@example.com"},
  {...data,admin:true},null,[],{...data,role:"manager"},
 ])assert.throws(()=>parseStaffInviteCreate(x),/INVALID_STAFF_INVITE/);
 assert.equal(parseStaffInviteCreate({...data,bar:false,waiter:true}).waiter,true);
});
test("revoke and claim cannot accept extra fields or malformed IDs and tokens",()=>{
 const good={invitationId:"6ebecae3-f120-4a4e-a3f9-91dc121a53d2"};
 assert.deepEqual(parseStaffInviteRevoke(good),good);
 assert.throws(()=>parseStaffInviteRevoke({...good,partnerId:"bad"}),/INVALID_STAFF_REVOKE/);
 assert.throws(()=>parseStaffInviteRevoke({invitationId:"bad"}),/INVALID_STAFF_REVOKE/);
 const token="a".repeat(43);
 assert.deepEqual(parseStaffInviteClaim({token}),{token});
 for(const bad of [{token:"weak"},{token:"a".repeat(64)},{token,skipVerification:true},null])
  assert.throws(()=>parseStaffInviteClaim(bad),/INVALID_STAFF_CLAIM/);
});
test("invite database stores SHA256 digests, not bearer token, and RLS is private",()=>{
 const schema=read("../../../db/operations/20261020_drinkstock_staff_invitation_claims.sql");
 assert.match(schema,/token_sha256 char\(64\) NOT NULL UNIQUE/);
 assert.match(schema,/UNIQUE\(venue_id,request_key\)/);
 assert.match(schema,/FOREIGN KEY\(venue_id,partner_id\)/);
 assert.match(schema,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(schema,/REVOKE ALL ON public\.drinkstock_staff_invitations/);
 assert.match(schema,/drinkstock_staff_invitation_events/);
});
test("single-use claim requires real email-verified customer account and never grants manager",()=>{
 const src=read("../src/lib/drinkstock-staff-invite-service.ts");
 assert.match(src,/randomBytes\(32\)\.toString\("base64url"\)/);
 assert.match(src,/createHash\("sha256"\)/);
 assert.match(src,/u\.email_verified_at IS NOT NULL/);
 assert.match(src,/u\.closed_at IS NULL/);
 assert.match(src,/public\.customer_profiles/);
 assert.match(src,/invite\.email\.toLowerCase\(\)!==acceptedBy\.email\.toLowerCase\(\)/);
 assert.match(src,/accepted_at IS NULL AND revoked_at IS NULL/);
 assert.match(src,/INSERT INTO public\.hospitality_partner_memberships/);
 assert.match(src,/VALUES\(\$1::uuid,\$2,'staff','active'\)/);
 assert.doesNotMatch(src,/VALUES\(\$1::uuid,\$2,'owner','active'\)/);
 assert.match(src,/INSERT INTO public\.drinkstock_venue_staff_stations/);
 assert.match(src,/STATION_FORBIDDEN|VENUE_NOT_ACTIVE|MEMBERSHIP_REVIEW_REQUIRED/);
 assert.match(src,/FOR UPDATE OF v/);
 assert.match(src,/FOR UPDATE OF i/);
});
test("admin-only manager APIs use CSRF and invited accounts use their own identity",()=>{
 const manager=read("../src/app/api/hospitality/partners/[partnerId]/venues/[venueId]/staff-invites/route.ts");
 assert.match(manager,/hospitalityIdentity\(\)/);
 assert.match(manager,/assertCustomerCsrf/);
 assert.match(manager,/pendingVenueInvites/);
 assert.match(manager,/createVenueStaffInvite/);
 assert.match(manager,/revokeVenueStaffInvite/);
 assert.match(manager,/req\.headers\.get\("origin"\)/);
 const claim=read("../src/app/api/hospitality/staff-invites/claim/route.ts");
 assert.match(claim,/hospitalityIdentity\(\)/);
 assert.match(claim,/assertCustomerCsrf/);
 assert.match(claim,/claimVenueStaffInvite/);
 const page=read("../src/app/hospitality/drinkStock/staff/invite/[token]/page.tsx");
 assert.match(page,/name="referrer" content="no-referrer"/);
});
test("a staff membership alone grants no venue without assigned station",()=>{
 const access=read("../src/lib/hospitality-partner-access.ts");
 assert.match(access,/m\.role<>'staff' OR EXISTS/);
 assert.match(access,/public\.drinkstock_venue_staff_stations/);
 const market=read("../src/lib/drinkstock-market-service.ts");
 assert.match(market,/m\.role<>'staff' OR EXISTS/);
 const session=read("../src/lib/drinkstock-session-service.ts");
 assert.match(session,/m\.role<>'staff' OR EXISTS/);
 const partner=read("../src/app/hospitality/drinkStock/dashboard/[partnerId]/page.tsx");
 assert.match(partner,/venue\.barAssigned/);
 assert.match(partner,/venue\.waiterAssigned/);
});
