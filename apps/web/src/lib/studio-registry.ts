export type StudioDestination = Readonly<{
  id: "sport-fit" | "paint-build" | "style" | "color";
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  position: readonly [number, number, number];
  tone: "sport" | "build" | "style" | "color";
}>;

export const STUDIO_DESTINATIONS: readonly StudioDestination[] = [
  {
    id: "sport-fit",
    title: "Sport & Fit",
    eyebrow: "MOVE · MATCH · PERFORM",
    description: "Βρες εξοπλισμό με βάση άθλημα, χρήση, εφαρμογή και πραγματική διαθεσιμότητα.",
    href: "/sport-fit-studio",
    position: [-3.8, 2.05, 0.8],
    tone: "sport"
  },
  {
    id: "paint-build",
    title: "Paint & Build",
    eyebrow: "PLAN · BUILD · FINISH",
    description: "Μετέτρεψε το έργο σου σε σωστό σύστημα υλικών, ποσότητες και βήματα εφαρμογής.",
    href: "/paint-and-build-studio",
    position: [3.85, 1.7, -0.35],
    tone: "build"
  },
  {
    id: "style",
    title: "Style",
    eyebrow: "FIT · COMBINE · WEAR",
    description: "Χτίσε ολοκληρωμένα looks από πραγματικά διαθέσιμα προϊόντα και τις επιλογές σου.",
    href: "/fitting-room",
    position: [-3.35, -2.15, -0.2],
    tone: "style"
  },
  {
    id: "color",
    title: "Color Finder",
    eyebrow: "PICK · MATCH · DISCOVER",
    description: "Ξεκίνα από το χρώμα και βρες τις πιο κοντινές διαθέσιμες επιλογές σε κάθε Color Studio.",
    href: "/color-finder",
    position: [3.6, -2.2, 0.55],
    tone: "color"
  }
] as const;
