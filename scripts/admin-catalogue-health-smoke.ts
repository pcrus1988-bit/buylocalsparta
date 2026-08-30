import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCatalogueOverviewWorkspace } from "../apps/web/src/lib/admin-catalogue-overview-runtime.ts";
import { getProductionPostgresRuntime } from "../apps/web/src/lib/postgres-runtime.ts";

const principal: SessionPrincipal = {
  sessionId: "ci-admin-catalogue-health",
  userId: "ci-admin-catalogue-health",
  email: "ci-admin-catalogue-health@example.test",
  roles: ["super_admin"],
  csrfToken: "ci-csrf-token"
};

try {
  const workspace = await adminCatalogueOverviewWorkspace(principal);
  assert(workspace.health.available, "PostgreSQL catalogue health must report itself as available");
  assert(workspace.metrics.totalProducts >= workspace.metrics.liveProducts, "live canonical products cannot exceed total canonical products");
  assert(workspace.health.sourceProducts >= workspace.health.unlinkedSourceProducts, "unlinked source products cannot exceed source products");
  assert(workspace.health.attributeObservations >= workspace.health.mappedAttributeObservations, "mapped observations cannot exceed all attribute observations");
  assert(workspace.health.attributeObservations >= workspace.health.unmappedAttributeObservations, "unmapped observations cannot exceed all attribute observations");
  assert(workspace.health.attributeObservations >= workspace.health.reviewRequiredAttributeObservations, "review-required observations cannot exceed all attribute observations");
  assert(workspace.health.icecatSourceProducts >= workspace.health.icecatGreekReadySourceProducts, "Greek-ready Icecat evidence cannot exceed Icecat source products");

  for (const category of workspace.categories) {
    assert(category.subtreeProducts >= category.directProducts, `category ${category.categoryCode} subtree products must include direct products`);
    assert(category.subtreeLiveProducts >= category.directLiveProducts, `category ${category.categoryCode} subtree live products must include direct live products`);
    assert(category.subtreeIcecatLinkedProducts >= category.directIcecatLinkedProducts, `category ${category.categoryCode} subtree Icecat links must include direct links`);
    assert(category.subtreeIcecatGreekReadyProducts >= category.directIcecatGreekReadyProducts, `category ${category.categoryCode} subtree Greek-ready Icecat count must include direct count`);
    assert(category.subtreeAttributeObservations >= category.directAttributeObservations, `category ${category.categoryCode} subtree attribute evidence must include direct evidence`);
  }

  console.log(JSON.stringify({
    ok: true,
    categories: workspace.metrics.totalCategories,
    canonicalProducts: workspace.metrics.totalProducts,
    sourceProducts: workspace.health.sourceProducts,
    unlinkedSourceProducts: workspace.health.unlinkedSourceProducts,
    attributeObservations: workspace.health.attributeObservations,
    unmappedAttributes: workspace.health.unmappedAttributeObservations,
    reviewRequiredAttributes: workspace.health.reviewRequiredAttributeObservations,
    icecatSourceProducts: workspace.health.icecatSourceProducts,
    icecatGreekReadySourceProducts: workspace.health.icecatGreekReadySourceProducts,
    icecatQueue: workspace.health.icecatQueued
  }));
} finally {
  await getProductionPostgresRuntime().close();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
