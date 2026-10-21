import './globals.css';
import './premium.css';
import type { ReactNode } from 'react';
export const metadata = { title: 'NYXI — Nail Intelligence', description: 'Πληροφορίες για τη φροντίδα νυχιών με τεκμηριωμένες πηγές.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="el"><body>{children}</body></html>; }
