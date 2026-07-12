import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Halting Admin',
  description: 'Halting operations panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
