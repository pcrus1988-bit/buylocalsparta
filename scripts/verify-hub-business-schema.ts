import assert from "node:assert/strict";
import { hubBusinessStructuredData, jsonLdSafe } from "../apps/web/src/lib/hub-business-structured-data.ts";

const url = "https://kontamou.site/hubs/sparti/business/example-shop";
const claimed = hubBusinessStructuredData({
  kind: "claimed",
  url,
  name: "Δοκιμαστικό Εμπορικό",
  addressLine: "Οδός Σπάρτης 12",
  postcode: "23100",
  city: "Σπάρτη",
  region: "Λακωνία",
  telephone: "+302731000000",
  website: "https://example.org/",
  instagramUrl: "javascript:alert(1)",
  gemiNumber: "123456789"
});
const claimPage = claimed["@graph"][0];
const claimBusiness = claimed["@graph"][1];
assert.equal(claimPage["@type"], "ProfilePage");
assert.equal(claimPage.mainEntity["@id"], url + "#business");
assert.equal(claimBusiness["@type"], "LocalBusiness");
assert.deepEqual(claimBusiness.address, {
  "@type": "PostalAddress",
  streetAddress: "Οδός Σπάρτης 12",
  addressLocality: "Σπάρτη",
  addressRegion: "Λακωνία",
  postalCode: "23100",
  addressCountry: "GR"
});
assert.deepEqual(claimBusiness.sameAs, ["https://example.org/"]);
assert.ok(!("lastReviewed" in claimBusiness));

const noAddress = hubBusinessStructuredData({
  kind: "claimed", url, name: "Κατάστημα", city: "Σπάρτη", postcode: "23100"
});
assert.equal(noAddress["@graph"][1]["@type"], "Organization");
assert.equal("address" in noAddress["@graph"][1], false);

const registry = hubBusinessStructuredData({
  kind: "unclaimed_registry", url, name: "Δημόσια Εταιρεία",
  city: "Σπάρτη", postcode: "23100",
  addressLine: "Φανταστική διεύθυνση 99",
  telephone: "+302731000000",
  gemiNumber: "123456789",
  reviewedAt: "2026-10-20"
});
assert.equal(registry["@graph"][1]["@type"], "Organization");
assert.equal("address" in registry["@graph"][1], false);
assert.equal("telephone" in registry["@graph"][1], false);
assert.equal(registry["@graph"][0].lastReviewed, "2026-10-20T00:00:00.000Z");
assert.equal(registry["@graph"][1].identifier?.value, "123456789");

const partner = hubBusinessStructuredData({
  kind: "verified_partner", url, name: "Συνεργάτης",
  addressLine: "Διεύθυνση", city: "Σπάρτη", postcode: "23100"
});
assert.equal(partner["@graph"][1]["@type"], "Organization");
assert.equal(partner["@graph"][0].lastReviewed, undefined);

assert.throws(() => hubBusinessStructuredData({
  kind: "claimed", url: "https://untrusted.example/business", name: "Επιχείρηση"
}), /HUB_SCHEMA_CANONICAL_INVALID/);
assert.throws(() => hubBusinessStructuredData({kind: "claimed", url, name: ""}), /HUB_SCHEMA_BUSINESS_NAME_REQUIRED/);
assert.ok(!jsonLdSafe({ description: "</script><script>" }).includes("</script>"));

console.log("Hub business JSON-LD: verified premises, directory-only organizations, review evidence, URL and HTML safety passed.");
