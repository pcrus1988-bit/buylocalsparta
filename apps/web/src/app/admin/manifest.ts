import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KONTA MOY Admin",
    short_name: "Admin",
    description: "Κέντρο ελέγχου KONTA MOY για λειτουργία, παραγγελίες, συνεργάτες, κατάλογο, delivery και εξαιρέσεις.",
    start_url: "/admin",
    scope: "/admin",
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
      { name: "Command Centre", short_name: "Home", url: "/admin", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Delivery", short_name: "Delivery", url: "/admin/delivery", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Quick Add", short_name: "Quick Add", url: "/admin/quickadd", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Ask Local", short_name: "Ask Local", url: "/admin/ask-local", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] }
    ]
  };
}
