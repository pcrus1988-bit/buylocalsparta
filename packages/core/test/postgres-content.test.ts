import test from "node:test";
import assert from "node:assert/strict";
import { PostgresContentRepository, type ContentPage, type SqlPool, type SqlQueryResult, type SqlRow } from "../src/index.ts";

class ContentClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM markets/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000001" }] as Row[] };
    if (/SELECT id::text AS id FROM users/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000002" }] as Row[] };
    if (/SELECT id::text AS id FROM vendor_businesses/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000004" }] as Row[] };
    if (/UPDATE merchant_stories/i.test(text) && /RETURNING id::text AS id/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000005" }] as Row[] };
    if (/RETURNING id::text AS id/i.test(text) && /cms_pages/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000003" }] as Row[] };
    return { rowCount: /^\s*(INSERT|UPDATE|DELETE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}
function pool(client: ContentClient): SqlPool { return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) }; }

const page: ContentPage = {
  id: "page-home", marketId: "sparta", pageType: "home", slug: "", status: "published", version: 2,
  translations: { el: { locale: "el", title: "Αρχική", seo: { title: "Buy Local Sparta", description: "Η τοπική αγορά της Σπάρτης." }, blocks: [{ id: "hero", type: "hero", data: { heading: "Βρες το τοπικά" } }] } },
  publishedAt: 200, createdAt: 100, updatedAt: 200, createdBy: "user-admin", updatedBy: "user-admin"
};

test("Postgres CMS persistence is platform-scoped and writes translation plus append-only revision", async () => {
  const client = new ContentClient();
  const repo = new PostgresContentRepository(pool(client));
  await repo.savePage({ scope: { actorUserId: "user-admin", marketId: "sparta", platformAccess: true }, page, revisionReason: "publish homepage" });
  assert.equal(client.calls.some((call) => /INSERT INTO cms_pages/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO cms_page_translations/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO cms_page_revisions/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => call.params.includes("app.platform_access") && call.params.includes("true")), true);
});

test("Postgres navigation uses market UUID resolution and JSON menu storage", async () => {
  const client = new ContentClient();
  const repo = new PostgresContentRepository(pool(client));
  await repo.saveNavigation({ scope: { actorUserId: "user-admin", platformAccess: true }, menu: { id: "nav-main", marketId: "sparta", key: "primary", locale: "el", version: 1, items: [{ id: "shop", label: "Αγορά", href: "/el/shop" }], updatedAt: 200, updatedBy: "user-admin" } });
  const call = client.calls.find((item) => /INSERT INTO cms_navigation_menus/i.test(item.text));
  assert.ok(call);
  assert.equal(String(call?.params[6]).includes("Αγορά"), true);
});


test("Postgres merchant-story approval uses vendor RLS scope rather than platform bypass", async () => {
  const client = new ContentClient();
  const repo = new PostgresContentRepository(pool(client));
  await repo.approveStory({ scope: { requestId: "req-story" }, storyId: "story-demo", vendorId: "vendor-demo", actorUserId: "user-vendor-owner", now: 300 });
  assert.equal(client.calls.some((call) => call.params.includes("app.vendor_id") && call.params.includes("vendor-demo")), true);
  assert.equal(client.calls.some((call) => call.params.includes("app.platform_access") && call.params.includes("false")), true);
  const approval = client.calls.find((call) => /UPDATE merchant_stories/i.test(call.text));
  assert.ok(approval);
  assert.equal(approval?.params[2], "story-demo");
});
