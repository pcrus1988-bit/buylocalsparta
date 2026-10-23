import assert from "node:assert/strict";
import { publicContentDates, publicLastReviewed } from "../apps/web/src/lib/public-seo-dates.ts";

const published = Date.parse("2026-10-08T07:00:00.000Z");
const revised = Date.parse("2026-10-20T15:30:00.000Z");
const now = Date.parse("2026-10-23T09:00:00.000Z");

assert.deepEqual(publicContentDates({
  status: "published", publishedAt: published, updatedAt: revised
}, now), {
  datePublished: "2026-10-08T07:00:00.000Z",
  dateModified: "2026-10-20T15:30:00.000Z"
});

assert.deepEqual(publicContentDates({
  status: "scheduled", scheduledAt: published, updatedAt: published - 1_000
}, now), {
  datePublished: "2026-10-08T07:00:00.000Z",
  dateModified: "2026-10-08T07:00:00.000Z"
});

assert.equal(publicContentDates({
  status: "draft", updatedAt: revised
}, now).datePublished, undefined);

assert.equal(publicContentDates({
  status: "published", publishedAt: 1_234, updatedAt: revised
}, now).datePublished, undefined);

assert.equal(publicContentDates({
  status: "published", publishedAt: now + 60_000_000, updatedAt: revised
}, now).datePublished, undefined);

assert.equal(publicLastReviewed("2026-10-20", now), "2026-10-20T00:00:00.000Z");
assert.equal(publicLastReviewed("2026-10-20T16:00:00+03:00", now), "2026-10-20T13:00:00.000Z");
assert.equal(publicLastReviewed("2027-10-20", now), undefined);
assert.equal(publicLastReviewed("not a date", now), undefined);
assert.equal(publicLastReviewed(undefined, now), undefined);

console.log("SEO public dates: published, updated, scheduled and reviewed evidence verified");
