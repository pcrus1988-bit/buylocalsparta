import type { Metadata } from "next";
import { LocationGateway } from "../../components/LocationGateway";
import { getExpansionHubRuntimeSnapshot } from "../../lib/expansion-hub-runtime";
import "./location-gateway-overrides.css";

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
  const snapshot = await getExpansionHubRuntimeSnapshot();
  return <LocationGateway hubs={snapshot.hubs} />;
}
