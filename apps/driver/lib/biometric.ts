import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const PREF_KEY = 'acting.biometricLock';

/** Device actually has a fingerprint / face enrolled we can use. */
export async function biometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && enrolled;
}

/** Human label for the enrolled method, for copy ("Unlock with Fingerprint"). */
export async function biometricLabel(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Fingerprint';
  return 'Biometrics';
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(PREF_KEY)) === '1';
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, on ? '1' : '0');
}

/** Prompt the device biometric. Returns true on success. */
export async function authenticate(reason: string): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  return res.success;
}
