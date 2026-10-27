import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://mazi.kontamou.site"),
  title: { default: "ΜΑΖΙ | Η δύναμη των μικρών, μαζί", template: "%s | ΜΑΖΙ" },
  description: "ΜΑΖΙ — μια υπό σχεδιασμό συλλογική πρωτοβουλία για την ανάπτυξη, την υποστήριξη και τη συνεργασία των ανεξάρτητων ελληνικών επιχειρήσεων.",
  openGraph: { title: "ΜΑΖΙ · Η δύναμη των μικρών, μαζί", description: "Μια νέα συλλογική οικονομική δύναμη για τις ανεξάρτητες επιχειρήσεις της Ελλάδας.", locale: "el_GR", type: "website", url: "/" }
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="el">
    <body>
      <a className="skip" href="#content">Μετάβαση στο περιεχόμενο</a>
      <header className="site-head">
        <div className="shell header-inner">
          <Link href="/" className="wordmark" aria-label="ΜΑΖΙ — αρχική"><span className="mark-symbol" aria-hidden="true">✳</span> ΜΑΖΙ<span className="wordmark-period">.</span></Link>
          <nav aria-label="Κύρια πλοήγηση" className="header-nav">
            <Link href="/fund">Το Ταμείο</Link>
            <Link href="/benefits">Προνόμια</Link>
            <Link href="/marketplace">Marketplace</Link>
            <Link href="/forum">Forum</Link>
            <Link href="/livechat">Livechat</Link><Link href="/dashboard">Ο χώρος μου</Link>
            <Link href="/charter">Οι αρχές μας</Link>
            <Link href="/interest" className="nav-accent">Αίτηση ενδιαφέροντος <span aria-hidden="true">↗</span></Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="shell footer-grid">
          <div><span className="footer-logo">ΜΑΖΙ<span>.</span></span><p>Για να μη χρειάζεται καμία μικρή επιχείρηση να τα καταφέρνει μόνη της.</p></div>
          <div><strong>Γνώρισε το ΜΑΖΙ</strong><Link href="/benefits">Προνόμια μελών</Link><Link href="/marketing">Συλλογικό marketing</Link><Link href="/membership">Συνδρομή & κατανομή</Link><Link href="/fund">Το Ταμείο Ανάπτυξης</Link><Link href="/charter">Αρχές & διακυβέρνηση</Link><Link href="/privacy">Προσωπικά δεδομένα</Link><Link href="/legal">Νομικό Κέντρο</Link><Link href="/interest">Αίτηση ενδιαφέροντος</Link><Link href="/join">Σύνδεση μελών</Link><Link href="/marketplace">Marketplace μελών</Link><Link href="/marketplace/rules">Όροι B2B Marketplace</Link><Link href="/forum">Forum μελών</Link><Link href="/livechat">Livechat μελών</Link><Link href="/inbox">Ιδιωτικά μηνύματα</Link></div>
          <div><strong>Μια πρωτοβουλία</strong><a href="https://kontamou.site" rel="noopener noreferrer">ΚΟΝΤΑ ΜΟΥ ↗</a><small>Γίνονται πραγματικές αιτήσεις ενδιαφέροντος. Δεν εισπράττονται συνδρομές και δεν πραγματοποιούνται πληρωμές ή εκταμιεύσεις.</small></div>
        </div>
        <div className="shell footer-bottom"><span>© 2026 ΜΑΖΙ · ΚΟΝΤΑ ΜΟΥ</span><span>Από τη Σπάρτη, για όλη την Ελλάδα.</span></div>
      </footer>
    </body>
  </html>;
}
