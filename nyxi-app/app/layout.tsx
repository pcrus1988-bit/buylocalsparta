import './globals.css';
import './premium.css';
import './editorial-v2.css';
import './experience.css';
import './color-theatre.css';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#271420' };
export const metadata = { title: 'NYXI — Nail Intelligence', description: 'Πληροφορίες για τη φροντίδα νυχιών με τεκμηριωμένες πηγές.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="el"><body>{children}</body></html>; }
