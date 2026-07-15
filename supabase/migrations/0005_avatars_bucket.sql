-- Public avatars bucket for driver/customer profile photos.
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
on conflict (id) do nothing;

-- Anyone can view (public bucket); users manage only their own folder (uid/...).
create policy "avatars: public read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars: upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
