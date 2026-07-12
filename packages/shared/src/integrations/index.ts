/**
 * External-service boundaries. MVP ships with Mock* implementations only —
 * real providers (UIDAI-licensed KYC, Sarathi/Parivahan, Razorpay/Cashfree,
 * SMS gateway, call-masking) require commercial contracts and are swapped in
 * behind these interfaces without touching app code.
 */
import type { LicenseClass } from '../types';

export interface KycResult {
  verified: boolean;
  /** Masked Aadhaar, e.g. "XXXX-XXXX-1234". Raw number must never leave the provider. */
  maskedAadhaar: string;
  name: string;
  dob: string; // ISO date
  verificationToken: string;
}

export interface KycProvider {
  /** DigiLocker / OKYC flow via a UIDAI-licensed provider. */
  verifyAadhaar(params: { phone: string }): Promise<KycResult>;
  /** Selfie liveness + face match against the Aadhaar photo. */
  faceMatch(params: { selfieBase64: string; verificationToken: string }): Promise<boolean>;
}

export interface LicenseVerification {
  valid: boolean;
  holderName: string;
  classes: LicenseClass[];
  expiryDate: string; // ISO date
}

export interface LicenseVerifier {
  /** Sarathi/Parivahan lookup by license number + DOB. */
  verify(params: { licenseNumber: string; dob: string }): Promise<LicenseVerification>;
}

export interface PaymentGateway {
  /** Charge or issue a payment link at trip close. Returns a gateway reference. */
  charge(params: { amountInr: number; customerId: string; reference: string }): Promise<{ ok: boolean; gatewayRef: string }>;
  /** Penny-drop verification of driver bank / UPI details. */
  verifyPayout(params: { upiOrAccount: string }): Promise<boolean>;
}

export interface SmsSender {
  send(params: { phone: string; message: string }): Promise<void>;
}

export interface MaskedCallProvider {
  /** Returns a proxy number connecting the two parties without exposing either. */
  createSession(params: { phoneA: string; phoneB: string; tripId: string }): Promise<{ proxyNumber: string }>;
}

export * from './mocks';
