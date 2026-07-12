import type { LicenseClass, VehicleCategory, VehicleCategorySlug } from './types';

/**
 * Vehicle category ↔ required license classes (PRD §2.2 / §3.3).
 * Each inner array is one qualifying combination; holding every class in
 * any one combination qualifies the driver for the category.
 */
export const VEHICLE_CATEGORIES: VehicleCategory[] = [
  {
    slug: 'car',
    name: 'Car',
    requiredLicenseClasses: [['LMV']],
    defaultRadiusKm: 10,
    maxRadiusKm: 25,
  },
  {
    slug: 'tractor',
    name: 'Tractor',
    requiredLicenseClasses: [['LMV'], ['LMV_TR']],
    defaultRadiusKm: 10,
    maxRadiusKm: 50,
  },
  {
    slug: 'truck',
    name: 'Truck / Lorry',
    requiredLicenseClasses: [['HMV'], ['HGMV']],
    defaultRadiusKm: 10,
    maxRadiusKm: 50,
  },
  {
    slug: 'bus',
    name: 'Bus',
    requiredLicenseClasses: [['HMV', 'PSV'], ['HPMV', 'PSV']],
    defaultRadiusKm: 10,
    maxRadiusKm: 50,
  },
  {
    slug: 'school_bus',
    name: 'School Bus',
    requiredLicenseClasses: [['HPMV', 'PSV', 'SCHOOL_BUS_ENDORSEMENT']],
    defaultRadiusKm: 10,
    maxRadiusKm: 50,
  },
  {
    slug: 'crane',
    name: 'Crane',
    requiredLicenseClasses: [['HMV', 'HTV']],
    defaultRadiusKm: 25,
    maxRadiusKm: 50,
  },
  {
    slug: 'earth_mover',
    name: 'Earth Mover (JCB / Excavator)',
    requiredLicenseClasses: [['HMV'], ['CEV']],
    defaultRadiusKm: 25,
    maxRadiusKm: 50,
  },
];

export function getCategory(slug: VehicleCategorySlug): VehicleCategory {
  const cat = VEHICLE_CATEGORIES.find((c) => c.slug === slug);
  if (!cat) throw new Error(`Unknown vehicle category: ${slug}`);
  return cat;
}

/**
 * PRD §3.3 hard constraint: a driver may serve category X only if their
 * verified license classes fully cover one of X's qualifying combinations.
 */
export function licensePermitsCategory(
  heldClasses: LicenseClass[],
  category: VehicleCategorySlug,
): boolean {
  const held = new Set(heldClasses);
  return getCategory(category).requiredLicenseClasses.some((combo) =>
    combo.every((cls) => held.has(cls)),
  );
}

/** All categories a set of license classes permits. */
export function permittedCategories(heldClasses: LicenseClass[]): VehicleCategorySlug[] {
  return VEHICLE_CATEGORIES.filter((c) => licensePermitsCategory(heldClasses, c.slug)).map(
    (c) => c.slug,
  );
}
