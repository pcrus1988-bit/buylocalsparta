import type { Metadata } from "next";
import { LocationGateway } from "../../components/LocationGateway";
import { assertExpansionHubMaster } from "../../lib/expansion-hubs";
import { assertExpansionHubStatusAlignment } from "../../lib/expansion-hub-status";

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

export default function ChooseLocationPage() {
  assertExpansionHubMaster();
  assertExpansionHubStatusAlignment();
  return <LocationGateway />;
}
