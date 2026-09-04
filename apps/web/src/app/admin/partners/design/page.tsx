import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminVendorDesignMediaClient } from "../../../../components/AdminVendorDesignMediaClient";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { createAdminVendorShop, adminVendorDesignWorkspace, setAdminVendorDesignDemoMode, updateAdminVendorDesign } from "../../../../lib/admin-vendor-design";
import { assertAdminCsrf, hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { mediaUploadMode } from "../../../../lib/media-upload-service";
import { adminVendorProfileMediaAssignments } from "../../../../lib/vendor-profile-media-service";

export const metadata: Metadata = { title: "Admin · Partner design", robots: { index: false, follow: false } };

type Search = Readonly<{ target?: string; created?: string; saved?: string; demo?: string }>;
const value = (entry: FormDataEntryValue | null) => typeof entry === "string" ? entry : "";

async function requireAdmin() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "vendor.manage")) redirect("/admin");
  return principal;
}

async function createShop(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, value(formData.get("csrfToken")));
  const result = await createAdminVendorShop(principal, {
    applicationId: value(formData.get("applicationId")),
    reason: value(formData.get("reason"))
  });
  revalidatePath("/admin/partners");
  revalidatePath("/admin/partners/design");
  revalidatePath("/admin/prospects");
  redirect(`/admin/partners/design?target=${encodeURIComponent(`shop:${result.vendorId}`)}&created=1`);
}

async function saveDesign(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, value(formData.get("csrfToken")));
  const vendorId = value(formData.get("vendorId"));
  await updateAdminVendorDesign(principal, {
    vendorId,
    tradingName: value(formData.get("tradingName")),
    shortDescription: value(formData.get("shortDescription")),
    story: value(formData.get("story")),
    locationName: value(formData.get("locationName")),
    addressLine1: value(formData.get("addressLine1")),
    addressLine2: value(formData.get("addressLine2")),
    locality: value(formData.get("locality")),
    postcode: value(formData.get("postcode")),
    phone: value(formData.get("phone")),
    publicEmail: value(formData.get("publicEmail")),
    reason: value(formData.get("reason"))
  });
  revalidatePath("/shops");
  revalidatePath(`/vendor/${encodeURIComponent(vendorId)}`);
  revalidatePath(`/demo/vendor/${encodeURIComponent(vendorId)}`);
  revalidatePath("/admin/partners/design");
  redirect(`/admin/partners/design?target=${encodeURIComponent(`shop:${vendorId}`)}&saved=1`);
}

async function toggleDemo(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, value(formData.get("csrfToken")));
  const vendorId = value(formData.get("vendorId"));
  const enabled = value(formData.get("enabled")) === "true";
  await setAdminVendorDesignDemoMode(principal, { vendorId, enabled, reason: value(formData.get("reason")) });
  revalidatePath(`/demo/vendor/${encodeURIComponent(vendorId)}`);
  revalidatePath("/admin/partners/design");
  redirect(`/admin/partners/design?target=${encodeURIComponent(`shop:${vendorId}`)}&demo=${enabled ? "on" : "off"}`);
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const principal = await requireAdmin();
  const [workspace, params] = await Promise.all([adminVendorDesignWorkspace(principal), searchParams]);
  const firstShop = workspace.shops[0];
  const firstApplication = workspace.unlinkedApplications[0];
  const fallbackTarget = firstShop ? `shop:${firstShop.id}` : firstApplication ? `application:${firstApplication.id}` : "";
  const target = params.target?.trim() || fallbackTarget;
  const [targetKind, targetId] = target.split(":", 2);
  const selectedShop = targetKind === "shop" ? workspace.shops.find((shop) => shop.id === targetId) : undefined;
  const selectedApplication = targetKind === "application" ? workspace.unlinkedApplications.find((application) => application.id === targetId) : undefined;
  const assignments = selectedShop ? await adminVendorProfileMediaAssignments(principal) : [];
  const canApproveMedia = hasAdminPermission(principal, "catalog.write");
  const publishedForSelected = selectedShop ? assignments.filter((item) => item.vendorId === selectedShop.id && item.publicationStatus === "published" && item.scanStatus === "clean" && item.rightsStatus === "approved" && item.moderationStatus === "approved").length : 0;

  return <main className="vendor-app admin-app admin-partner-design">
    <AdminWorkspaceHeader csrfToken={workspace.csrfToken} entityLabel={selectedShop?.tradingName ?? selectedApplication?.tradingName ?? "Partner design"} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Partners · Design</div>
        <h1>Vendor storefront design</h1>
        <p className="lead">Edit the customer-facing identity of any mapped prospect, onboarding shop or active partner from one place. The same approved assets feed LIVE and DEMO storefronts; creating a shop never activates or publishes the vendor.</p>
        <div className="hero-actions"><Link className="text-link" href="/admin/partners">← Partner operations</Link>{selectedShop && <Link className="button button-secondary" href={`/admin/partners/${encodeURIComponent(selectedShop.id)}`}>Partner record</Link>}</div>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Choose vendor" title="One selector for the full lifecycle" note="Research prospects already have a shop identity. Applications that do not yet have one appear as ‘shop not created’ and can be initialized here without changing their onboarding stage." />
      <form action="/admin/partners/design" method="get" className="admin-directory-filters">
        <label><span>Vendor / application</span><select name="target" defaultValue={target}>
          {workspace.shops.length > 0 && <optgroup label="Existing vendor shops">{workspace.shops.map((shop) => <option value={`shop:${shop.id}`} key={shop.id}>{shop.tradingName} · {shop.status}{shop.demoMode ? " · DEMO" : ""}</option>)}</optgroup>}
          {workspace.unlinkedApplications.length > 0 && <optgroup label="Applications without a shop">{workspace.unlinkedApplications.map((application) => <option value={`application:${application.id}`} key={application.id}>{application.tradingName} · {application.state} · SHOP NOT CREATED</option>)}</optgroup>}
        </select></label>
        <button className="button" type="submit">Open storefront</button>
      </form>
      {(params.created || params.saved || params.demo) && <div className="workspace-inline-note" role="status">{params.created ? "Vendor shop created. It remains non-public and non-active until the governed lifecycle allows activation." : params.saved ? "Storefront identity saved. LIVE/DEMO views now read the updated source data." : `DEMO mode turned ${params.demo}.`}</div>}
    </section>

    {!workspace.databaseConfigured ? <section className="shell vendor-section"><div className="workspace-inline-note">Production database is not configured, so partner design controls are unavailable.</div></section>
      : selectedApplication ? <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Shop creation" title={`Create the shop for ${selectedApplication.tradingName}`} note="This creates the vendor_businesses shop identity, its primary location and vendor-owner membership, then links it to the existing application. It does not advance the application, activate commerce or publish the directory profile." />
        <WorkspaceMetricStrip items={[
          { label: "Application", value: selectedApplication.state, tone: "attention" },
          { label: "Shop", value: "NOT CREATED", tone: "attention" },
          { label: "Public", value: "NO" },
          { label: "Commerce", value: "NO" }
        ]} />
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Legal name</strong><span>{selectedApplication.legalName}</span></div>
          <div className="workspace-compact-row"><strong>Trading name</strong><span>{selectedApplication.tradingName}</span></div>
          <div className="workspace-compact-row"><strong>Contact</strong><span>{selectedApplication.contactEmail}{selectedApplication.phone ? ` · ${selectedApplication.phone}` : ""}</span></div>
          <div className="workspace-compact-row"><strong>Address</strong><span>{selectedApplication.addressLine1} · {selectedApplication.postcode} Sparta</span></div>
        </div>
        <form action={createShop} className="workspace-tool-panel" style={{ marginTop: 20 }}>
          <input type="hidden" name="csrfToken" value={workspace.csrfToken} /><input type="hidden" name="applicationId" value={selectedApplication.id} />
          <div className="workspace-tool-body"><label>Audit reason<input name="reason" required minLength={3} maxLength={500} defaultValue="Create storefront identity for design and onboarding preparation" /></label><div className="workspace-action-bar"><span>The new shop starts hidden, DEMO off and commerce disabled.</span><button className="button" type="submit">Create vendor shop</button></div></div>
        </form>
      </section>
      : selectedShop ? <>
        <WorkspaceMetricStrip items={[
          { label: "Lifecycle", value: selectedShop.status, tone: selectedShop.status === "active" ? "positive" : "attention" },
          { label: "Public directory", value: selectedShop.publicDirectoryVisible ? "VISIBLE" : "HIDDEN", tone: selectedShop.publicDirectoryVisible ? "positive" : "default" },
          { label: "DEMO", value: selectedShop.demoMode ? "ON" : "OFF", tone: selectedShop.demoMode ? "attention" : "default" },
          { label: "Published media", value: publishedForSelected }
        ]} />

        <section className="shell vendor-section">
          <WorkspaceSectionHeading eyebrow="Preview" title="LIVE and DEMO use the same storefront identity" note="DEMO is a pre-live preview only. Active vendors use the LIVE storefront. Public-directory visibility is still controlled from the partner record and remains a separate publication decision." />
          <div className="workspace-action-bar">
            <span>{selectedShop.demoMode ? "DEMO is shareable now." : selectedShop.status === "active" ? "This is an active vendor; use the LIVE storefront." : "Enable DEMO to review this storefront before activation."}</span>
            <div className="workspace-action-buttons">
              {selectedShop.status === "active" && selectedShop.publicDirectoryVisible && <Link className="button" href={`/vendor/${encodeURIComponent(selectedShop.id)}`} target="_blank">Open LIVE storefront ↗</Link>}
              {selectedShop.demoMode && <Link className="button" href={`/demo/vendor/${encodeURIComponent(selectedShop.id)}`} target="_blank">Open DEMO storefront ↗</Link>}
              <Link className="button button-secondary" href={`/admin/partners/${encodeURIComponent(selectedShop.id)}/catalogue`}>Catalogue / DEMO products</Link>
            </div>
          </div>
          {(selectedShop.status !== "active" || selectedShop.demoMode) && <form action={toggleDemo} className="workspace-tool-panel">
            <input type="hidden" name="csrfToken" value={workspace.csrfToken} /><input type="hidden" name="vendorId" value={selectedShop.id} /><input type="hidden" name="enabled" value={selectedShop.demoMode ? "false" : "true"} />
            <div className="workspace-tool-body"><label>Audit reason<input name="reason" required minLength={3} maxLength={500} defaultValue={selectedShop.demoMode ? "End storefront demonstration" : "Enable storefront preview before activation"} /></label><div className="workspace-action-bar"><span>{selectedShop.demoMode ? "Turning DEMO off removes the shareable pre-live route." : "DEMO never enables checkout, orders, payments or stock reservations."}</span><button className="button button-secondary" type="submit">Turn DEMO {selectedShop.demoMode ? "off" : "on"}</button></div></div>
          </form>}
        </section>

        <section className="shell vendor-section section-tint">
          <WorkspaceSectionHeading eyebrow="Identity & public copy" title="Edit what the customer sees" note="Trading name, store contact/location and profile copy are shared storefront data. The short description and story power DEMO immediately and act as the live-storefront fallback until a separately governed Merchant Story is published." />
          <form action={saveDesign}>
            <input type="hidden" name="csrfToken" value={workspace.csrfToken} /><input type="hidden" name="vendorId" value={selectedShop.id} />
            <div className="workspace-form-grid">
              <label>Trading name<input name="tradingName" required minLength={2} maxLength={180} defaultValue={selectedShop.tradingName} /></label>
              <label>Store / location name<input name="locationName" maxLength={180} defaultValue={selectedShop.location?.name ?? selectedShop.tradingName} /></label>
              <label className="workspace-form-span-2">Short storefront introduction<textarea name="shortDescription" rows={3} maxLength={500} defaultValue={selectedShop.shortDescription ?? ""} placeholder="A concise customer-facing introduction to the shop" /></label>
              <label className="workspace-form-span-2">About / story<textarea name="story" rows={7} maxLength={5000} defaultValue={selectedShop.story ?? ""} placeholder="What should customers know about this business, its expertise and service?" /></label>
              <label>Address<input name="addressLine1" maxLength={240} defaultValue={selectedShop.location?.addressLine1 ?? ""} /></label>
              <label>Address line 2<input name="addressLine2" maxLength={240} defaultValue={selectedShop.location?.addressLine2 ?? ""} /></label>
              <label>Locality<input name="locality" maxLength={120} defaultValue={selectedShop.location?.locality ?? "Sparta"} /></label>
              <label>Postcode<input name="postcode" maxLength={20} defaultValue={selectedShop.location?.postcode ?? ""} /></label>
              <label>Public phone<input name="phone" maxLength={60} defaultValue={selectedShop.location?.phone ?? ""} /></label>
              <label>Public email<input name="publicEmail" type="email" maxLength={254} defaultValue={selectedShop.location?.publicEmail ?? ""} /></label>
              <label className="workspace-form-span-2">Audit reason<input name="reason" required minLength={3} maxLength={500} defaultValue="Update vendor storefront presentation" /></label>
            </div>
            <div className="workspace-action-bar"><span>Saving does not change lifecycle state, public visibility or commercial activation.</span><button className="button" type="submit">Save storefront identity</button></div>
          </form>
        </section>

        <section className="shell vendor-section">
          <AdminVendorDesignMediaClient csrfToken={workspace.csrfToken} vendorId={selectedShop.id} mediaUploadMode={mediaUploadMode()} assignments={assignments} canApprove={canApproveMedia} />
        </section>
      </> : <section className="shell vendor-section"><WorkspaceSectionHeading eyebrow="Partner design" title="No vendor records are available yet" note="Once a research prospect or application exists it will appear in the selector above." /></section>}
  </main>;
}
