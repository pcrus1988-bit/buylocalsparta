import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ΚΟΝΤΑ ΜΟΥ Driver",
    short_name: "Driver",
    description: "Παραλαβές, παραδόσεις, επιστροφές και live tracking για οδηγούς ΚΟΝΤΑ ΜΟΥ.",
    start_url: "/driver",
    scope: "/driver",
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
      { name: "Ενεργή διαδρομή", short_name: "Route", url: "/driver", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] }
    ]
  };
}
