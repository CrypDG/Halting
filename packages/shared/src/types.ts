/** Vehicle categories a driver can serve (PRD §2.2). */
export type VehicleCategorySlug =
  | 'car'
  | 'tractor'
  | 'truck'
  | 'bus'
  | 'school_bus'
  | 'crane'
  | 'earth_mover';

/** Indian driving-license classes / endorsements relevant to Acting. */
export type LicenseClass =
  | 'LMV'
  | 'LMV_TR'
  | 'HMV'
  | 'HGMV'
  | 'HPMV'
  | 'PSV'
  | 'SCHOOL_BUS_ENDORSEMENT'
  | 'HTV'
  | 'CEV';

export type DriverVerificationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type PresenceStatus = 'offline' | 'online' | 'busy';

/** Trip state machine (PRD §8). */
export type TripStatus =
  | 'requested'
  | 'accepted'
  | 'driver_arrived'
  | 'started'
  | 'in_progress'
  | 'completed'
  | 'paid'
  | 'closed'
  | 'cancelled_by_customer'
  | 'cancelled_by_driver'
  | 'expired'
  | 'disputed';

export type TripType = 'per_km' | 'per_day';
export type PaymentMode = 'cash' | 'in_app';
export type PaymentStatus = 'pending' | 'collected_claimed' | 'confirmed' | 'refunded';
export type SetupFeeStatus = 'pending' | 'paid' | 'waived';

export interface VehicleCategory {
  slug: VehicleCategorySlug;
  name: string;
  /** License-class sets that permit this category. Driver qualifies if ANY set is fully held. */
  requiredLicenseClasses: LicenseClass[][];
  defaultRadiusKm: number;
  maxRadiusKm: number;
}

export interface CategoryPricing {
  categorySlug: VehicleCategorySlug;
  pricePerKm: number | null;
  pricePerDay: number | null;
  overtimePerHour: number | null;
  outstationAllowance: boolean;
}

export interface FareInput {
  tripType: TripType;
  /** Actual GPS distance in km (per_km trips). */
  distanceKm?: number;
  /** Booked number of days (per_day trips). */
  days?: number;
  /** Hours worked beyond days × 8 (per_day trips). */
  overtimeHours?: number;
  pricing: Pick<CategoryPricing, 'pricePerKm' | 'pricePerDay' | 'overtimePerHour'>;
}

export interface FareBreakdown {
  base: number;
  overtime: number;
  total: number;
}

/** One-time driver setup fee (PRD §4.6), in INR. */
export const SETUP_FEE_INR = 500;
export const SETUP_FEE_GRACE_HOURS = 72;
export const REQUEST_ACCEPT_WINDOW_SECONDS = 30;
export const FREE_CANCELLATION_WINDOW_MINUTES = 2;
export const DAY_HOURS = 8;
