-- Actual trip distance: GPS breadcrumb path length, floored by the straight-line
-- pickup→destination distance (covers trips with sparse GPS logs).
create or replace function public.trip_distance_km(p_trip_id uuid) returns double precision
language sql stable security definer set search_path = public, extensions as $$
  select greatest(
    coalesce((
      select st_length(st_makeline(location::geometry order by recorded_at)::geography) / 1000.0
      from trip_locations where trip_id = p_trip_id
    ), 0),
    coalesce((
      select st_distance(pickup_location, destination_location) / 1000.0
      from trips where id = p_trip_id
    ), 0)
  )
$$;
