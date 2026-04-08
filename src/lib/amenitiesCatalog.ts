export type AmenityGroup = 'utilities' | 'connectivity' | 'building' | 'services' | 'furnishings'

export interface AmenityOption {
  id: string
  label: string
  monthlyDelta: number
}

export interface AmenityItem {
  id: string
  label: string
  group: AmenityGroup
  options: AmenityOption[]
  supportsQuantity?: boolean
  supportsAreaSqft?: boolean
  supportsShared?: boolean
}

/** Canonical amenity definitions (single source for Home UI and listing-agent JSON schema). */
export const AMENITY_CATALOG: AmenityItem[] = [
  { id: 'electricity', label: 'Electricity', group: 'utilities', options: [{ id: 'base', label: 'Standard', monthlyDelta: 70 }, { id: 'high', label: 'High usage', monthlyDelta: 110 }] },
  { id: 'heating', label: 'Heating', group: 'utilities', options: [{ id: 'electric', label: 'Electric', monthlyDelta: 90 }, { id: 'gas', label: 'Natural gas', monthlyDelta: 80 }, { id: 'oil', label: 'Oil', monthlyDelta: 130 }] },
  { id: 'waterSewage', label: 'Water & sewage', group: 'utilities', options: [{ id: 'normal', label: 'Normal usage', monthlyDelta: 45 }, { id: 'high', label: 'High usage', monthlyDelta: 75 }] },
  { id: 'naturalGas', label: 'Natural gas (cooking/fireplace)', group: 'utilities', options: [{ id: 'basic', label: 'Basic', monthlyDelta: 25 }, { id: 'high', label: 'High', monthlyDelta: 45 }] },
  { id: 'waste', label: 'Waste management', group: 'utilities', options: [{ id: 'basic', label: 'Basic', monthlyDelta: 15 }, { id: 'full', label: 'Trash + recycling + compost', monthlyDelta: 30 }] },
  { id: 'internet', label: 'Internet / Wi-Fi', group: 'connectivity', options: [{ id: 'cable', label: 'Cable', monthlyDelta: 60 }, { id: 'fiber', label: 'High-speed fiber', monthlyDelta: 90 }] },
  { id: 'cableTv', label: 'Cable TV', group: 'connectivity', options: [{ id: 'basic', label: 'Basic local package', monthlyDelta: 25 }, { id: 'premium', label: 'Premium channels', monthlyDelta: 55 }] },
  { id: 'smartTech', label: 'Smart home tech', group: 'connectivity', options: [{ id: 'basic', label: 'Thermostat/keyless', monthlyDelta: 20 }, { id: 'full', label: 'Security cameras included', monthlyDelta: 45 }] },
  {
    id: 'parking',
    label: 'Parking',
    group: 'building',
    supportsQuantity: true,
    options: [{ id: 'guest', label: 'Guest only', monthlyDelta: 20 }, { id: 'reserved', label: 'Reserved stall', monthlyDelta: 70 }],
  },
  {
    id: 'garage',
    label: 'Garage',
    group: 'building',
    supportsQuantity: true,
    supportsShared: true,
    options: [{ id: 'heatedGarage', label: 'Underground heated garage', monthlyDelta: 150 }, { id: 'detached', label: 'Detached garage', monthlyDelta: 130 }],
  },
  {
    id: 'storage',
    label: 'Storage space',
    group: 'building',
    supportsQuantity: true,
    supportsAreaSqft: true,
    options: [{ id: 'locker', label: 'Locker', monthlyDelta: 25 }, { id: 'cage', label: 'Basement cage', monthlyDelta: 35 }],
  },
  { id: 'fitness', label: 'Fitness center', group: 'building', options: [{ id: 'gym', label: 'Gym', monthlyDelta: 35 }, { id: 'full', label: 'Gym + yoga + sauna', monthlyDelta: 65 }] },
  { id: 'poolSpa', label: 'Pool & spa', group: 'building', options: [{ id: 'pool', label: 'Indoor/outdoor pool', monthlyDelta: 60 }, { id: 'poolHotTub', label: 'Pool + hot tub', monthlyDelta: 95 }] },
  { id: 'commonAreas', label: 'Common areas', group: 'building', options: [{ id: 'lounge', label: 'Lounge / party room', monthlyDelta: 30 }, { id: 'rooftop', label: 'Rooftop deck + BBQ', monthlyDelta: 45 }] },
  { id: 'laundry', label: 'Laundry', group: 'building', options: [{ id: 'shared', label: 'Shared laundry room', monthlyDelta: 25 }, { id: 'inUnit', label: 'In-unit machines', monthlyDelta: 60 }] },
  { id: 'snow', label: 'Snow removal', group: 'services', options: [{ id: 'basic', label: 'Basic', monthlyDelta: 20 }, { id: 'priority', label: 'Priority plowing', monthlyDelta: 35 }] },
  { id: 'lawn', label: 'Lawn care', group: 'services', options: [{ id: 'basic', label: 'Basic landscaping', monthlyDelta: 20 }, { id: 'full', label: 'Full landscaping', monthlyDelta: 35 }] },
  { id: 'security', label: 'Concierge / security', group: 'services', options: [{ id: 'nightly', label: 'Nightly security patrols', monthlyDelta: 80 }, { id: '24h', label: '24/7 front desk', monthlyDelta: 140 }] },
  { id: 'housekeeping', label: 'Housekeeping', group: 'services', options: [{ id: 'monthly', label: 'Monthly cleaning', monthlyDelta: 70 }, { id: 'weekly', label: 'Weekly cleaning', monthlyDelta: 170 }] },
  { id: 'appliances', label: 'Appliances', group: 'furnishings', options: [{ id: 'standard', label: 'Fridge/stove/dishwasher/microwave', monthlyDelta: 55 }, { id: 'premium', label: 'Premium appliance package', monthlyDelta: 90 }] },
  { id: 'furniture', label: 'Furniture', group: 'furnishings', options: [{ id: 'semi', label: 'Semi-furnished', monthlyDelta: 100 }, { id: 'full', label: 'Fully furnished', monthlyDelta: 200 }] },
  { id: 'windowCoverings', label: 'Window coverings', group: 'furnishings', options: [{ id: 'basic', label: 'Blinds', monthlyDelta: 15 }, { id: 'premium', label: 'Curtains/shutters', monthlyDelta: 35 }] },
]

export const AMENITY_GROUP_LABELS: Record<AmenityGroup, string> = {
  utilities: 'Utilities (The Essentials)',
  connectivity: 'Connectivity & Tech',
  building: 'Building Amenities',
  services: 'Services & Maintenance',
  furnishings: 'Furnishings',
}

export const AMENITY_IDS = AMENITY_CATALOG.map((a) => a.id)

export const optionIdsForAmenity = (amenityId: string): string[] =>
  AMENITY_CATALOG.find((a) => a.id === amenityId)?.options.map((o) => o.id) ?? []
