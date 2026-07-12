-- Security-advisor hardening.
-- Trigger functions are never meant to be called via PostgREST RPC.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.guard_profile_role() from anon, authenticated;
revoke execute on function public.enforce_driver_category() from anon, authenticated;
revoke execute on function public.refresh_driver_rating() from anon, authenticated;
revoke execute on function public.touch_updated_at() from anon, authenticated;

-- Client RPCs are for signed-in users only.
revoke execute on function public.go_online(double precision, double precision) from anon;
revoke execute on function public.go_offline() from anon;
revoke execute on function public.set_driver_location(double precision, double precision) from anon;
revoke execute on function public.nearby_drivers(text, double precision, double precision, double precision) from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_trip_customer(uuid) from anon;
revoke execute on function public.has_trip_offer(uuid) from anon;
-- Only edge functions (service role) compute trip distance.
revoke execute on function public.trip_distance_km(uuid) from anon, authenticated;

-- Pin search_path on the remaining mutable function.
alter function public.touch_updated_at() set search_path = public;
