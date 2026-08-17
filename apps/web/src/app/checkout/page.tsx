import type { Metadata } from "next";
import { CheckoutPageClient } from "../../components/CheckoutPageClient";
import { SiteHeader } from "../../components/SiteHeader";
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export default function CheckoutPage() { return <main><div className="announcement">Secure checkout · Viva Smart Checkout και BOX NOW ενεργοποιούνται μόνο όταν έχουν ρυθμιστεί τα αντίστοιχα production credentials.</div><SiteHeader compact /><section className="shell page-hero"><div className="eyebrow">Checkout</div><h1>Μία αγορά. Τοπικά.</h1></section><section className="shell page-section"><CheckoutPageClient /></section></main>; }
