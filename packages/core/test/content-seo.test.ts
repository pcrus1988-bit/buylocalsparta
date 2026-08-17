import test from "node:test";
import assert from "node:assert/strict";
import {
  ContentService,
  articleStructuredData,
  breadcrumbStructuredData,
  contentSitemap,
  localBusinessStructuredData,
  productStructuredData,
  seoForPage,
  type ContentTranslation
} from "../src/index.ts";

function greek(blocks = [{ id: "hero", type: "hero" as const, data: { heading: "Αγόρασε τοπικά" } }]): ContentTranslation {
  return { locale: "el", title: "Αρχική", seo: { title: "Buy Local Sparta", description: "Τοπικά καταστήματα και προϊόντα στη Σπάρτη." }, blocks };
}

function english(): ContentTranslation {
  return { locale: "en", title: "Home", seo: { title: "Buy Local Sparta", description: "Local shops and products in Sparta." }, blocks: [{ id: "hero-en", type: "hero", data: { heading: "Shop local" } }] };
}

test("CMS requires Greek first-class content and keeps immutable page revisions", () => {
  const cms = new ContentService();
  assert.throws(() => cms.createPage({ marketId: "sparta", pageType: "home", slug: "", translations: [english()], actorId: "admin", now: 100 }), /Greek content/);
  const page = cms.createPage({ marketId: "sparta", pageType: "home", slug: "", translations: [greek(), english()], actorId: "admin", now: 100 });
  assert.equal(page.status, "draft");
  assert.equal(cms.revisions(page.id).length, 1);
  const updated = cms.updatePage({ pageId: page.id, translations: [greek([{ id: "hero-v2", type: "hero", data: { heading: "Η ψηφιακή αγορά της Σπάρτης" } }]), english()], actorId: "editor", reason: "refine hero", now: 200 });
  assert.equal(updated.version, 2);
  assert.equal(cms.revisions(page.id).length, 2);
  const published = cms.publishPage({ pageId: page.id, actorId: "editor", now: 300 });
  assert.equal(published.status, "published");
  assert.equal(cms.publicPage({ marketId: "sparta", slug: "", locale: "el", now: 301 })?.translation.title, "Αρχική");
  assert.equal(cms.revisions(page.id).at(-1)?.reason, "page published");
});

test("scheduled pages remain private until publication time and scheduler can release them", () => {
  const cms = new ContentService();
  const page = cms.createPage({ marketId: "sparta", pageType: "landing", slug: "back-to-school", translations: [greek()], actorId: "admin", now: 100 });
  cms.publishPage({ pageId: page.id, actorId: "admin", now: 150, scheduledAt: 500 });
  assert.equal(cms.publicPage({ marketId: "sparta", slug: "back-to-school", locale: "el", now: 499 }), undefined);
  assert.ok(cms.publicPage({ marketId: "sparta", slug: "back-to-school", locale: "el", now: 500 }));
  const released = cms.releaseScheduled(501);
  assert.equal(released.length, 1);
  assert.equal(cms.page(page.id)?.status, "published");
});

test("navigation validates safe links and redirects reject loops", () => {
  const cms = new ContentService();
  assert.throws(() => cms.setNavigation({ marketId: "sparta", key: "primary", locale: "el", items: [{ id: "bad", label: "Bad", href: "javascript:alert(1)" }], actorId: "admin", now: 100 }), /internal or HTTPS/);
  const menu = cms.setNavigation({ marketId: "sparta", key: "primary", locale: "el", items: [{ id: "shop", label: "Αγορά", href: "/el/shop" }, { id: "advice", label: "Συμβουλή", href: "/el/advice" }], actorId: "admin", now: 110 });
  assert.equal(menu.version, 1);
  assert.equal(cms.navigation("sparta", "primary", "en")?.locale, "el");
  cms.addRedirect({ marketId: "sparta", fromPath: "/old", toPath: "/new", actorId: "admin", now: 120 });
  assert.throws(() => cms.addRedirect({ marketId: "sparta", fromPath: "/new", toPath: "/old", actorId: "admin", now: 121 }), /loop/);
});

test("merchant stories require the actual vendor approval before platform publication", () => {
  const cms = new ContentService();
  const story = cms.createStory({ marketId: "sparta", vendorId: "vendor-a", slug: "meet-eleni", locale: "el", title: "Γνωρίστε την Ελένη", excerpt: "Η ιστορία ενός τοπικού καταστήματος.", blocks: [{ id: "story-body", type: "shop_story", data: { text: "Αληθινή τοπική γνώση." } }], seo: { title: "Γνωρίστε την Ελένη", description: "Η ιστορία του τοπικού καταστήματος." }, authorLabel: "Buy Local Sparta editorial", now: 100 });
  cms.requestStoryApproval(story.id, 110);
  assert.throws(() => cms.approveStory({ storyId: story.id, vendorId: "vendor-b", actorId: "owner-b", now: 120 }), /another vendor/);
  assert.throws(() => cms.publishStory({ storyId: story.id, actorId: "editor", now: 130 }), /vendor approval/);
  cms.approveStory({ storyId: story.id, vendorId: "vendor-a", actorId: "owner-a", now: 140 });
  const published = cms.publishStory({ storyId: story.id, actorId: "editor", now: 150 });
  assert.equal(published.status, "published");
  assert.equal(cms.stories({ vendorId: "vendor-a", status: "published" }).length, 1);
});

test("SEO output preserves canonical locale URLs, noindex rules and structured seller identity", () => {
  const cms = new ContentService();
  const page = cms.createPage({ marketId: "sparta", pageType: "home", slug: "", translations: [greek(), english()], actorId: "admin", now: 100 });
  const published = cms.publishPage({ pageId: page.id, actorId: "admin", now: 200 });
  const seo = seoForPage({ origin: "https://buylocal.example", page: published, translation: published.translations.el!, locale: "el" });
  assert.equal(seo.canonicalUrl, "https://buylocal.example/el");
  assert.equal(seo.alternates.en, "https://buylocal.example/en");
  const sitemap = contentSitemap({ pages: cms.pages(), now: 201 });
  assert.deepEqual(sitemap.map((item) => item.path), ["/el", "/en"]);

  const product = productStructuredData({ url: "https://buylocal.example/el/product/a", name: "AirPods", priceMinor: 12900, currency: "EUR", available: true, sellerName: "Buy Local Sparta", fulfillerName: "Demo Local Shop" });
  assert.equal((product.offers as any).seller.name, "Buy Local Sparta");
  assert.equal((product.additionalProperty as any[])[0].value, "Demo Local Shop");
  const local = localBusinessStructuredData({ url: "https://buylocal.example/el/shops/a", name: "Demo Shop", address: { streetAddress: "Demo 1", postalCode: "23100", addressLocality: "Sparta" } });
  assert.equal((local.address as any).addressCountry, "GR");
  const article = articleStructuredData({ url: "https://buylocal.example/el/stories/a", headline: "Story", description: "Description", datePublished: 100, dateModified: 200, authorName: "Demo Shop", publisherName: "Buy Local Sparta" });
  assert.equal(article["@type"], "Article");
  assert.equal((breadcrumbStructuredData([{ name: "Home", url: "/el" }, { name: "Story", url: "/el/stories/a" }]).itemListElement as any[]).length, 2);
});

test("curated collections operate on unique canonical products and publish independently from vendor offers", () => {
  const cms = new ContentService();
  assert.throws(() => cms.createCollection({ marketId: "sparta", slug: "today", locale: "el", title: "Σήμερα", canonicalVariantIds: ["cv-a", "cv-a"], seo: { title: "Σήμερα", description: "Διαθέσιμα σήμερα στη Σπάρτη." }, actorId: "editor", now: 100 }), /duplicate canonical/);
  const collection = cms.createCollection({ marketId: "sparta", slug: "today", locale: "el", title: "Διαθέσιμα σήμερα", canonicalVariantIds: ["cv-a", "cv-b"], seo: { title: "Διαθέσιμα σήμερα", description: "Τοπικά προϊόντα διαθέσιμα σήμερα στη Σπάρτη." }, actorId: "editor", now: 100 });
  assert.equal(collection.status, "draft");
  assert.equal(cms.publishCollection({ collectionId: collection.id, actorId: "editor", now: 200 }).status, "published");
});
