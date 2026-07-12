-- trips ↔ trip_requests policies referenced each other, causing infinite
-- recursion (42P17). SECURITY DEFINER helpers bypass RLS and break the cycle.
create or replace function public.is_trip_customer(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from trips where id = p_trip_id and customer_id = auth.uid()) $$;

create or replace function public.has_trip_offer(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from trip_requests where trip_id = p_trip_id and driver_id = auth.uid()) $$;

drop policy "trips: offered driver" on trips;
create policy "trips: offered driver" on trips for select to authenticated
  using (public.has_trip_offer(id));

drop policy "trip_requests: trip customer" on trip_requests;
create policy "trip_requests: trip customer" on trip_requests for select to authenticated
  using (public.is_trip_customer(trip_id));

drop policy "trip_secrets: customer only" on trip_secrets;
create policy "trip_secrets: customer only" on trip_secrets for select to authenticated
  using (public.is_trip_customer(trip_id));
