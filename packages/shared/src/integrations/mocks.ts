import type {
  KycProvider,
  KycResult,
  LicenseVerification,
  LicenseVerifier,
  MaskedCallProvider,
  PaymentGateway,
  SmsSender,
} from './index';
import type { LicenseClass } from '../types';

/**
 * MOCK PROVIDERS — development only. Every result is fabricated and
 * auto-approves. Replace via the provider interfaces before launch.
 */

export const mockKycProvider: KycProvider = {
  async verifyAadhaar({ phone }): Promise<KycResult> {
    const last4 = phone.replace(/\D/g, '').slice(-4).padStart(4, '0');
    return {
      verified: true,
      maskedAadhaar: `XXXX-XXXX-${last4}`,
      name: 'Mock Verified User',
      dob: '1990-01-01',
      verificationToken: `mock-kyc-${last4}-${Date.now()}`,
    };
  },
  async faceMatch() {
    return true;
  },
};

/**
 * Mock Sarathi: license classes are inferred from the license number prefix
 * so different demo drivers can hold different classes.
 *   "HMV..."  → HMV + HTV + PSV,  "HPMV..." → HPMV + PSV + school-bus,
 *   "CEV..."  → CEV,              anything else → LMV.
 */
export const mockLicenseVerifier: LicenseVerifier = {
  async verify({ licenseNumber }): Promise<LicenseVerification> {
    const upper = licenseNumber.toUpperCase();
    let classes: LicenseClass[];
    if (upper.startsWith('HPMV')) classes = ['HPMV', 'PSV', 'SCHOOL_BUS_ENDORSEMENT'];
    else if (upper.startsWith('HMV')) classes = ['HMV', 'HTV', 'PSV'];
    else if (upper.startsWith('CEV')) classes = ['CEV'];
    else classes = ['LMV'];
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 5);
    return {
      valid: true,
      holderName: 'Mock License Holder',
      classes,
      expiryDate: expiry.toISOString().slice(0, 10),
    };
  },
};

export const mockPaymentGateway: PaymentGateway = {
  async charge({ reference }) {
    return { ok: true, gatewayRef: `mockpay-${reference}-${Date.now()}` };
  },
  async verifyPayout() {
    return true;
  },
};

export const mockSmsSender: SmsSender = {
  async send({ phone, message }) {
    console.log(`[mock-sms] to=${phone}: ${message}`);
  },
};

export const mockMaskedCallProvider: MaskedCallProvider = {
  async createSession() {
    return { proxyNumber: '+91-000-MASKED' };
  },
};
