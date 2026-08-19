import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KONTA MOY Daily",
    short_name: "Daily",
    description: "Καθημερινή διαχείριση παραγγελιών, Ask Local και παραλαβών για συνεργάτες KONTA MOY.",
    start_url: "/daily",
    scope: "/daily/",
    display: "standalone",
    background_color: "#f6f4ee",
    theme_color: "#171914",
    lang: "el",
    orientation: "portrait-primary"
  };
}
