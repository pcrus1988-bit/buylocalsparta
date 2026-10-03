import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacySpBusinessLabStorefront() {
  permanentRedirect("/vendor/sp-business-lab");
}
