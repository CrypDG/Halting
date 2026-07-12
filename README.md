# Halting

On-demand marketplace connecting vehicle owners with **verified professional drivers**. Unlike Uber, the customer owns the vehicle — car, truck/lorry, bus, school bus, crane, tractor, or earth mover — and hires only the driver. Every driver passes Aadhaar eKYC, driving-license verification matched to the vehicle category, and police verification before their first trip.

## Monorepo

| Path | What | Run |
|---|---|---|
| `apps/customer` | Expo app — find & book drivers, live tracking, OTP start, payment, rating | `cd apps/customer && npx expo start` |
| `apps/driver` | Expo app — registration wizard, go online/offline, accept trips, fees | `cd apps/driver && npx expo start` |
| `apps/admin` | Next.js ops panel — verification queue, drivers, trips, live ops, fees, pricing | `npm run dev -w @halting/admin` → http://localhost:3100 |
| `packages/shared` | Business rules + mock integration providers | `npx vitest run` |
| `supabase/` | Schema migrations, edge functions, seed data | applied to cloud project |

## Quick start

```bash
npm install                      # from the repo root (npm workspaces)
npx vitest run                   # in packages/shared — 14 unit tests
npm run dev -w @halting/admin    # admin panel on :3100
bash scripts/smoke-test.sh       # full backend e2e against the cloud project
```

**Dev accounts** (password `Halting123!`):

- `admin@halting.dev` — super admin
- `customer@halting.dev` — KYC-verified customer
- `driver1@halting.dev` — approved car driver (LMV), T Nagar Chennai
- `driver2@halting.dev` — approved heavy-vehicle driver (HMV+HTV+PSV → truck, bus, crane, earth mover)
- `driver3@halting.dev` — school-bus driver

> New in-app sign-ups need **Confirm email** disabled in Supabase (Auth → Providers → Email), or use the seeded accounts.

## Backend (Supabase `pybxdufrmnhgneupsssi`, ap-south-1)

- **Postgres + PostGIS** — `nearby_drivers()` geo-query, GPS breadcrumbs, fare distance.
- **RLS everywhere** — customers see own trips; drivers never see the start OTP; presence is only visible to trip counterparties and admins.
- **Edge functions** — `dispatch-trip` (booking + 30s driver offers), `trip-lifecycle` (state machine: accept → arrive → OTP start → end → pay → close, ₹500 setup fee after first trip), `admin-actions` (approve/reject/suspend, force-close, fee ops).
- **DB triggers** — license-class ⊆ category hard constraint (PRD §3.3), pricing floor/ceiling, rating average, role-escalation guard.

## Mocked for MVP (swap-in behind interfaces in `packages/shared/src/integrations`)

Aadhaar eKYC (DigiLocker/OKYC), Sarathi license API, Razorpay/Cashfree, SMS gateway, masked calling, document/selfie upload. Also not yet built: push notifications, i18n (Tamil/Hindi), SOS→112, scheduled bookings, iOS.
