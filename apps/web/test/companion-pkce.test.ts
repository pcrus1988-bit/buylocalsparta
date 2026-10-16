import assert from "node:assert/strict";
import test from "node:test";
import {COMPANION_CLIENT_ID,COMPANION_REDIRECT_URI,validClient,validState,
  validChallenge,challengeForVerifier,sessionToken
} from "../src/lib/companion-pkce.ts";

test("PKCE RFC 7636 S256 test vector",()=>{
 const verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
 assert.equal(challengeForVerifier(verifier),"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
 assert.ok(validChallenge(challengeForVerifier(verifier)));
});
test("only registered Companion app ID and redirect can receive a code",()=>{
 assert.equal(validClient(COMPANION_CLIENT_ID,COMPANION_REDIRECT_URI),true);
 assert.equal(validClient(COMPANION_CLIENT_ID,"https://example.com/collect"),false);
 assert.equal(validClient("evil-client",COMPANION_REDIRECT_URI),false);
});
test("reject weak, malformed or ambiguous challenges and states",()=>{
 assert.equal(validState("abcdefghijklmnopqrstuvwxyz"),true);
 assert.equal(validState("../evil"),false);
 assert.equal(validChallenge("a".repeat(43)),true);
 assert.equal(validChallenge("a".repeat(44)),false);
 assert.throws(()=>challengeForVerifier("short"));
 assert.throws(()=>challengeForVerifier("a".repeat(43)+"!"));
 assert.equal(sessionToken("x".repeat(43)),true);
 assert.equal(sessionToken("x".repeat(42)),false);
 assert.equal(sessionToken(null),false);
});
