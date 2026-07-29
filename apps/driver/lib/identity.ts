import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const DEVICE_KEY = 'acting.deviceId';

/** Stable per-install id — a new install/handset reads as a new device. */
export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function call(body: Record<string, unknown>) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${url}/functions/v1/verify-identity`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export type Assessment = {
  action: 'pass' | 'challenge' | 'block';
  message: string | null;
  fail_closed?: boolean;
  category_risk?: string;
  held?: boolean;
};

/** Ask the server whether this driver must prove who they are right now. */
export async function assessIdentity(params: { tripId?: string; category?: string }): Promise<Assessment> {
  return call({
    action: 'assess',
    trip_id: params.tripId,
    category: params.category,
    device_id: await getDeviceId(),
  });
}

/** Submit a selfie for liveness + face match. */
export async function submitIdentitySelfie(params: { tripId?: string; category?: string; base64: string }) {
  return call({
    action: 'submit',
    trip_id: params.tripId,
    category: params.category,
    device_id: await getDeviceId(),
    selfie_base64: params.base64,
  }) as Promise<{ passed?: boolean; held?: boolean; message?: string }>;
}

/**
 * Front-camera capture. A real deployment pairs this with a licensed
 * provider's SDK doing passive liveness — a plain photo capture cannot by
 * itself defeat someone holding up a printed picture.
 */
export async function captureSelfie(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission is required to verify your identity');
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    cameraType: ImagePicker.CameraType.front,
    quality: 0.6,
    base64: true,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  return res.assets[0].base64;
}

/** Randomised active challenge so a static photo/video replay is harder. */
export const LIVENESS_ACTIONS = [
  'Look straight at the camera',
  'Turn your head slightly left',
  'Turn your head slightly right',
  'Blink twice, then hold still',
] as const;

export const randomLivenessAction = () =>
  LIVENESS_ACTIONS[Math.floor(Math.random() * LIVENESS_ACTIONS.length)];
