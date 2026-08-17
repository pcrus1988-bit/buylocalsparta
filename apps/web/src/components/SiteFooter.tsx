const groups = [
  {
    title: "Ανακάλυψε",
    links: [["Προϊόντα", "/shop"], ["Καταστήματα & άνθρωποι", "/shops"], ["Ask Local", "/ask-local"]]
  },
  {
    title: "Πώς λειτουργεί",
    links: [["Η εμπειρία αγοράς", "/how-it-works"], ["Πληρωμές & ασφάλεια", "/payments-security"], ["Παράδοση & παραλαβή", "/delivery-pickup"], ["Επιστροφές & refunds", "/returns-refunds"]]
  },
  {
    title: "Buy Local Sparta",
    links: [["Η ιδέα και η αποστολή", "/about"], ["Δίκαιη ανάθεση", "/fairness"], ["Privacy controls", "/privacy-controls"], ["Κέντρο βοήθειας", "/help"], ["Γίνε συνεργάτης", "/join"]]
  }
] as const;

export function SiteFooter() {
  return (
    <footer className="footer site-footer">
      <div className="shell footer-grid footer-grid-expanded">
        <div className="footer-intro">
          <a className="brand footer-brand" href="/" aria-label="Buy Local Sparta · αρχική">
            <span className="brand-mark">BLS</span><span>Buy Local Sparta</span>
          </a>
          <p>Buy Local. Know Your Vendor. Get Real Advice.</p>
          <small>Μία ανθρώπινη ψηφιακή αγορά για τη Σπάρτη και τη γύρω περιοχή.</small>
        </div>
        {groups.map((group) => (
          <nav aria-label={group.title} key={group.title}>
            <strong>{group.title}</strong>
            {group.links.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
          </nav>
        ))}
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} Buy Local Sparta</span>
        <span>Τοπικά προϊόντα · πραγματικοί άνθρωποι · καθαροί κανόνες</span>
      </div>
    </footer>
  );
}
