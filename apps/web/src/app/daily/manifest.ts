import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ΚΟΝΤΑ ΜΟΥ Daily",
    short_name: "Daily",
    description: "Καθημερινή διαχείριση παραγγελιών, Ask Local, stock και παραλαβών για συνεργάτες ΚΟΝΤΑ ΜΟΥ.",
    start_url: "/daily",
    scope: "/daily/",
    display: "standalone",
    background_color: "#f6f4ee",
    theme_color: "#171914",
    lang: "el",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ],
    shortcuts: [
      { name: "Παραγγελίες", short_name: "Orders", url: "/daily/orders", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Scan / Quick Add", short_name: "Scan", url: "/daily/quickadd", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Ask Local", short_name: "Ask Local", url: "/daily/ask-local", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Ειδοποιήσεις", short_name: "Alerts", url: "/daily/notifications", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] }
    ]
  };
}
