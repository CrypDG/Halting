-- Halting initial schema (PRD v1.0)
create extension if not exists postgis with schema extensions;

-- ── Enums ────────────────────────────────────────────────────────────────
create type user_role as enum ('customer','driver','admin');
create type admin_role as enum ('super_admin','verifier','support','finance');
create type driver_verification_status as enum ('draft','submitted','under_review','approved','rejected','suspended');
create type presence_status as enum ('offline','online','busy');
create type trip_status as enum ('requested','accepted','driver_arrived','started','in_progress','completed','paid','closed','cancelled_by_customer','cancelled_by_driver','expired','disputed');
create type trip_type as enum ('per_km','per_day');
create type payment_mode as enum ('cash','in_app');
create type payment_status as enum ('pending','collected_claimed','confirmed','refunded');
create type setup_fee_status as enum ('pending','paid','waived');
create type trip_request_status as enum ('pending','accepted','declined','expired');

-- ── Reference tables ─────────────────────────────────────────────────────
create table vehicle_categories (
  slug text primary key,
  name text not null,
  -- Array of qualifying license-class combinations, e.g. [["HMV","PSV"],["HPMV","PSV"]].
  required_license_classes jsonb not null,
  default_radius_km int not null default 10,
  max_radius_km int not null default 50
);

create table pricing_limits (
  category_slug text primary key references vehicle_categories(slug),
  min_per_km numeric(10,2),
  max_per_km numeric(10,2),
  min_per_day numeric(10,2),
  max_per_day numeric(10,2)
);

-- ── Users ────────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  admin_role admin_role,
  full_name text,
  phone text,
  photo_url text,
  -- Aadhaar eKYC result: masked number only, never the raw number (DPDP Act).
  masked_aadhaar text,
  kyc_name text,
  kyc_dob date,
  kyc_token text,
  kyc_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table driver_profiles (
  driver_id uuid primary key references profiles(id) on delete cascade,
  status driver_verification_status not null default 'draft',
  rejection_reason text,
  license_number text,
  license_classes text[] not null default '{}',
  license_expiry date,
  license_verified_at timestamptz,
  police_cert_path text,
  police_cert_expiry date,
  police_verified_at timestamptz,
  selfie_path text,
  upi_or_account text,
  payout_verified_at timestamptz,
  experience_years int,
  trips_completed int not null default 0,
  rating_avg numeric(3,2),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table driver_categories (
  driver_id uuid not null references driver_profiles(driver_id) on delete cascade,
  category_slug text not null references vehicle_categories(slug),
  price_per_km numeric(10,2),
  price_per_day numeric(10,2),
  overtime_per_hour numeric(10,2),
  outstation_allowance boolean not null default false,
  active boolean not null default true,
  primary key (driver_id, category_slug),
  check (price_per_km is not null or price_per_day is not null)
);

create table driver_presence (
  driver_id uuid primary key references driver_profiles(driver_id) on delete cascade,
  status presence_status not null default 'offline',
  location geography(point,4326),
  last_seen_at timestamptz
);
create index driver_presence_location_idx on driver_presence using gist(location);

-- ── Trips ────────────────────────────────────────────────────────────────
create table trips (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  driver_id uuid references driver_profiles(driver_id),
  category_slug text not null references vehicle_categories(slug),
  status trip_status not null default 'requested',
  trip_type trip_type not null,
  pickup_location geography(point,4326) not null,
  pickup_address text,
  destination_location geography(point,4326),
  destination_address text,
  days int,
  notes text,
  payment_mode payment_mode not null default 'cash',
  payment_status payment_status not null default 'pending',
  payment_ref text,
  distance_km numeric(10,2),
  overtime_hours numeric(6,2),
  fare_base numeric(10,2),
  fare_overtime numeric(10,2),
  fare_total numeric(10,2),
  fare_adjusted_by uuid references profiles(id),
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz
);
create index trips_customer_idx on trips(customer_id);
create index trips_driver_idx on trips(driver_id);
create index trips_status_idx on trips(status);

-- Start OTP lives apart from trips so the driver's row access never exposes it.
create table trip_secrets (
  trip_id uuid primary key references trips(id) on delete cascade,
  start_otp text not null
);

create table trip_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  driver_id uuid not null references driver_profiles(driver_id),
  status trip_request_status not null default 'pending',
  distance_km numeric(10,2),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, driver_id)
);
create index trip_requests_driver_idx on trip_requests(driver_id, status);

create table trip_locations (
  id bigint generated always as identity primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  location geography(point,4326) not null,
  recorded_at timestamptz not null default now()
);
create index trip_locations_trip_idx on trip_locations(trip_id, recorded_at);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  rater_id uuid not null references profiles(id),
  ratee_id uuid not null references profiles(id),
  stars int not null check (stars between 1 and 5),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (trip_id, rater_id)
);

create table setup_fees (
  driver_id uuid primary key references driver_profiles(driver_id) on delete cascade,
  amount_inr numeric(10,2) not null default 500,
  status setup_fee_status not null default 'pending',
  due_at timestamptz not null,
  paid_at timestamptz,
  payment_ref text,
  trip_id uuid references trips(id)
);

-- ── Helper functions & triggers ──────────────────────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- Auto-create profile (and driver shell) on signup; role comes from user metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer'),
    new.raw_user_meta_data->>'full_name',
    new.phone
  );
  if (new.raw_user_meta_data->>'role') = 'driver' then
    insert into public.driver_profiles (driver_id) values (new.id);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users cannot change their own role / admin_role (privilege escalation guard).
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.admin_role is distinct from old.admin_role)
     and not public.is_admin() and auth.uid() is not null then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end $$;
create trigger guard_profile_role before update on profiles
  for each row execute function public.guard_profile_role();

-- PRD §3.3 hard constraint: category must be permitted by verified license classes,
-- and pricing must respect admin floor/ceiling.
create or replace function public.enforce_driver_category() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  held text[];
  combos jsonb;
  permitted boolean;
  lim pricing_limits;
begin
  select license_classes into held from driver_profiles where driver_id = new.driver_id;
  select required_license_classes into combos from vehicle_categories where slug = new.category_slug;
  select exists (
    select 1 from jsonb_array_elements(combos) combo
    where not exists (
      select 1 from jsonb_array_elements_text(combo) cls
      where not (cls = any (coalesce(held, '{}')))
    )
  ) into permitted;
  if not permitted then
    raise exception 'License classes % do not permit category %', held, new.category_slug;
  end if;

  select * into lim from pricing_limits where category_slug = new.category_slug;
  if found then
    if new.price_per_km is not null and (new.price_per_km < coalesce(lim.min_per_km, 0) or new.price_per_km > coalesce(lim.max_per_km, 'infinity')) then
      raise exception 'price_per_km out of allowed range for %', new.category_slug;
    end if;
    if new.price_per_day is not null and (new.price_per_day < coalesce(lim.min_per_day, 0) or new.price_per_day > coalesce(lim.max_per_day, 'infinity')) then
      raise exception 'price_per_day out of allowed range for %', new.category_slug;
    end if;
  end if;
  return new;
end $$;
create trigger enforce_driver_category before insert or update on driver_categories
  for each row execute function public.enforce_driver_category();

-- Keep driver rating average current.
create or replace function public.refresh_driver_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update driver_profiles set rating_avg = (
    select round(avg(stars)::numeric, 2) from ratings where ratee_id = new.ratee_id
  ) where driver_id = new.ratee_id;
  return new;
end $$;
create trigger refresh_driver_rating after insert on ratings
  for each row execute function public.refresh_driver_rating();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger driver_profiles_touch before update on driver_profiles
  for each row execute function public.touch_updated_at();

-- ── RPCs ─────────────────────────────────────────────────────────────────
-- Nearby online, approved drivers of a category (PRD §4.2). SECURITY DEFINER so
-- customers never read driver_presence directly.
create or replace function public.nearby_drivers(
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10
) returns table (
  driver_id uuid,
  full_name text,
  photo_url text,
  rating_avg numeric,
  trips_completed int,
  experience_years int,
  license_classes text[],
  price_per_km numeric,
  price_per_day numeric,
  overtime_per_hour numeric,
  distance_km double precision,
  lat double precision,
  lng double precision
) language sql stable security definer set search_path = public, extensions as $$
  select
    dp.driver_id,
    p.full_name,
    p.photo_url,
    dp.rating_avg,
    dp.trips_completed,
    dp.experience_years,
    dp.license_classes,
    dc.price_per_km,
    dc.price_per_day,
    dc.overtime_per_hour,
    st_distance(pr.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0 as distance_km,
    st_y(pr.location::geometry) as lat,
    st_x(pr.location::geometry) as lng
  from driver_presence pr
  join driver_profiles dp on dp.driver_id = pr.driver_id and dp.status = 'approved'
  join driver_categories dc on dc.driver_id = pr.driver_id and dc.category_slug = p_category and dc.active
  join profiles p on p.id = pr.driver_id
  where pr.status = 'online'
    and pr.location is not null
    and st_dwithin(pr.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
  order by distance_km
$$;

-- Go online: gated on approval, license validity, and setup-fee dues (PRD §4.1/§4.6).
create or replace function public.go_online(p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  dp driver_profiles;
  fee setup_fees;
begin
  select * into dp from driver_profiles where driver_id = auth.uid();
  if dp.driver_id is null then raise exception 'Not a registered driver'; end if;
  if dp.status <> 'approved' then raise exception 'Driver not approved (status: %)', dp.status; end if;
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

create or replace function public.go_offline()
returns void language sql security definer set search_path = public as $$
  update driver_presence set status = 'offline', last_seen_at = now()
  where driver_id = auth.uid() and status <> 'busy'
$$;

-- Adaptive GPS ping (PRD §4.1); breadcrumbs recorded while on an active trip.
create or replace function public.set_driver_location(p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  active_trip uuid;
begin
  update driver_presence
  set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, last_seen_at = now()
  where driver_id = auth.uid() and status in ('online','busy');
  if not found then return; end if;

  select id into active_trip from trips
  where driver_id = auth.uid() and status in ('accepted','driver_arrived','started','in_progress')
  limit 1;
  if active_trip is not null then
    insert into trip_locations (trip_id, location)
    values (active_trip, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
  end if;
end $$;

-- ── Row Level Security ───────────────────────────────────────────────────
alter table vehicle_categories enable row level security;
alter table pricing_limits enable row level security;
alter table profiles enable row level security;
alter table driver_profiles enable row level security;
alter table driver_categories enable row level security;
alter table driver_presence enable row level security;
alter table trips enable row level security;
alter table trip_secrets enable row level security;
alter table trip_requests enable row level security;
alter table trip_locations enable row level security;
alter table ratings enable row level security;
alter table setup_fees enable row level security;

create policy "categories readable" on vehicle_categories for select to authenticated using (true);
create policy "pricing limits readable" on pricing_limits for select to authenticated using (true);
create policy "pricing limits admin write" on pricing_limits for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "profiles: own" on profiles for select to authenticated using (id = auth.uid());
create policy "profiles: admins read all" on profiles for select to authenticated using (public.is_admin());
create policy "profiles: drivers are public" on profiles for select to authenticated using (role = 'driver');
create policy "profiles: driver sees trip customer" on profiles for select to authenticated
  using (exists (select 1 from trips t where t.driver_id = auth.uid() and t.customer_id = profiles.id));
create policy "profiles: update own" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "driver_profiles: own" on driver_profiles for select to authenticated using (driver_id = auth.uid());
create policy "driver_profiles: admins" on driver_profiles for select to authenticated using (public.is_admin());
create policy "driver_profiles: approved are public" on driver_profiles for select to authenticated using (status = 'approved');
create policy "driver_profiles: driver updates own pre-approval" on driver_profiles for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid() and status in ('draft','submitted'));

create policy "driver_categories: readable" on driver_categories for select to authenticated using (true);
create policy "driver_categories: driver manages own" on driver_categories for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy "presence: own" on driver_presence for select to authenticated using (driver_id = auth.uid());
create policy "presence: admins" on driver_presence for select to authenticated using (public.is_admin());
create policy "presence: customer tracks own trip driver" on driver_presence for select to authenticated
  using (exists (
    select 1 from trips t
    where t.customer_id = auth.uid() and t.driver_id = driver_presence.driver_id
      and t.status in ('accepted','driver_arrived','started','in_progress')
  ));

create policy "trips: customer" on trips for select to authenticated using (customer_id = auth.uid());
create policy "trips: driver" on trips for select to authenticated using (driver_id = auth.uid());
create policy "trips: offered driver" on trips for select to authenticated
  using (exists (select 1 from trip_requests r where r.trip_id = trips.id and r.driver_id = auth.uid()));
create policy "trips: admins" on trips for select to authenticated using (public.is_admin());

create policy "trip_secrets: customer only" on trip_secrets for select to authenticated
  using (exists (select 1 from trips t where t.id = trip_secrets.trip_id and t.customer_id = auth.uid()));

create policy "trip_requests: driver" on trip_requests for select to authenticated using (driver_id = auth.uid());
create policy "trip_requests: trip customer" on trip_requests for select to authenticated
  using (exists (select 1 from trips t where t.id = trip_requests.trip_id and t.customer_id = auth.uid()));
create policy "trip_requests: admins" on trip_requests for select to authenticated using (public.is_admin());

create policy "trip_locations: parties" on trip_locations for select to authenticated
  using (exists (
    select 1 from trips t where t.id = trip_locations.trip_id
      and (t.customer_id = auth.uid() or t.driver_id = auth.uid())
  ) or public.is_admin());

create policy "ratings: parties read" on ratings for select to authenticated
  using (rater_id = auth.uid() or ratee_id = auth.uid() or public.is_admin());
create policy "ratings: trip party rates once" on ratings for insert to authenticated
  with check (
    rater_id = auth.uid()
    and exists (
      select 1 from trips t where t.id = ratings.trip_id
        and t.status in ('completed','paid','closed')
        and ((t.customer_id = auth.uid() and ratings.ratee_id = t.driver_id)
          or (t.driver_id = auth.uid() and ratings.ratee_id = t.customer_id))
    )
  );

create policy "setup_fees: driver own" on setup_fees for select to authenticated using (driver_id = auth.uid());
create policy "setup_fees: admins" on setup_fees for select to authenticated using (public.is_admin());

-- ── Storage: driver verification documents ───────────────────────────────
insert into storage.buckets (id, name, public) values ('driver-docs','driver-docs', false)
on conflict (id) do nothing;

create policy "driver-docs: upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "driver-docs: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'driver-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ── Realtime ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table trips, trip_requests, driver_presence, trip_locations;
