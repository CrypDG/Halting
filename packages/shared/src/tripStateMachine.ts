import type { TripStatus } from './types';

/** Legal transitions of the trip state machine (PRD §8). */
export const TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  requested: ['accepted', 'expired', 'cancelled_by_customer'],
  accepted: ['driver_arrived', 'cancelled_by_customer', 'cancelled_by_driver'],
  driver_arrived: ['started', 'cancelled_by_customer', 'cancelled_by_driver'],
  started: ['in_progress'],
  in_progress: ['completed', 'disputed'],
  completed: ['paid', 'disputed'],
  paid: ['closed', 'disputed'],
  closed: [],
  cancelled_by_customer: [],
  cancelled_by_driver: [],
  expired: [],
  disputed: ['closed'],
};

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  return TRIP_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TripStatus, to: TripStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal trip transition: ${from} → ${to}`);
  }
}

/** States in which the driver is considered occupied (presence = busy). */
export const ACTIVE_TRIP_STATES: TripStatus[] = [
  'accepted',
  'driver_arrived',
  'started',
  'in_progress',
];

export const TERMINAL_TRIP_STATES: TripStatus[] = [
  'closed',
  'cancelled_by_customer',
  'cancelled_by_driver',
  'expired',
];

export function generateStartOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
