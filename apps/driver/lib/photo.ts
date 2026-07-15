import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

/** Pick an image, upload to the `avatars` bucket, save photo_url on the profile.
 *  Returns the new public URL, or null if the user cancelled. */
export async function pickAndUploadAvatar(uid: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo library permission is required');

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });
  if (res.canceled || !res.assets?.[0]?.base64) return null;

  const bytes = Uint8Array.from(atob(res.assets[0].base64), (ch) => ch.charCodeAt(0));
  const path = `${uid}/avatar.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`; // cache-bust so the new photo shows
  await supabase.from('profiles').update({ photo_url: url }).eq('id', uid);
  return url;
}
