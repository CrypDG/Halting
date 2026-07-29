-- Driver identity assurance (PRD §3.4, §10 "account sharing").
-- Device biometrics only prove someone unlocked THAT handset. The real control
-- is a liveness-checked face match against the Aadhaar reference, decided
-- server-side at trip start. This is the audit trail + enforcement state.

create type verification_kind as enum ('onboarding', 'trip_start', 'random', 'device_change', 'customer_report');
create type verification_result as enum ('passed', 'failed', 'blocked', 'skipped_offline');

create table verification_events (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references driver_profiles(driver_id) on delete cascade,
  trip_id uuid references trips(id) on delete set null,
  kind verification_kind not null,
  result verification_result not null,
  risk_score int not null default 0,
  risk_reasons text[] not null default '{}',
  /** 0..1 similarity vs the Aadhaar reference face. */
  match_score numeric(4,3),
  liveness_passed boolean,
  selfie_path text,                       -- private 'documents' bucket key
  device_id text,
  category_slug text references vehicle_categories(slug),
  fail_closed boolean not null default false,
  notes text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index verification_events_driver_idx on verification_events(driver_id, created_at desc);
create index verification_events_review_idx on verification_events(result) where result in ('failed', 'blocked');

-- Known handsets per driver — an unrecognised device is a hand-off signal.
create table driver_devices (
  driver_id uuid not null references driver_profiles(driver_id) on delete cascade,
  device_id text not null,
  label text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (driver_id, device_id)
);

-- Rolling identity state, kept on the driver for cheap reads at trip start.
alter table driver_profiles
  add column if not exists last_verified_at timestamptz,
  add column if not exists identity_hold boolean not null default false,
  add column if not exists identity_hold_reason text;

comment on column driver_profiles.identity_hold is
  'Set when identity verification blocks. Driver cannot go online or start trips until an admin clears it.';

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table verification_events enable row level security;
alter table driver_devices enable row level security;

-- Drivers may read their own history (transparency) but never write it —
-- all inserts go through the verify-identity edge function (service role).
create policy "verification: own read" on verification_events for select to authenticated
  using (driver_id = auth.uid());
create policy "verification: admin read" on verification_events for select to authenticated
  using (public.is_admin());

create policy "devices: own read" on driver_devices for select to authenticated
  using (driver_id = auth.uid());
create policy "devices: admin read" on driver_devices for select to authenticated
  using (public.is_admin());

-- Going online is blocked while an identity hold is active.
create or replace function public.go_online(p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  dp driver_profiles;
  fee setup_fees;
begin
  select * into dp from driver_profiles where driver_id = auth.uid();
  if dp.driver_id is null then raise exception 'Not a registered driver'; end if;
  if dp.status <> 'approved' then raise exception 'Driver not approved (status: %)', dp.status; end if;
  if dp.identity_hold then
    raise exception 'Your account is on hold pending an identity review. Contact support.';
  end if;
  if dp.license_expiry is not null and dp.license_expiry < current_date then
    raise exception 'Driving license expired on %', dp.license_expiry;
  end if;
  select * into fee from setup_fees where driver_id = auth.uid() and status = 'pending' and due_at < now();
  if found then
    raise exception 'Setup fee of INR % is overdue — pay it to go online', fee.amount_inr;
  end if;
  insert into driver_presence (driver_id, status, location, last_seen_at)
  values (auth.uid(), 'online', st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, now())
  on conflict (driver_id) do update
    set status = case when driver_presence.status = 'busy' then 'busy'::presence_status else 'online'::presence_status end,
        location = excluded.location,
        last_seen_at = now();
end $$;
