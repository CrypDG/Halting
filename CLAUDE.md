# Acting — On-Demand Professional Driver Marketplace

Inverted Uber: the customer owns the vehicle (car/truck/bus/school bus/crane/tractor/earth mover) and hires only a verified driver. PRD: `Halding_Driver_App_PRD.pdf` (user's Desktop). First market: Tamil Nadu.

## Layout
- `packages/shared` — TS business rules: vehicle-category ↔ license-class matching, trip state machine, fare calculator, mock external providers (KYC/Sarathi/payments/SMS/masked calls). Unit tests: `npx vitest run` here.
- `apps/admin` — Next.js 15 + Tailwind 4 ops panel, port 3100 (`npm run dev -w @acting/admin`). Client-side Supabase auth; admin actions go through the `admin-actions` edge function.
- `apps/driver`, `apps/customer` — Expo SDK 53 + expo-router. `npx expo start` in each. Customer app uses react-native-maps (Android/Expo Go).
- `supabase/migrations` — canonical schema history (also applied to the cloud project). `supabase/functions` — edge function sources (deployed via Supabase MCP). `supabase/seed.sql` — dev data.
- `scripts/smoke-test.sh` — full backend e2e (login → go online → book → OTP → trip lifecycle → cash confirm → close → setup fee → rating). Run with bash.

## Supabase
- Project: `acting` (`pybxdufrmnhgneupsssi`), region ap-south-1, org NexaEx. URL/anon key are in `apps/*/.env` and `apps/admin/.env.local`.
- Dev accounts (password `Acting123!`): admin@acting.dev, customer@acting.dev, driver1@acting.dev (LMV/car, approved), driver2@acting.dev (HMV+HTV+PSV → truck/bus/crane/earth mover, approved), driver3@acting.dev (HPMV+PSV+school-bus).
- Seeded users were inserted directly into `auth.users`; app sign-up requires disabling "Confirm email" in the Supabase dashboard (Auth → Providers → Email).

## Architecture rules
- **All trip mutations go through edge functions** (`dispatch-trip`, `trip-lifecycle`, `admin-actions`) using the service role; clients only read (RLS) and call RPCs (`go_online`, `go_offline`, `set_driver_location`, `nearby_drivers`).
- The trip state machine and fare logic live in BOTH `packages/shared/src` and `supabase/functions/_shared/common.ts` — keep them in sync when changing either.
- Start OTP lives in `trip_secrets` (customer-readable only, driver must never see it); the driver submits it via the `start` action.
- License ↔ category matching is enforced three times by design: shared TS (UX), DB trigger `enforce_driver_category` (integrity), and `nearby_drivers` only returns approved+online drivers of the category.
- Never store a raw Aadhaar number anywhere — masked value + verification token only (DPDP Act).
- External providers (Aadhaar KYC, Sarathi, Razorpay, SMS, masked calls) are mocks behind interfaces in `packages/shared/src/integrations`. Real integrations replace the `Mock*` implementations only.

## Gotchas
- RLS policies on `trips`/`trip_requests` must not reference each other directly (infinite recursion) — use the SECURITY DEFINER helpers `is_trip_customer()` / `has_trip_offer()`.
- Run `npm install` from the repo root (workspaces); installing from a subdirectory silently resolves the wrong tree.
- PowerShell 5.1 on this machine: no `&&` operator.
