-- Halting seed data (dev). All accounts use password: Halting123!
create extension if not exists pgcrypto with schema extensions;

-- ── Vehicle categories (PRD §2.2) ────────────────────────────────────────
insert into vehicle_categories (slug, name, required_license_classes, default_radius_km, max_radius_km) values
  ('car',         'Car',                          '[["LMV"]]',                                      10, 25),
  ('tractor',     'Tractor',                      '[["LMV"],["LMV_TR"]]',                           10, 50),
  ('truck',       'Truck / Lorry',                '[["HMV"],["HGMV"]]',                             10, 50),
  ('bus',         'Bus',                          '[["HMV","PSV"],["HPMV","PSV"]]',                 10, 50),
  ('school_bus',  'School Bus',                   '[["HPMV","PSV","SCHOOL_BUS_ENDORSEMENT"]]',      10, 50),
  ('crane',       'Crane',                        '[["HMV","HTV"]]',                                25, 50),
  ('earth_mover', 'Earth Mover (JCB / Excavator)','[["HMV"],["CEV"]]',                              25, 50)
on conflict (slug) do nothing;

insert into pricing_limits (category_slug, min_per_km, max_per_km, min_per_day, max_per_day) values
  ('car',         5,  50,  500,  5000),
  ('tractor',     5,  60,  500,  6000),
  ('truck',       8,  80,  800,  8000),
  ('bus',         8,  80,  800,  8000),
  ('school_bus',  8,  80,  800,  8000),
  ('crane',      10, 150, 1500, 20000),
  ('earth_mover',10, 150, 1500, 20000)
on conflict (category_slug) do nothing;

-- ── Dev users ────────────────────────────────────────────────────────────
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('10000000-0000-0000-0000-000000000001'::uuid, 'admin@halting.dev',    'admin',    'Halting Admin'),
      ('10000000-0000-0000-0000-000000000002'::uuid, 'customer@halting.dev', 'customer', 'Ravi Customer'),
      ('10000000-0000-0000-0000-000000000011'::uuid, 'driver1@halting.dev',  'driver',   'Kumar (Car LMV)'),
      ('10000000-0000-0000-0000-000000000012'::uuid, 'driver2@halting.dev',  'driver',   'Selvam (HMV Crane/Truck)'),
      ('10000000-0000-0000-0000-000000000013'::uuid, 'driver3@halting.dev',  'driver',   'Mani (School Bus, pending)')
    ) as t(id, email, role, full_name)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      u.email, extensions.crypt('Halting123!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', u.role, 'full_name', u.full_name),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', u.id::text, now(), now(), now()
    ) on conflict do nothing;
  end loop;
end $$;

update profiles set admin_role = 'super_admin' where id = '10000000-0000-0000-0000-000000000001';
update profiles set masked_aadhaar = 'XXXX-XXXX-4321', kyc_name = 'Ravi Customer', kyc_verified_at = now()
  where id = '10000000-0000-0000-0000-000000000002';

-- ── Demo drivers ─────────────────────────────────────────────────────────
-- driver1: approved car driver (LMV), T Nagar Chennai
update driver_profiles set
  status = 'approved', license_number = 'TN0119900001111', license_classes = '{LMV}',
  license_expiry = current_date + interval '4 years', license_verified_at = now(),
  police_cert_path = '10000000-0000-0000-0000-000000000011/police-cert.jpg',
  police_cert_expiry = current_date + interval '20 months', police_verified_at = now(),
  upi_or_account = 'kumar@upi', payout_verified_at = now(), experience_years = 8,
  submitted_at = now(), reviewed_at = now()
where driver_id = '10000000-0000-0000-0000-000000000011';

-- driver2: approved heavy-vehicle driver (HMV+HTV+PSV → truck, bus, crane, earth mover), Guindy
update driver_profiles set
  status = 'approved', license_number = 'HMV0919880002222', license_classes = '{HMV,HTV,PSV}',
  license_expiry = current_date + interval '3 years', license_verified_at = now(),
  police_cert_path = '10000000-0000-0000-0000-000000000012/police-cert.jpg',
  police_cert_expiry = current_date + interval '18 months', police_verified_at = now(),
  upi_or_account = 'selvam@upi', payout_verified_at = now(), experience_years = 15,
  submitted_at = now(), reviewed_at = now()
where driver_id = '10000000-0000-0000-0000-000000000012';

-- driver3: school-bus qualified, still awaiting admin review (for the verification queue demo)
update driver_profiles set
  status = 'submitted', license_number = 'HPMV0719920003333',
  license_classes = '{HPMV,PSV,SCHOOL_BUS_ENDORSEMENT}',
  license_expiry = current_date + interval '5 years', license_verified_at = now(),
  police_cert_path = '10000000-0000-0000-0000-000000000013/police-cert.jpg',
  police_cert_expiry = current_date + interval '11 months',
  upi_or_account = 'mani@upi', experience_years = 6, submitted_at = now()
where driver_id = '10000000-0000-0000-0000-000000000013';

insert into driver_categories (driver_id, category_slug, price_per_km, price_per_day, overtime_per_hour, outstation_allowance) values
  ('10000000-0000-0000-0000-000000000011', 'car',         12,  1200, 150, true),
  ('10000000-0000-0000-0000-000000000012', 'truck',       20,  2500, 250, true),
  ('10000000-0000-0000-0000-000000000012', 'crane',       null, 6000, 600, false),
  ('10000000-0000-0000-0000-000000000012', 'earth_mover', null, 5500, 550, false),
  ('10000000-0000-0000-0000-000000000013', 'school_bus',  null, 1800, 200, false),
  ('10000000-0000-0000-0000-000000000013', 'bus',         15,  2000, 200, false)
on conflict do nothing;

insert into driver_presence (driver_id, status, location, last_seen_at) values
  ('10000000-0000-0000-0000-000000000011', 'offline', st_setsrid(st_makepoint(80.2341, 13.0418), 4326)::geography, now()),
  ('10000000-0000-0000-0000-000000000012', 'offline', st_setsrid(st_makepoint(80.2206, 13.0067), 4326)::geography, now()),
  ('10000000-0000-0000-0000-000000000013', 'offline', st_setsrid(st_makepoint(80.2101, 13.0850), 4326)::geography, now())
on conflict (driver_id) do nothing;
