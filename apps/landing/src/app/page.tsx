import {
  ArrowRight, ArrowUpRight, BadgeCheck, Bus, Car, Construction, Fingerprint, Forklift,
  IdCard, KeyRound, MapPin, Phone, Route, ShieldCheck, Star, Tractor, Truck, Wallet,
} from 'lucide-react';
import RouteCanvas from '@/components/RouteCanvas';

const CATEGORIES = [
  { icon: Car, name: 'Car', licence: 'LMV', note: 'Day trips, hospital runs, outstation' },
  { icon: Truck, name: 'Truck / Lorry', licence: 'HMV · HGMV', note: 'Per-trip or per-day haulage' },
  { icon: Bus, name: 'Bus', licence: 'HMV + PSV', note: 'Staff & event transport' },
  { icon: Bus, name: 'School Bus', licence: 'HPMV + PSV + endt.', note: 'The highest safety bar' },
  { icon: Construction, name: 'Crane', licence: 'HMV + HTV', note: 'Lifts & site work' },
  { icon: Forklift, name: 'Earth Mover', licence: 'HMV · CEV', note: 'JCB, excavator operators' },
  { icon: Tractor, name: 'Tractor', licence: 'LMV / LMV-TR', note: 'Seasonal farm work' },
];

const STEPS = [
  { n: '01', icon: Car, title: 'Pick your vehicle type', body: 'Choose what’s parked in your yard — from a hatchback to an excavator. We only show drivers licensed for it.' },
  { n: '02', icon: MapPin, title: 'See verified drivers nearby', body: 'A live map of available drivers with ratings, trips completed and their own per-km or per-day rate.' },
  { n: '03', icon: KeyRound, title: 'Start with a 4-digit OTP', body: 'The driver reaches your vehicle and enters the code only you can see — proof they’re at the right place.' },
  { n: '04', icon: Route, title: 'Track live, pay your way', body: 'Follow the whole trip on the map. Settle by cash or UPI, then rate each other. Done.' },
];

const PILLARS = [
  { icon: Fingerprint, tag: 'Identity', title: 'Aadhaar eKYC', body: 'Every driver clears DigiLocker / OKYC before their first trip. We store the masked number and a verification token — never the raw Aadhaar. DPDP Act, by design.' },
  { icon: IdCard, tag: 'Competence', title: 'Licence matched to the vehicle', body: 'A Sarathi check reads the actual licence classes, and the system will only ever show a driver for a vehicle their licence legally permits. A car driver never appears for a crane.' },
  { icon: ShieldCheck, tag: 'Character', title: 'Police verification', body: 'A Police Verification Certificate issued within 12 months, reviewed by a human before approval, and re-checked every two years.' },
];

export default function Page() {
  return (
    <main className="relative min-h-dvh bg-asphalt text-paper font-body overflow-x-clip">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-asphalt/70 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#top" className="flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tracking-tight text-paper">Acting</span>
            <span className="road-tick hidden h-[3px] w-8 rounded-full sm:block" />
          </a>
          <div className="hidden items-center gap-8 text-sm text-paper-dim md:flex">
            <a href="#how" className="transition hover:text-paper">How it works</a>
            <a href="#fleet" className="transition hover:text-paper">Vehicles</a>
            <a href="#trust" className="transition hover:text-paper">Verification</a>
            <a href="#drivers" className="transition hover:text-paper">For drivers</a>
          </div>
          <a href="#get" className="group inline-flex items-center gap-1.5 rounded-full bg-amber px-4 py-2 text-sm font-semibold text-asphalt transition hover:bg-amber-deep">
            Get the app
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" strokeWidth={2.5} />
          </a>
        </nav>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section id="top" className="grain relative flex min-h-dvh items-center overflow-hidden">
        <RouteCanvas />
        {/* readability veils */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-asphalt/40 via-asphalt/70 to-asphalt" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_40%,rgba(13,15,19,0)_0%,rgba(13,15,19,0.6)_100%)]" />

        <div className="relative mx-auto w-full max-w-6xl px-5 pt-28 pb-16">
          <div className="max-w-2xl">
            <p className="rise mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs uppercase tracking-widest text-amber" style={{ animationDelay: '40ms' }}>
              <span className="size-1.5 rounded-full bg-verified" /> Now onboarding · Tamil Nadu
            </p>
            <h1 className="rise font-display text-[clamp(2.6rem,7vw,4.75rem)] font-bold leading-[0.98] tracking-tight" style={{ animationDelay: '90ms' }}>
              You own the vehicle.
              <br />
              <span className="text-amber">We bring the driver.</span>
            </h1>
            <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-paper-dim" style={{ animationDelay: '150ms' }}>
              Acting is the inverted ride app. Keep your car, truck, bus, crane or tractor — and hire only a professional driver who is Aadhaar-verified, licence-matched to your vehicle, and police-verified.
            </p>
            <div className="rise mt-9 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: '210ms' }}>
              <a href="#get" className="group inline-flex items-center justify-center gap-2 rounded-full bg-amber px-6 py-3.5 font-semibold text-asphalt transition hover:bg-amber-deep">
                Book a driver
                <ArrowRight className="size-4 transition group-hover:translate-x-0.5" strokeWidth={2.5} />
              </a>
              <a href="#drivers" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3.5 font-semibold text-paper transition hover:border-white/40 hover:bg-white/5">
                Drive with Acting
              </a>
            </div>

            {/* trust strip */}
            <div className="rise mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-xs text-steel" style={{ animationDelay: '280ms' }}>
              {['Aadhaar eKYC', 'Licence-matched', 'Police-verified'].map((t) => (
                <span key={t} className="inline-flex items-center gap-2">
                  <BadgeCheck className="size-4 text-verified" /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* floating live-dispatch card */}
          <div className="rise pointer-events-none absolute right-5 top-1/2 hidden w-72 -translate-y-1/2 lg:block" style={{ animationDelay: '340ms' }}>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-asphalt-800/80 p-5 backdrop-blur-md shadow-2xl">
              <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
                <div className="verify-sweep h-px w-1/3 bg-gradient-to-r from-transparent via-amber to-transparent" />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-steel">Dispatching</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-verified">
                  <span className="size-1.5 animate-pulse rounded-full bg-verified" /> live
                </span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-amber/15 text-amber"><Truck className="size-6" /></div>
                <div>
                  <p className="font-display text-sm font-semibold">Selvam K.</p>
                  <p className="font-mono text-[11px] text-steel">HMV · HTV · PSV</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 font-mono text-[11px] text-paper-dim">
                <span className="inline-flex items-center gap-1.5"><Star className="size-3.5 text-amber" /> 4.9</span>
                <span>2.1 km away</span>
                <span className="text-verified">₹20/km</span>
              </div>
            </div>
          </div>
        </div>

        <a href="#inversion" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 font-mono text-[10px] uppercase tracking-widest text-steel sm:block">scroll ↓</a>
      </section>

      {/* ── The inversion ───────────────────────────────────────────────── */}
      <section id="inversion" className="relative border-y border-white/5 bg-asphalt-800 py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div>
            <Kicker>The difference</Kicker>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Not another ride app. The opposite of one.
            </h2>
            <p className="mt-5 max-w-lg text-paper-dim leading-relaxed">
              Uber and Ola bring you a stranger’s car. But you already have the vehicle — a lorry for the load, the school’s bus, the JCB on site, the family car for a long drive. What you’re missing is a driver you can trust with it, right now.
            </p>
            <p className="mt-4 max-w-lg text-paper-dim leading-relaxed">
              Hiring one has always meant brokers, word of mouth, no verification and no accountability. Acting replaces that with a booking that takes three taps and a driver whose identity, licence and record are all checked before they turn the key.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Contrast flip label="Ride apps" points={['They bring the car', 'Any driver, any vehicle', 'You just ride along']} />
            <Contrast label="Acting" points={['You keep your vehicle', 'Licence matched to it', 'You hire the skill']} />
          </div>
        </div>
      </section>

      {/* ── Vehicles ────────────────────────────────────────────────────── */}
      <section id="fleet" className="py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <Kicker>What you can crew</Kicker>
              <h2 className="mt-4 max-w-xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                From the family hatchback to a 40-tonne crane
              </h2>
            </div>
            <p className="max-w-xs text-sm text-paper-dim">
              Seven categories at launch. Each driver only appears for the vehicles their verified licence class allows — no exceptions.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <div key={cat.name} className="group relative bg-asphalt p-6 transition hover:bg-asphalt-800">
                <div className="flex items-start justify-between">
                  <div className="grid size-12 place-items-center rounded-xl bg-white/5 text-paper transition group-hover:bg-amber group-hover:text-asphalt">
                    <cat.icon className="size-6" strokeWidth={1.75} />
                  </div>
                  <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-amber">{cat.licence}</span>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">{cat.name}</h3>
                <p className="mt-1 text-sm text-steel">{cat.note}</p>
              </div>
            ))}
            <div className="grid place-items-center bg-asphalt p-6 text-center">
              <div>
                <p className="font-display text-3xl font-bold text-amber">7</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-steel">categories live</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Verification ────────────────────────────────────────────────── */}
      <section id="trust" className="relative border-y border-white/5 bg-asphalt-800 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <Kicker>Why you can hand over the keys</Kicker>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Three checks. Cleared before the first trip.
            </h2>
            <p className="mt-5 text-paper-dim leading-relaxed">
              A driver can’t go online until all three are done and an admin has approved the profile. This is the whole point of Acting.
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <div key={p.title} className="relative flex flex-col rounded-2xl border border-white/10 bg-asphalt p-7">
                <span className="absolute right-6 top-6 font-mono text-xs text-steel-dim">0{i + 1}</span>
                <div className="grid size-12 place-items-center rounded-xl bg-verified/12 text-verified">
                  <p.icon className="size-6" strokeWidth={1.75} />
                </div>
                <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-amber">{p.tag}</p>
                <h3 className="mt-2 font-display text-xl font-semibold">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-paper-dim">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Kicker>Three taps to a driver</Kicker>
          <h2 className="mt-4 max-w-xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            As easy as the app you already use
          </h2>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="relative">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-amber">{step.n}</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <step.icon className="mt-6 size-7 text-paper" strokeWidth={1.75} />
                <h3 className="mt-4 font-display text-lg font-semibold leading-snug">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-paper-dim">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For drivers ─────────────────────────────────────────────────── */}
      <section id="drivers" className="relative overflow-hidden border-y border-white/5 bg-gradient-to-br from-amber to-amber-deep py-24 text-asphalt">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[1fr_0.9fr] md:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-asphalt/70">For drivers</p>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-[2.75rem]">
              Your licence is your business. Set your own rate.
            </h2>
            <p className="mt-5 max-w-lg text-asphalt/80 leading-relaxed">
              Heavy-vehicle, crane and earth-mover operators have never had a digital channel to find work. Now you do — name your per-km and per-day price, go online when you want, and get paid to your bank T+1.
            </p>
            <a href="#get" className="mt-8 inline-flex items-center gap-2 rounded-full bg-asphalt px-6 py-3.5 font-semibold text-paper transition hover:bg-asphalt-800">
              Start earning <ArrowUpRight className="size-4" strokeWidth={2.5} />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DriverStat icon={Wallet} big="₹0" small="to register — the ₹500 setup fee is only due after your first completed trip" />
            <DriverStat icon={Route} big="T+1" small="in-app fares settled to your bank, minus dues" />
            <DriverStat icon={Star} big="You" small="set the per-km and per-day rate, within fair caps" />
            <DriverStat icon={Phone} big="Masked" small="calls — your real number is never shown to customers" />
          </div>
        </div>
      </section>

      {/* ── Get the app ─────────────────────────────────────────────────── */}
      <section id="get" className="py-28">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <Kicker center>Android first · iOS soon</Kicker>
          <h2 className="mx-auto mt-5 max-w-2xl font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl">
            Put a verified driver behind your wheel.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-paper-dim leading-relaxed">
            We’re rolling out across Tamil Nadu. Get the app and book your first driver, or sign up to drive.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="#" className="inline-flex items-center gap-2 rounded-full bg-amber px-7 py-3.5 font-semibold text-asphalt transition hover:bg-amber-deep">
              Download for Android <ArrowRight className="size-4" strokeWidth={2.5} />
            </a>
            <a href="#top" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-7 py-3.5 font-semibold text-paper transition hover:border-white/40 hover:bg-white/5">
              Notify me on iOS
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 bg-asphalt-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg font-bold">Acting</span>
              <span className="road-tick h-[3px] w-7 rounded-full" />
            </div>
            <p className="mt-2 max-w-xs text-sm text-steel">
              On-demand professional drivers for the vehicle you already own. Built in Tamil Nadu.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-3 font-mono text-xs text-steel">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-verified" /> Aadhaar Act &amp; DPDP 2023 compliant</span>
            <span>RBI-partner payments</span>
            <span>GST invoicing</span>
          </div>
        </div>
        <div className="border-t border-white/5 py-5 text-center font-mono text-[11px] text-steel-dim">
          © {new Date().getFullYear()} Acting. All rights reserved.
        </div>
      </footer>
    </main>
  );
}

/* ── Small building blocks ─────────────────────────────────────────────── */
function Kicker({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-amber ${center ? 'justify-center' : ''}`}>
      <span className="road-tick h-[3px] w-6 rounded-full" />
      {children}
    </span>
  );
}

function Contrast({ label, points, flip }: { label: string; points: string[]; flip?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${flip ? 'border-white/10 bg-transparent text-steel' : 'border-amber/30 bg-amber/5 text-paper'}`}>
      <p className={`font-mono text-[11px] uppercase tracking-widest ${flip ? 'text-steel-dim' : 'text-amber'}`}>{label}</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${flip ? 'bg-steel-dim' : 'bg-amber'}`} />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DriverStat({ icon: Icon, big, small }: { icon: typeof Wallet; big: string; small: string }) {
  return (
    <div className="rounded-2xl bg-asphalt/10 p-5 ring-1 ring-asphalt/10">
      <Icon className="size-6 text-asphalt" strokeWidth={1.75} />
      <p className="mt-4 font-display text-2xl font-bold">{big}</p>
      <p className="mt-1 text-[13px] leading-snug text-asphalt/75">{small}</p>
    </div>
  );
}
