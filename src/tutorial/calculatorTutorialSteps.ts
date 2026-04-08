export type CalculatorTutorialStep = {
  target: string
  title: string
  body: string
}

/** `data-tutorial-target` values on HomePage — keep in sync with markup. */
export const CALCULATOR_TUTORIAL_STEPS: CalculatorTutorialStep[] = [
  {
    target: 'ai-agent',
    title: 'Rent-O',
    body: 'Open this to paste a listing URL or a short memo. When the local agent server is running, Rent-O can auto-fill province, city, rent, amenities, and other fields from the text.',
  },
  {
    target: 'location',
    title: 'Province & city',
    body: 'Pick the province and municipality. The city list is a standard place-name list for your province; FairRent matches it to the market rent dataset (and uses the nearest market by distance when there is no exact dataset row).',
  },
  {
    target: 'unit-details',
    title: 'Unit details',
    body: 'Bedrooms affect the CMHC row. If you enter square footage, the market benchmark is adjusted by a percentage vs a typical size for that bedroom count (CMHC does not price by sqft). Asking rent is optional but powers the “Price asked” comparison.',
  },
  {
    target: 'building-type',
    title: 'Building type',
    body: 'Choose detached, semi-detached, townhouse, duplex, apartment, condo, or basement suite. This picks the closest CMHC structure bucket and applies a market-reference multiplier (defaults are editable in Admin → Building type factors).',
  },
  {
    target: 'amenities',
    title: 'Included options',
    body: 'Toggle what’s included, choose tiers, and adjust quantity or overrides. FairRent rolls these into fair price, minimum price, and max price in the results panel.',
  },
  {
    target: 'methodology-note',
    title: 'How amenities are valued',
    body: 'This note summarizes parking, shared garage, storage tiers, and utility scaling—use it as a quick sanity check on the numbers.',
  },
  {
    target: 'results',
    title: 'FairRent results',
    body: 'See minimum price, fair price, the benchmark without inclusions (CMHC-based), your asking rent vs fair, and max price. The range bar above the scale fades purple → green → red from min to fair to max.',
  },
]
