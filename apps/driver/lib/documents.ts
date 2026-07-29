import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type DocType = {
  slug: string; name: string; applies_to: string; category: string;
  required: boolean; heavy_only: boolean; needs_expiry: boolean; hint: string | null; sort: number;
};
export type UserDoc = {
  id: string; doc_type: string; file_path: string; doc_number: string | null; provider: string | null;
  issued_on: string | null; expires_on: string | null; status: 'pending' | 'verified' | 'rejected' | 'expired';
  rejection_reason: string | null; created_at: string;
};

export const HEAVY_CLASSES = ['HMV', 'HGMV', 'HPMV', 'HTV', 'PSV', 'CEV'];
export const isHeavy = (classes: string[] | null | undefined) =>
  (classes ?? []).some((c) => HEAVY_CLASSES.includes(c));

/** Expired policies must not read as verified. */
export function effectiveStatus(d: UserDoc): UserDoc['status'] {
  if (d.status === 'verified' && d.expires_on && new Date(d.expires_on) < new Date()) return 'expired';
  return d.status;
}
export function expiringSoon(d: UserDoc, days = 30): boolean {
  if (!d.expires_on) return false;
  const ms = new Date(d.expires_on).getTime() - Date.now();
  return ms > 0 && ms < days * 864e5;
}

/** Camera or library → returns base64 + a file extension, or null if cancelled. */
export async function pickDocumentImage(fromCamera: boolean): Promise<{ base64: string; ext: string } | null> {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(fromCamera ? 'Camera permission is required' : 'Photo library permission is required');

  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    base64: true,
  };
  const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  const uri = res.assets[0].uri ?? '';
  const ext = (uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return { base64: res.assets[0].base64, ext };
}

/** Upload the image to the private `documents` bucket and upsert the row. */
export async function saveDocument(params: {
  uid: string;
  docType: string;
  image: { base64: string; ext: string };
  docNumber?: string;
  provider?: string;
  expiresOn?: string | null;
}): Promise<void> {
  const { uid, docType, image, docNumber, provider, expiresOn } = params;
  const bytes = Uint8Array.from(atob(image.base64), (ch) => ch.charCodeAt(0));
  const path = `${uid}/${docType}.${image.ext}`;

  const { error: upErr } = await supabase.storage
    .from('documents')
    .upload(path, bytes, { contentType: `image/${image.ext === 'png' ? 'png' : 'jpeg'}`, upsert: true });
  if (upErr) throw upErr;

  // Re-uploading resets review state back to pending.
  const { error } = await supabase.from('user_documents').upsert(
    {
      owner_id: uid,
      doc_type: docType,
      file_path: path,
      doc_number: docNumber?.trim() || null,
      provider: provider?.trim() || null,
      expires_on: expiresOn || null,
      status: 'pending',
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
    },
    { onConflict: 'owner_id,doc_type' },
  );
  if (error) throw error;
}

/** Short-lived signed URL so the owner can preview what they uploaded. */
export async function signedDocUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('documents').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
