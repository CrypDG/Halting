import type { Metadata } from 'next';
import { Space_Grotesk, Space_Mono, Instrument_Sans } from 'next/font/google';
import './globals.css';

const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-space-grotesk' });
const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument' });
const mono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-space-mono' });

export const metadata: Metadata = {
  title: 'Acting — Hire a verified driver for your own vehicle',
  description:
    'Acting is the inverted ride marketplace: you keep your car, truck, bus, crane or tractor, and hire only a verified, licence-matched, police-verified professional driver. First in Tamil Nadu.',
  openGraph: {
    title: 'Acting — You own the vehicle. We bring the driver.',
    description:
      'On-demand professional drivers for cars, trucks, buses, school buses, cranes, tractors and earth movers. Aadhaar-verified, licence-matched, police-verified.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
