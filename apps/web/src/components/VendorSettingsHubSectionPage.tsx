import type { VendorCapability } from "@buy-local-sparta/core";
import { redirect } from "next/navigation";
import { VendorHubControlsClient, type VendorHubControlSection } from "./VendorHubControlsClient";
import { VendorWorkspaceHeader } from "./VendorWorkspaceHeader";
import { vendorHubControlsWorkspace } from "../lib/vendor-hub-controls-service";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../lib/vendor-session";

type Props = Readonly<{
  section: VendorHubControlSection;
  capability: VendorCapability;
  eyebrow: string;
  title: string;
  description: string;
}>;

export async function VendorSettingsHubSectionPage({ section, capability, eyebrow, title, description }: Props) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");

  const context = await vendorOperatingContextForPrincipal(principal);
  if (!context.capabilities.includes(capability)) redirect("/vendor/settings");

  const workspace = await vendorHubControlsWorkspace(principal);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </div>
    </section>
    <VendorHubControlsClient initial={workspace} sections={[section]} />
  </main>;
}
