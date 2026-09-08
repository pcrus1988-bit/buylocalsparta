import type { Metadata } from "next";
import { LocationGateway } from "../../components/LocationGateway";
import { assertExpansionHubMaster } from "../../lib/expansion-hubs";
import { getExpansionHubRuntimeSnapshot } from "../../lib/expansion-hub-runtime";
import "./location-gateway-overrides.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Επίλεξε περιοχή | ΚΟΝΤΑ ΜΟΥ",
  description: "Επίλεξε την πόλη ή περιοχή σου και βρες τον κοντινότερο κόμβο ΚΟΝΤΑ ΜΟΥ από το πλάνο επέκτασης 131 περιοχών.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true
  }
};

export default async function ChooseLocationPage() {
  assertExpansionHubMaster();
  const runtime = await getExpansionHubRuntimeSnapshot();
  return <LocationGateway runtimeHubs={runtime.hubs} />;
}
