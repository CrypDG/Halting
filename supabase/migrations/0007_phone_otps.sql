-- Mobile-OTP login (PRD §3.1/§3.2 step 1). Codes are minted and checked only
-- by the phone-auth edge function (service role); clients never touch this
-- table directly, so RLS is enabled with no policies.
create table phone_otps (
  phone text primary key,          -- E.164, e.g. +919876543210
  code text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
alter table phone_otps enable row level security;
