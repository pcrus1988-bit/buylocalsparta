import type { Metadata } from "next";
import { CheckoutPageClient } from "../../components/CheckoutPageClient";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export default function CheckoutPage() { return <main><div className="announcement">Secure checkout · Viva Smart Checkout και BOX NOW ενεργοποιούνται μόνο όταν έχουν ρυθμιστεί τα αντίστοιχα production credentials.</div><SiteHeader compact /><section className="shell page-hero"><div className="eyebrow">Checkout</div><h1>Μία αγορά. Τοπικά.</h1><div className="checkout-context-links"><a className="text-link" href="/how-it-works">Πώς λειτουργεί η ενιαία αγορά →</a><a className="text-link" href="/delivery-pickup">Παράδοση & παραλαβή →</a></div></section><section className="shell page-section"><CheckoutPageClient /></section><SiteFooter /></main>; }
