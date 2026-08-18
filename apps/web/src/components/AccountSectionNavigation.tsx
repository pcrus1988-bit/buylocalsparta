const PRIMARY_ACCOUNT_SECTIONS = [
  { href: "#overview", label: "Επισκόπηση" },
  { href: "#ask-local", label: "Ask Local" },
  { href: "#orders", label: "Παραγγελίες" },
  { href: "#saved", label: "Αποθηκευμένα" },
  { href: "#notifications", label: "Ειδοποιήσεις" },
  { href: "#privacy", label: "Ιδιωτικότητα" }
] as const;

const SECONDARY_ACCOUNT_SECTIONS = [
  { href: "#searches", label: "Αναζητήσεις" },
  { href: "#recommendations", label: "Προτάσεις" },
  { href: "#recent", label: "Πρόσφατα" }
] as const;

export function AccountSectionNavigation() {
  return <nav className="shell account-section-nav" aria-label="Ενότητες λογαριασμού">
    <span>Ο λογαριασμός μου</span>
    <div className="account-section-nav-content">
      <div className="account-section-nav-primary">
        {PRIMARY_ACCOUNT_SECTIONS.map((section) => <a href={section.href} key={section.href}>{section.label}</a>)}
      </div>
      <details className="account-section-nav-more">
        <summary>Περισσότερα</summary>
        <div>{SECONDARY_ACCOUNT_SECTIONS.map((section) => <a href={section.href} key={section.href}>{section.label}</a>)}</div>
      </details>
    </div>
  </nav>;
}
