-- Documents & insurance (PRD §3.2/§3.4): uploads, expiry tracking, admin review.
-- Covers both sides — driver's own cover/endorsements and the customer's
-- vehicle paperwork — in one table keyed by owner.

create type document_status as enum ('pending', 'verified', 'rejected', 'expired');

-- Catalogue of what can be uploaded, and by whom.
create table document_types (
  slug text primary key,
  name text not null,
  applies_to user_role not null,            -- 'driver' | 'customer'
  category text not null,                   -- grouping in the UI
  required boolean not null default false,  -- blocks approval / booking
  heavy_only boolean not null default false,-- only for heavy-vehicle licences
  needs_expiry boolean not null default true,
  hint text,
  sort int not null default 0
);

create table user_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  doc_type text not null references document_types(slug),
  file_path text not null,                  -- storage key in the 'documents' bucket
  doc_number text,
  provider text,                            -- insurer / issuing authority
  issued_on date,
  expires_on date,
  status document_status not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, doc_type)               -- re-upload replaces the row
);
create index user_documents_owner_idx on user_documents(owner_id);
create index user_documents_status_idx on user_documents(status);

create trigger user_documents_touch before update on user_documents
  for each row execute function public.touch_updated_at();

-- Expired documents shouldn't read as "verified" anywhere.
create or replace function public.document_effective_status(p_status document_status, p_expires date)
returns document_status language sql immutable as $$
  select case
    when p_status = 'verified' and p_expires is not null and p_expires < current_date then 'expired'::document_status
    else p_status
  end
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table document_types enable row level security;
alter table user_documents enable row level security;

create policy "doc types readable" on document_types for select to authenticated using (true);

create policy "documents: own read" on user_documents for select to authenticated
  using (owner_id = auth.uid());
create policy "documents: admin read" on user_documents for select to authenticated
  using (public.is_admin());
-- Owner may upload and may replace their own doc while it is not yet verified.
create policy "documents: own insert" on user_documents for insert to authenticated
  with check (owner_id = auth.uid());
create policy "documents: own update" on user_documents for update to authenticated
  using (owner_id = auth.uid() and status in ('pending', 'rejected', 'expired'))
  with check (owner_id = auth.uid() and status in ('pending', 'rejected', 'expired'));
create policy "documents: own delete" on user_documents for delete to authenticated
  using (owner_id = auth.uid() and status <> 'verified');

-- ── Private storage bucket ───────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents bucket: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documents bucket: own read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "documents bucket: own update" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documents bucket: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Catalogue ────────────────────────────────────────────────────────────
insert into document_types (slug, name, applies_to, category, required, heavy_only, needs_expiry, hint, sort) values
  -- driver
  ('rider_insurance',    'Rider insurance',          'driver',   'Insurance',  true,  false, true,  'Personal accident cover for trips you drive', 10),
  ('health_insurance',   'Health insurance',         'driver',   'Insurance',  false, false, true,  'Medical cover for you', 20),
  ('life_insurance',     'Life insurance',           'driver',   'Insurance',  false, false, true,  'Term or life policy', 30),
  ('endorsement_cert',   'Endorsement certificate',  'driver',   'Heavy vehicle', true,  true,  true,  'HTV / PSV / CEV endorsement as applicable', 40),
  ('medical_fitness',    'Medical fitness',          'driver',   'Heavy vehicle', true,  true,  true,  'Form 1A medical certificate for heavy licences', 50),
  -- customer (vehicle owner)
  ('vehicle_insurance',  'Vehicle insurance',        'customer', 'Vehicle',    true,  false, true,  'Valid policy for the vehicle being driven', 10),
  ('vehicle_rc',         'Registration certificate', 'customer', 'Vehicle',    true,  false, false, 'RC book / smart card', 20),
  ('pollution_cert',     'Pollution certificate',    'customer', 'Vehicle',    false, false, true,  'Valid PUC', 30),
  ('vehicle_fitness',    'Fitness certificate',      'customer', 'Heavy vehicle', true,  true,  true,  'Mandatory for commercial/heavy vehicles', 40),
  ('vehicle_permit',     'National / state permit',  'customer', 'Heavy vehicle', true,  true,  true,  'Goods or passenger permit', 50)
on conflict (slug) do nothing;
