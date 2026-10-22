import type { Metadata } from "next";
import { MemberDemo } from "../../components/MemberDemo";
export const metadata: Metadata={title:"Προσομοίωση μελών",robots:{index:false,follow:false},description:"Δοκιμαστική απεικόνιση των αιτήσεων και των συλλογικών αποφάσεων του ΜΑΖΙ."};
export default function Demo(){return <main id="content"><section className="subhero demo-hero"><div className="shell"><span className="eyebrow light">ΔΙΑΔΡΑΣΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ</span><h1>Μπες στο <em>ΜΑΖΙ.</em></h1><p>Ανακάλυψε πώς ένα μέλος θα βλέπει ανάγκες, θα υποστηρίζει έργα και θα παρουσιάζει τη δική του πρόταση.</p></div></section><MemberDemo/></main>}
