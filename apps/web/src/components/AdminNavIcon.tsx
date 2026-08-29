export type AdminNavIconName = "overview" | "operations" | "partners" | "catalog" | "customers" | "trust" | "finance" | "content" | "search" | "analytics" | "platform";

const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, focusable: false, "aria-hidden": true };

export function AdminNavIcon({ name }: { name: string }) {
  switch (name as AdminNavIconName) {
    case "overview": return <svg {...common}><path d="M2.5 7 8 2.5 13.5 7v6H9.75V9.5h-3.5V13H2.5Z" /></svg>;
    case "operations": return <svg {...common}><path d="M2.5 4.25h4M2.5 8h7M2.5 11.75h5" /><circle cx="11.75" cy="4.25" r="1.75" /><circle cx="12" cy="11.75" r="1.5" /></svg>;
    case "partners": return <svg {...common}><circle cx="5.5" cy="5" r="2" /><circle cx="11" cy="5.75" r="1.6" /><path d="M2.25 12.75c.35-2.15 1.55-3.25 3.25-3.25s2.9 1.1 3.25 3.25M9 9.75c1.9-.55 3.85.35 4.5 2.65" /></svg>;
    case "catalog": return <svg {...common}><rect x="2.5" y="2.5" width="4.25" height="4.25" rx=".75" /><rect x="9.25" y="2.5" width="4.25" height="4.25" rx=".75" /><rect x="2.5" y="9.25" width="4.25" height="4.25" rx=".75" /><rect x="9.25" y="9.25" width="4.25" height="4.25" rx=".75" /></svg>;
    case "customers": return <svg {...common}><circle cx="8" cy="5" r="2.35" /><path d="M3.5 13c.45-2.55 2.05-3.9 4.5-3.9s4.05 1.35 4.5 3.9" /></svg>;
    case "trust": return <svg {...common}><path d="M8 2.25 13 4v3.65c0 3.05-1.75 5.25-5 6.1-3.25-.85-5-3.05-5-6.1V4Z" /><path d="m5.8 7.85 1.45 1.4 3-3" /></svg>;
    case "finance": return <svg {...common}><path d="M2.5 5.25h11v7.25h-11Z" /><path d="M3.75 5.25V3.5h8.5v1.75M10.5 8.9h1.5" /><circle cx="6" cy="8.9" r="1.65" /></svg>;
    case "content": return <svg {...common}><path d="M3.25 2.5h6l3.5 3.5v7.5h-9.5Z" /><path d="M9.25 2.5V6h3.5M5.25 8.5h5.5M5.25 11h4" /></svg>;
    case "search": return <svg {...common}><circle cx="6.75" cy="6.75" r="3.75" /><path d="m9.6 9.6 3.15 3.15" /><path d="M5.25 6.75h3M6.75 5.25v3" /></svg>;
    case "analytics": return <svg {...common}><path d="M2.5 13.25V3M2.5 13.25h11" /><path d="m4.25 10.5 2.4-2.55 2 1.4 3.1-4.1" /><circle cx="11.75" cy="5.25" r=".8" fill="currentColor" stroke="none" /></svg>;
    case "platform": return <svg {...common}><circle cx="8" cy="8" r="2.1" /><path d="M8 2.25v1.4M8 12.35v1.4M2.25 8h1.4M12.35 8h1.4M3.95 3.95l1 1M11.05 11.05l1 1M12.05 3.95l-1 1M4.95 11.05l-1 1" /></svg>;
    default: return <svg {...common}><circle cx="8" cy="8" r="4.5" /></svg>;
  }
}
