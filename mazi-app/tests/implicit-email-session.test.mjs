import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { implicitEmailSession } from "../lib/implicit-email-session.ts";

const good = "#access_token=header.payload.signature&refresh_token=a_valid_refresh_token&token_type=bearer&expires_in=3600";

test("older implicit magic links can complete through browser cookie session", () => {
  assert.deepEqual(implicitEmailSession(good), {
    access_token: "header.payload.signature",
    refresh_token: "a_valid_refresh_token",
  });
});

test("missing, expired, error or malformed fragments are rejected", () => {
  for (const fragment of [
    "", "#", "#error=access_denied&error_code=otp_expired",
    "#access_token=abc&token_type=bearer",
    "#refresh_token=xyz&token_type=bearer",
    "#access_token=abc&refresh_token=xyz&token_type=mac",
    "#access_token=a%20b&refresh_token=xyz&token_type=bearer",
    "#access_token=a&refresh_token=b#extra&token_type=bearer",
    "#access_token=" + "x".repeat(12001),
  ]) assert.equal(implicitEmailSession(fragment), null);
});

test("redirect and client completion do not disclose fragment tokens to another origin", () => {
  const route = readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
  const finish = readFileSync(new URL("../app/auth/finish/finish-magic-link.tsx", import.meta.url), "utf8");
  assert.match(route, /new URL\("\/auth\/finish", ORIGIN\)/);
  assert.match(route, /new URL\(path \+ "#", ORIGIN\)/);
  assert.match(finish, /window\.history\.replaceState\(window\.history\.state, "", "\/auth\/finish"\)/);
  assert.ok(finish.indexOf("replaceState") < finish.indexOf("createBrowserClient"),
    "fragment must be erased before the Supabase browser client initializes");
  assert.match(finish, /auth\.auth\.setSession\(credentials\)/);
  assert.match(finish, /window\.location\.replace\("\/members"\)/);
});
