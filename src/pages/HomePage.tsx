import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CANADA_PROVINCES_FALLBACK } from '../lib/canadaProvincesFallback'
import { fetchCanadaProvinces, fetchPlacesForProvince, isCanadaGeoApiConfigured } from '../lib/canadaGeoApi'
import { loadCalculatorCityOptions, seedCalculatorCityOptions } from '../lib/calculatorCityList'
import { loadCmhcRents, resolveClosestInCityList } from '../lib/cmhcLookup'
import { defaultState } from '../lib/defaultState'
import { extractFromMemo, extractListing, LISTING_AGENT_DISPLAY_NAME, LISTING_TEXT_MAX_CHARS } from '../lib/listingAgent'
import type { FieldAssessment, FieldAssessmentStatus } from '../lib/listingAgent'
import { AMENITY_VALUATION_DEFAULTS, resolveAmenityMonthlyValue } from '../lib/amenityValuation'
import { addNamedSave, readNamedSaves, type NamedCalculatorSave } from '../lib/calculatorLocalSaves'
import { clearCalculatorCookie, readCalculatorCookie, writeCalculatorCookie } from '../lib/persistCookie'
import type { AmenityModifierInput, CalculatorFormState } from '../types/calculator'
import { fallbackCmhcRents, type CmhcRentRow } from '../data/cmhcRents'
import {
  getRegionalUtilityFactors,
  getUtilityRegionalMultiplier,
  type RegionalUtilityFactors,
} from '../data/regionalUtilityFactors'
import { getRegionalUtilityFactorsResolved } from '../lib/utilityFactorsFromDb'
import {
  BUILDING_TYPE_CATALOG,
  effectiveLocationForCmhcLookup,
  ensureLocationBuildingType,
  resolveBuildingTypeFactor,
} from '../lib/buildingTypes'
import { getBuildingTypeFactorsPolicy } from '../lib/adminDataStore'
import { AMENITY_CATALOG, AMENITY_GROUP_LABELS, type AmenityGroup, type AmenityItem } from '../lib/amenitiesCatalog'
import { applySquareFootageToMarketRent, SQFT_RENT_ELASTICITY } from '../lib/sqftMarketAdjustment'
import { buildMarketReference } from '../lib/marketRent'
import { buildGeoFallbackMarketRent } from '../lib/geoFallbackMarket'
import { runMarketRentPipeline } from '../lib/resolveMarketRent'
import { CalculatorStepHeading } from '../components/calculator/CalculatorStepHeading'
import { CalculatorTutorial } from '../components/calculator/CalculatorTutorial'

const amenities: AmenityItem[] = AMENITY_CATALOG

const groupLabels = AMENITY_GROUP_LABELS

const UTILITY_AMENITY_IDS = new Set(AMENITY_CATALOG.filter((a) => a.group === 'utilities').map((a) => a.id))

const defaultAmenityGroupOpen = Object.fromEntries(
  (Object.keys(groupLabels) as AmenityGroup[]).map((group) => [group, false]),
) as Record<AmenityGroup, boolean>

const defaultAmenityEnabled = Object.fromEntries(amenities.map((item) => [item.id, false])) as Record<string, boolean>
const defaultAmenityOptions = Object.fromEntries(amenities.map((item) => [item.id, item.options[0].id])) as Record<string, string>
const defaultAmenityOverrides = Object.fromEntries(amenities.map((item) => [item.id, undefined])) as Record<string, number | undefined>
const defaultAmenityModifiers = Object.fromEntries(
  amenities.map((item) => [
    item.id,
    {
      ...(item.supportsQuantity ? { quantity: 1 } : {}),
      ...(item.supportsAreaSqft ? { areaSqft: 0 } : {}),
      ...(item.supportsShared ? { shared: false } : {}),
    } satisfies AmenityModifierInput,
  ]),
) as Record<string, AmenityModifierInput>

const money = (value: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value)

const numberValue = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const clampModifier = (value: number, max: number, allowHalfStep = false) => {
  const normalized = Math.max(0, Math.min(max, value))
  return allowHalfStep ? Math.round(normalized * 2) / 2 : normalized
}

const statusColorClass: Record<FieldAssessmentStatus, string> = {
  found: 'bg-emerald-500 text-emerald-50',
  warning: 'bg-amber-500 text-amber-50',
  unknown: 'bg-slate-400 text-slate-50',
}

const defaultAssessment = (details: string): FieldAssessment => ({
  status: 'unknown',
  details,
})

const getAssessment = (assessments: Record<string, FieldAssessment>, key: string, fallbackDetails: string) =>
  assessments[key] ?? defaultAssessment(fallbackDetails)

const fieldBadgeTooltipText = (assessment: FieldAssessment): string => {
  if (assessment.status === 'unknown') return 'No info found'
  const snippet = (assessment.evidence?.trim() || assessment.details?.trim() || '').trim()
  const suffix = snippet || '(see listing)'
  if (assessment.status === 'found') return `Info found in listing: ${suffix}`
  return `Info found but can't confirm if included in rental price: ${suffix}`
}

const FieldInfoBadge = ({ assessment }: { assessment: FieldAssessment }) => {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  const tooltip = fieldBadgeTooltipText(assessment)

  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        className="-m-2 inline-flex h-11 min-w-11 cursor-default items-center justify-center rounded-full p-2 text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        aria-label={tooltip}
        aria-describedby={open ? tooltipId : undefined}
        title={tooltip}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        role="img"
      >
        <span
          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${statusColorClass[assessment.status]}`}
          aria-hidden
        >
          i
        </span>
      </span>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+8px)] z-[60] w-[min(18rem,calc(100vw-2rem))] max-w-72 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg"
        >
          {tooltip}
        </span>
      ) : null}
    </span>
  )
}

const mergeForm = (base: CalculatorFormState, incoming: Partial<CalculatorFormState>): CalculatorFormState => {
  const merged: CalculatorFormState = {
    ...base,
    ...incoming,
    location: { ...base.location, ...(incoming.location ?? {}) },
    unit: { ...base.unit, ...(incoming.unit ?? {}) },
    costs: { ...base.costs, ...(incoming.costs ?? {}) },
    assumptions: { ...base.assumptions, ...(incoming.assumptions ?? {}) },
  }
  return { ...merged, location: ensureLocationBuildingType(merged.location) }
}

const dedupeTrimmedCityNames = (names: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const t = raw.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export const HomePage = () => {
  const [agentInputMode, setAgentInputMode] = useState<'link' | 'memo'>('link')
  const [persistedState] = useState<CalculatorFormState | null>(() => readCalculatorCookie())
  const [form, setForm] = useState<CalculatorFormState>(() => mergeForm(defaultState, persistedState ?? {}))
  const [rows, setRows] = useState<CmhcRentRow[]>([])
  const [amenityEnabled, setAmenityEnabled] = useState<Record<string, boolean>>(() => ({
    ...defaultAmenityEnabled,
    ...(persistedState?.amenities?.enabled ?? {}),
  }))
  const [amenityOptions, setAmenityOptions] = useState<Record<string, string>>(() => ({
    ...defaultAmenityOptions,
    ...(persistedState?.amenities?.options ?? {}),
  }))
  const [amenityOverrides, setAmenityOverrides] = useState<Record<string, number | undefined>>(() => ({
    ...defaultAmenityOverrides,
    ...(persistedState?.amenities?.overrides ?? {}),
  }))
  const [amenityModifiers, setAmenityModifiers] = useState<Record<string, AmenityModifierInput>>(() => ({
    ...defaultAmenityModifiers,
    ...(persistedState?.amenities?.modifiers ?? {}),
  }))
  const [listingUrl, setListingUrl] = useState('')
  const [agentMemo, setAgentMemo] = useState('')
  const [agentStatus, setAgentStatus] = useState<string | null>(null)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [hasAgentResult, setHasAgentResult] = useState(false)
  const [isAgentSidebarOpen, setIsAgentSidebarOpen] = useState(false)
  const robotAgentButtonRef = useRef<HTMLButtonElement>(null)
  const howToButtonRef = useRef<HTMLButtonElement>(null)
  const homeScrollRef = useRef<HTMLDivElement>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialKey, setTutorialKey] = useState(0)
  const [agentPanelLayout, setAgentPanelLayout] = useState(() => ({
    top: 120,
    left: 16,
    width: 384,
    arrowLeft: 192,
  }))

  const updateAgentPanelLayout = useCallback(() => {
    const btn = robotAgentButtonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const margin = 16
    const panelWidth = Math.min(384, window.innerWidth - margin * 2)
    const idealLeft = rect.left + rect.width / 2 - panelWidth / 2
    const left = Math.max(margin, Math.min(idealLeft, window.innerWidth - margin - panelWidth))
    const top = rect.bottom + 12
    const robotCenterX = rect.left + rect.width / 2
    const arrowLeft = robotCenterX - left
    setAgentPanelLayout({ top, left, width: panelWidth, arrowLeft })
  }, [])

  useLayoutEffect(() => {
    if (!isAgentSidebarOpen) return
    updateAgentPanelLayout()
    const onMove = () => updateAgentPanelLayout()
    window.addEventListener('resize', onMove)
    const scrollEl = homeScrollRef.current
    scrollEl?.addEventListener('scroll', onMove, { passive: true })
    return () => {
      window.removeEventListener('resize', onMove)
      scrollEl?.removeEventListener('scroll', onMove)
    }
  }, [isAgentSidebarOpen, updateAgentPanelLayout])
  const [fieldAssessments, setFieldAssessments] = useState<Record<string, FieldAssessment>>({})
  const [amenityGroupOpen, setAmenityGroupOpen] = useState<Record<AmenityGroup, boolean>>(defaultAmenityGroupOpen)
  const [cityFallbackMessage, setCityFallbackMessage] = useState<string | null>(null)
  const [provinceOptions, setProvinceOptions] = useState(() => CANADA_PROVINCES_FALLBACK)
  const [cityOptions, setCityOptions] = useState<string[]>(() =>
    dedupeTrimmedCityNames([
      persistedState?.location?.city ?? defaultState.location.city,
      defaultState.location.city,
    ]),
  )
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [utilityFactors, setUtilityFactors] = useState<RegionalUtilityFactors>(() =>
    getRegionalUtilityFactors(defaultState.location.province),
  )
  const [, setStatcanMeta] = useState<{ refDate: string; quality: string } | null>(null)
  const [marketBaseRent, setMarketBaseRent] = useState<number>(0)
  const [geoFallbackMessage, setGeoFallbackMessage] = useState<string | null>(null)
  const [buildingTypeFactors, setBuildingTypeFactors] = useState<Record<string, number> | null>(null)
  const [namedSaves, setNamedSaves] = useState<NamedCalculatorSave[]>(() => readNamedSaves())
  const [saveNameDraft, setSaveNameDraft] = useState('')
  const [savedSelectKey, setSavedSelectKey] = useState(0)

  /** Latest city for province-change effect merge fallback (effect deps omit `city` to avoid re-fetching the list on every selection). */
  const formCityRef = useRef(form.location.city)
  formCityRef.current = form.location.city

  useEffect(() => {
    loadCmhcRents().then(setRows)
  }, [])

  useEffect(() => {
    void getBuildingTypeFactorsPolicy().then((p) => setBuildingTypeFactors(p.factors))
  }, [])

  useEffect(() => {
    if (!isCanadaGeoApiConfigured()) return
    let cancelled = false
    void fetchCanadaProvinces()
      .then((list) => {
        if (!cancelled && list.length > 0) setProvinceOptions(list)
      })
      .catch(() => {
        /* keep CANADA_PROVINCES_FALLBACK */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getRegionalUtilityFactorsResolved(form.location.province, form.location.city).then((f) => {
      if (!cancelled) setUtilityFactors(f)
    })
    return () => {
      cancelled = true
    }
  }, [form.location.province, form.location.city])

  useEffect(() => {
    const province = form.location.province
    let cancelled = false
    setCitiesLoading(true)

    void (async () => {
      try {
        let loaded = await loadCalculatorCityOptions(province)
        if (cancelled) return
        if (loaded.length === 0) {
          loaded = seedCalculatorCityOptions(formCityRef.current)
        }

        const merged = dedupeTrimmedCityNames([...loaded, formCityRef.current, defaultState.location.city])
        const finalList = merged.length > 0 ? merged : [defaultState.location.city]

        setForm((current) => {
          let nextCity = current.location.city
          if (!finalList.includes(nextCity)) {
            const resolved = resolveClosestInCityList(province, nextCity, finalList)
            nextCity =
              resolved.selectedCity && finalList.includes(resolved.selectedCity)
                ? resolved.selectedCity
                : (finalList[0] ?? defaultState.location.city)
          }

          if (nextCity === current.location.city) return current
          return {
            ...current,
            location: { ...current.location, city: nextCity },
          }
        })
        if (!cancelled && finalList.length > 0) {
          setCityOptions(finalList)
        }
      } finally {
        if (!cancelled) {
          setCitiesLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [form.location.province])

  const citySelectValue = useMemo(() => {
    const { province, city } = form.location
    if (cityOptions.length === 0) return city
    if (cityOptions.includes(city)) return city
    if (citiesLoading) return cityOptions[0] ?? city
    const resolution = resolveClosestInCityList(province, city, cityOptions)
    if (resolution.selectedCity && cityOptions.includes(resolution.selectedCity)) return resolution.selectedCity
    return cityOptions[0] ?? city
  }, [cityOptions, citiesLoading, form.location.city, form.location.province])

  /** After the city list finishes loading, align `location.city` with the municipal list. Must not run in layout: `cityOptions` is updated in an effect. */
  useEffect(() => {
    if (citiesLoading || cityOptions.length === 0) return
    const { city, province } = form.location
    if (cityOptions.includes(city)) return
    const resolution = resolveClosestInCityList(province, city, cityOptions)
    const canonical =
      resolution.selectedCity && cityOptions.includes(resolution.selectedCity)
        ? resolution.selectedCity
        : cityOptions[0]
    if (canonical && canonical !== city) {
      setForm((current) => ({
        ...current,
        location: { ...current.location, city: canonical },
      }))
    }
  }, [citiesLoading, cityOptions, form.location.city, form.location.province])

  useEffect(() => {
    const stateForCookie: CalculatorFormState = {
      ...form,
      amenities: {
        enabled: amenityEnabled,
        options: amenityOptions,
        overrides: amenityOverrides,
        modifiers: amenityModifiers,
      },
    }
    const timer = window.setTimeout(() => writeCalculatorCookie(stateForCookie), 400)
    return () => window.clearTimeout(timer)
  }, [form, amenityEnabled, amenityOptions, amenityOverrides, amenityModifiers])

  const runListingAgent = async () => {
    if (agentInputMode === 'link' && !listingUrl.trim()) {
      setAgentError('Paste a listing URL first.')
      return
    }

    if (agentInputMode === 'memo' && !agentMemo.trim()) {
      setAgentError('Add a memo first so AI can parse it.')
      return
    }

    setAgentLoading(true)
    setAgentError(null)
    setAgentStatus(null)
    setForm(defaultState)
    setAmenityEnabled({ ...defaultAmenityEnabled })
    setAmenityOptions({ ...defaultAmenityOptions })
    setAmenityOverrides({ ...defaultAmenityOverrides })
    setAmenityModifiers({ ...defaultAmenityModifiers })
    setFieldAssessments({})
    setCityFallbackMessage(null)
    setHasAgentResult(false)
    const reportAgentProgress = (message: string) => {
      setAgentStatus(message)
    }
    let agentMemoWasTruncated = false
    try {
      const result =
        agentInputMode === 'link'
          ? await extractListing(listingUrl.trim(), rows, reportAgentProgress)
          : await extractFromMemo(agentMemo.trim(), rows, reportAgentProgress, (t) => {
              agentMemoWasTruncated = t
            })
      const patch = result.formPatch
      const incomingLocation = patch.location
      const agentProv = incomingLocation?.province ?? defaultState.location.province
      const agentRawCity = incomingLocation?.city ?? defaultState.location.city
      let agentCityList = await loadCalculatorCityOptions(agentProv)
      if (agentCityList.length === 0) agentCityList = seedCalculatorCityOptions(agentRawCity)
      const resolvedAgentCity = resolveClosestInCityList(agentProv, agentRawCity, agentCityList)
      setForm((current) => {
        const merged = mergeForm(current, patch as Partial<CalculatorFormState>)
        return {
          ...merged,
          location: {
            ...merged.location,
            ...(resolvedAgentCity.selectedCity ? { city: resolvedAgentCity.selectedCity } : {}),
          },
        }
      })
      if (resolvedAgentCity.usedFallback && resolvedAgentCity.selectedCity) {
        setCityFallbackMessage(
          `Using closest city in the list: ${resolvedAgentCity.selectedCity} (instead of "${resolvedAgentCity.requestedCity || 'blank city'}").`,
        )
      }
      const safeAmenityEnabledPatch = { ...result.amenityEnabledPatch }
      for (const [id, enabled] of Object.entries(safeAmenityEnabledPatch)) {
        if (!enabled) continue
        if (!UTILITY_AMENITY_IDS.has(id)) continue
        const assessment = result.fieldAssessments?.[`amenity.${id}`]
        if (assessment?.status === 'warning' || assessment?.status === 'unknown') {
          safeAmenityEnabledPatch[id] = false
        }
      }
      setAmenityEnabled((current) => ({ ...current, ...safeAmenityEnabledPatch }))
      setAmenityOptions((current) => ({ ...current, ...result.amenityOptionPatch }))
      setAmenityModifiers((current) => ({ ...current, ...result.amenityModifierPatch }))
      setAmenityOverrides((current) => ({ ...current, ...result.amenityOverridePatch }))
      setFieldAssessments(() => ({ ...result.fieldAssessments }))
      setHasAgentResult(true)
      const baseAgentStatus =
        result.notes.length === 0
          ? `${agentInputMode === 'link' ? 'Listing' : 'Memo'} parsed and fields updated.`
          : `${agentInputMode === 'link' ? 'Listing' : 'Memo'} parsed. Some values need manual review: ${result.notes.join(', ')}.`
      const memoTruncationNote =
        agentInputMode === 'memo' && agentMemoWasTruncated
          ? ` Memo was truncated to ${LISTING_TEXT_MAX_CHARS.toLocaleString()} characters for the model.`
          : ''
      setAgentStatus(baseAgentStatus + memoTruncationNote)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse listing'
      setAgentError(message)
    } finally {
      setAgentLoading(false)
    }
  }

  const rentDataset = useMemo(() => (rows.length > 0 ? rows : fallbackCmhcRents), [rows])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const places = await fetchPlacesForProvince(form.location.province)
      if (cancelled) return

      const pipeline = await runMarketRentPipeline({
        formLocation: form.location,
        dataset: rentDataset,
        places,
        postalFsa: null,
      })

      if (pipeline.nameLookup) {
        const cmhc = pipeline.nameLookup.averageRent
        setGeoFallbackMessage(null)
        const r = await buildMarketReference({
          province: form.location.province,
          city: pipeline.resolvedCityForMarket ?? form.location.city,
          bedrooms: form.location.bedrooms,
          cmhcAverageRent: cmhc,
        })
        if (cancelled) return
        setStatcanMeta(r.statcan ? { refDate: r.statcan.refDate, quality: r.statcan.quality } : null)
        setMarketBaseRent(r.blendedMarketRent)
        return
      }

      setStatcanMeta(null)
      setMarketBaseRent(0)
      setGeoFallbackMessage(null)

      if (pipeline.bundledGeo.ok) {
        setMarketBaseRent(pipeline.bundledGeo.selected.adjustedRent)
        const km = Math.round(pipeline.bundledGeo.selected.distanceKm)
        const pct = Math.round((1 - pipeline.bundledGeo.selected.factor) * 100)
        setGeoFallbackMessage(
          `Using nearest market in the dataset: ${pipeline.bundledGeo.selected.city} (~${km} km, distance factor −${pct}%).`,
        )
        return
      }

      const fallback = await buildGeoFallbackMarketRent({
        province: form.location.province,
        city: form.location.city,
        bedrooms: form.location.bedrooms,
      })
      if (cancelled) return
      if (fallback?.ok) {
        setMarketBaseRent(fallback.selected.adjustedRent)
        const km = Math.round(fallback.selected.distanceKm)
        const pct = Math.round((1 - fallback.selected.factor) * 100)
        setGeoFallbackMessage(
          `Using nearest CMA: ${fallback.selected.cma} (~${km} km away, -${pct}% floor=${fallback.policy.floorFactor}).`,
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [form.location, rentDataset])

  const sqftMarketAdjustment = useMemo(
    () => applySquareFootageToMarketRent(marketBaseRent, form.location.bedrooms, form.unit.squareFeet),
    [marketBaseRent, form.location.bedrooms, form.unit.squareFeet],
  )
  const preBuildingMarketReference = useMemo(
    () => (sqftMarketAdjustment ? sqftMarketAdjustment.adjustedRent : marketBaseRent),
    [sqftMarketAdjustment, marketBaseRent],
  )
  const buildingTypeFactor = useMemo(
    () => resolveBuildingTypeFactor(form.location.buildingType ?? '', buildingTypeFactors ?? undefined),
    [form.location.buildingType, buildingTypeFactors],
  )
  const marketReference = useMemo(() => {
    const raw = preBuildingMarketReference * buildingTypeFactor
    return Math.round((raw + Number.EPSILON) * 100) / 100
  }, [preBuildingMarketReference, buildingTypeFactor])

  const amenityValueById = useMemo(() => {
    return Object.fromEntries(
      amenities.map((item) => {
        const optionId = amenityOptions[item.id]
        const opt = item.options.find((entry) => entry.id === optionId)
        const regionalMultiplier = getUtilityRegionalMultiplier(item.id, optionId, utilityFactors)
        const resolved = resolveAmenityMonthlyValue({
          enabled: amenityEnabled[item.id],
          amenityId: item.id,
          baseDelta: opt?.monthlyDelta ?? 0,
          modifier: amenityModifiers[item.id],
          override: amenityOverrides[item.id],
          regionalMultiplier,
        })
        return [item.id, resolved]
      }),
    ) as Record<string, number>
  }, [amenityEnabled, amenityOptions, amenityModifiers, amenityOverrides, utilityFactors])
  const amenityDelta = useMemo(
    () => Object.values(amenityValueById).reduce((sum, value) => sum + value, 0),
    [amenityValueById],
  )

  const renterFairTarget = marketReference + amenityDelta
  const fairTarget = renterFairTarget
  const bareMinimum = renterFairTarget * 0.9
  const displayFairTarget = fairTarget
  const displayBareMinimum = bareMinimum
  const displayAskingDelta = form.askingRent ? form.askingRent - displayFairTarget : null
  const baseMarketHighest = marketReference * 1.15
  const displayMarketHighest = baseMarketHighest + amenityDelta
  const scalePoints = [
    { id: 'minimum', label: 'Minimum price', value: displayBareMinimum, colorClass: 'text-brand-700' },
    {
      id: 'marketReference',
      label: 'Without Inclusions',
      value: marketReference,
      colorClass: 'text-slate-900',
    },
    { id: 'fairTarget', label: 'Fair price', value: displayFairTarget, colorClass: 'text-emerald-700' },
    { id: 'marketHighest', label: 'Max price', value: displayMarketHighest, colorClass: 'text-red-700' },
    ...(form.askingRent ? [{ id: 'priceAsked', label: 'Price asked', value: form.askingRent, colorClass: 'text-blue-600' }] : []),
  ]
  const rawScaleMin = Math.min(...scalePoints.map((point) => point.value))
  const rawScaleMax = Math.max(...scalePoints.map((point) => point.value))
  const rawScaleRange = rawScaleMax - rawScaleMin
  const scalePadding = rawScaleRange > 0 ? rawScaleRange * 0.1 : Math.max(rawScaleMax * 0.1, 1)
  const scaleMin = Math.max(0, rawScaleMin - scalePadding)
  const scaleMax = rawScaleMax + scalePadding
  const scaleRange = Math.max(scaleMax - scaleMin, 1)
  const getScalePosition = (value: number) => ((value - scaleMin) / scaleRange) * 100
  const scalePlotPoints = useMemo(() => {
    const withPosition = scalePoints.map((point) => ({
      ...point,
      percent: getScalePosition(point.value),
      isAboveLine: point.id === 'priceAsked',
    }))
    const estimateSpanPercent = (point: (typeof withPosition)[number]) => {
      // Estimate label/value footprint on the horizontal scale.
      const base = point.isAboveLine ? 18 : 20
      const labelFactor = Math.min(8, Math.ceil(point.label.length / 8))
      return base + labelFactor
    }
    const assignRows = (points: Array<(typeof withPosition)[number]>, minGapPercent: number) => {
      const sorted = [...points].sort((a, b) => a.percent - b.percent)
      const lastEndByRow: number[] = []
      const rowById = new Map<string, number>()
      sorted.forEach((point) => {
        const span = estimateSpanPercent(point)
        const start = Math.max(0, point.percent - span / 2)
        const end = Math.min(100, point.percent + span / 2)
        let assignedRow = lastEndByRow.findIndex((lastEnd) => start - lastEnd >= minGapPercent)
        if (assignedRow === -1) {
          assignedRow = lastEndByRow.length
          lastEndByRow.push(end)
        } else {
          lastEndByRow[assignedRow] = end
        }
        rowById.set(point.id, assignedRow)
      })
      return { rowById, maxRow: Math.max(0, lastEndByRow.length - 1) }
    }
    const topRows = assignRows(
      withPosition.filter((point) => point.isAboveLine),
      3,
    )
    const bottomRows = assignRows(
      withPosition.filter((point) => !point.isAboveLine),
      2,
    )

    return {
      points: withPosition.map((point) => ({
        ...point,
        row: point.isAboveLine ? topRows.rowById.get(point.id) ?? 0 : bottomRows.rowById.get(point.id) ?? 0,
      })),
      maxTopRow: topRows.maxRow,
      maxBottomRow: bottomRows.maxRow,
    }
  }, [scalePoints, scaleMin, scaleRange])
  const scaleTopRowGap = 14
  const scaleBottomRowGap = 15
  /** Space above the axis for the min–max range bracket + label */
  const scaleRangeBracketPad = 22
  const scaleLineTop = 30 + scalePlotPoints.maxTopRow * scaleTopRowGap + scaleRangeBracketPad
  const scaleContainerHeight =
    68 +
    scalePlotPoints.maxTopRow * scaleTopRowGap +
    scalePlotPoints.maxBottomRow * scaleBottomRowGap +
    scaleRangeBracketPad
  const priceRangeBracket = useMemo(() => {
    const pos = (v: number) => ((v - scaleMin) / scaleRange) * 100
    const pMin = pos(displayBareMinimum)
    const pFair = pos(displayFairTarget)
    const pMax = pos(displayMarketHighest)
    const left = Math.min(pMin, pMax)
    const right = Math.max(pMin, pMax)
    const width = Math.max(right - left, 0.75)
    const fairStop = width > 0 ? Math.min(100, Math.max(0, ((pFair - left) / width) * 100)) : 50
    const gradient = `linear-gradient(90deg, rgba(124,58,237,0.2) 0%, rgba(124,58,237,0.5) 12%, rgba(16,185,129,0.55) ${fairStop}%, rgba(220,38,38,0.5) 88%, rgba(220,38,38,0.2) 100%)`
    return { left, width, gradient }
  }, [displayBareMinimum, displayFairTarget, displayMarketHighest, scaleMin, scaleRange])

  const renderFieldBadge = (key: string, fallbackDetails: string) => {
    if (!hasAgentResult) return null
    return <FieldInfoBadge assessment={getAssessment(fieldAssessments, key, fallbackDetails)} />
  }

  const resetCalculator = useCallback(() => {
    clearCalculatorCookie()
    setForm(defaultState)
    setAmenityEnabled(defaultAmenityEnabled)
    setAmenityOptions(defaultAmenityOptions)
    setAmenityOverrides(defaultAmenityOverrides)
    setAmenityModifiers(defaultAmenityModifiers)
    setFieldAssessments({})
    setHasAgentResult(false)
    setCityFallbackMessage(null)
  }, [])

  const applyNamedSaveById = useCallback((id: string) => {
    const entry = readNamedSaves().find((s) => s.id === id)
    if (!entry) return
    const f = entry.form
    setForm(
      mergeForm(defaultState, {
        location: f.location,
        unit: f.unit,
        costs: f.costs,
        assumptions: f.assumptions,
        askingRent: f.askingRent,
        manualMarketRent: f.manualMarketRent,
      }),
    )
    const am = f.amenities
    setAmenityEnabled({ ...defaultAmenityEnabled, ...(am?.enabled ?? {}) })
    setAmenityOptions({ ...defaultAmenityOptions, ...(am?.options ?? {}) })
    setAmenityOverrides({ ...defaultAmenityOverrides, ...(am?.overrides ?? {}) })
    setAmenityModifiers(() => {
      const next: Record<string, AmenityModifierInput> = { ...defaultAmenityModifiers }
      for (const key of Object.keys(next)) {
        next[key] = {
          ...defaultAmenityModifiers[key],
          ...(am?.modifiers?.[key] ?? {}),
        }
      }
      return next
    })
    setFieldAssessments({})
    setHasAgentResult(false)
    setCityFallbackMessage(null)
    setSavedSelectKey((k) => k + 1)
  }, [])

  const saveCurrentAsNamed = useCallback(() => {
    const formSnapshot: CalculatorFormState = {
      ...form,
      amenities: {
        enabled: amenityEnabled,
        options: amenityOptions,
        overrides: amenityOverrides,
        modifiers: amenityModifiers,
      },
    }
    const created = addNamedSave(saveNameDraft, formSnapshot)
    if (created) {
      setNamedSaves(readNamedSaves())
      setSaveNameDraft('')
    }
  }, [
    form,
    amenityEnabled,
    amenityOptions,
    amenityOverrides,
    amenityModifiers,
    saveNameDraft,
  ])

  const handleTutorialStart = useCallback(() => {
    resetCalculator()
    setIsAgentSidebarOpen(false)
  }, [resetCalculator])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <aside
        style={{
          top: agentPanelLayout.top,
          left: agentPanelLayout.left,
          width: agentPanelLayout.width,
        }}
        className={`fixed z-50 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl transition-opacity duration-200 ${
          isAgentSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!isAgentSidebarOpen}
      >
        <div
          className="agent-popup-arrow absolute -top-2 h-4 w-4 border-l border-t border-slate-200 bg-white"
          style={{
            left: agentPanelLayout.arrowLeft,
            transform: 'translateX(-50%) rotate(45deg)',
          }}
          aria-hidden="true"
        />
        <div className="max-h-[70vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">{LISTING_AGENT_DISPLAY_NAME}</h3>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
              onClick={() => setIsAgentSidebarOpen(false)}
            >
              Close
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Paste a listing link (page text is fetched, then parsed by {LISTING_AGENT_DISPLAY_NAME}) or write a memo. With the local agent
            server running, {LISTING_AGENT_DISPLAY_NAME} can fill calculator fields supported by the text—including location, rent, amenities,
            and any costs or assumptions explicitly stated.
          </p>
          <div className="mt-3 inline-flex rounded-md border border-brand-200 bg-brand-50 p-1 text-xs font-medium text-slate-800">
            <button
              type="button"
              className={`rounded px-2.5 py-1 ${agentInputMode === 'link' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
              onClick={() => setAgentInputMode('link')}
            >
              Listing link
            </button>
            <button
              type="button"
              className={`rounded px-2.5 py-1 ${agentInputMode === 'memo' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
              onClick={() => setAgentInputMode('memo')}
            >
              Memo text
            </button>
          </div>
          <div
            className={
              agentInputMode === 'memo'
                ? 'mt-3 grid grid-cols-1 gap-2'
                : 'mt-3 grid gap-2 sm:grid-cols-[1fr_auto]'
            }
          >
            {agentInputMode === 'link' ? (
              <input
                type="url"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                placeholder="https://example.com/listing/123"
                value={listingUrl}
                onChange={(e) => setListingUrl(e.target.value)}
              />
            ) : (
              <textarea
                className="min-h-44 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:min-h-52"
                placeholder="Example: Looking for a 2 bedroom in Calgary, AB around $2100/month, 850 sqft, with in-unit laundry and one parking spot."
                value={agentMemo}
                onChange={(e) => setAgentMemo(e.target.value)}
              />
            )}
            <button
              type="button"
              className={`rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-brand-400 ${
                agentInputMode === 'memo' ? 'justify-self-start' : ''
              }`}
              onClick={() => {
                void runListingAgent()
              }}
              disabled={agentLoading || rows.length === 0}
            >
              {agentLoading ? 'Analyzing...' : agentInputMode === 'link' ? 'Auto-fill from link' : 'Auto-fill from memo'}
            </button>
          </div>
          {agentLoading || agentStatus ? (
            <p className={`mt-2 text-sm text-slate-700 ${agentLoading ? 'animate-pulse' : ''}`}>
              {agentStatus ?? 'Working…'}
            </p>
          ) : null}
          {agentError ? <p className="mt-2 text-sm text-red-700">{agentError}</p> : null}
        </div>
      </aside>
      <div ref={homeScrollRef} className="min-h-0 flex-1 overflow-y-auto py-4 pr-1">
        <section className="app-surface space-y-5 p-5 md:p-6">
        <div
          className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2"
          data-tutorial-target="ai-agent"
        >
          <div className="flex min-w-0 w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-1">
            <label className="flex min-w-0 max-w-full flex-1 basis-[min(100%,14rem)] items-center sm:max-w-[12rem] sm:flex-none">
              <span className="sr-only">Load a saved calculator setup</span>
              <select
                key={savedSelectKey}
                className="h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800"
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value
                  if (!id) return
                  applyNamedSaveById(id)
                }}
                aria-label="Load a saved setup"
              >
                <option value="">Load saved…</option>
                {namedSaves.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="text"
              className="h-9 min-w-[6rem] flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm sm:max-w-[10rem] sm:flex-none"
              placeholder="Save name"
              value={saveNameDraft}
              onChange={(e) => setSaveNameDraft(e.target.value)}
              maxLength={80}
              aria-label="Name for saved setup"
            />
            <button
              type="button"
              className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => saveCurrentAsNamed()}
              disabled={!saveNameDraft.trim()}
            >
              Save
            </button>
            <button
              type="button"
              className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={resetCalculator}
            >
              Reset
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              ref={howToButtonRef}
              type="button"
              className="rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50/90"
              onClick={() => {
                handleTutorialStart()
                setTutorialKey((k) => k + 1)
                setTutorialOpen(true)
              }}
            >
              How to
            </button>
            <button
              ref={robotAgentButtonRef}
              type="button"
              aria-label={isAgentSidebarOpen ? 'Close AI Listing Agent' : 'Open AI Listing Agent'}
              className="agent-bot-float shrink-0 rounded-full border border-brand-200 bg-white p-2 text-brand-700 shadow-sm transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2"
              onClick={() => setIsAgentSidebarOpen((current) => !current)}
            >
              <svg className="agent-bot-wave" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="5" y="6" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 3V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="9.5" cy="11" r="1" fill="currentColor" />
                <circle cx="14.5" cy="11" r="1" fill="currentColor" />
                <path d="M9 14.5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <section
          className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-50/90 to-brand-50/40 p-3.5 ring-1 ring-slate-900/[0.03]"
          aria-labelledby="home-property-heading"
        >
          <CalculatorStepHeading step={1} id="home-property-heading">
            Property
          </CalculatorStepHeading>
          <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5">
            <div data-tutorial-target="location" className="flex min-w-0 flex-wrap items-end gap-x-2 gap-y-1.5">
              <label className="flex h-8 w-[9rem] shrink-0 items-center gap-1.5 text-xs text-slate-600">
                <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap font-medium">
                  Province
                  {renderFieldBadge('location.province', 'Run AI extraction to see field confidence and proof.')}
                </span>
                <select
                  className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 text-sm"
                  value={form.location.province}
                  onChange={(e) => {
                    setCityFallbackMessage(null)
                    setForm((current) => ({
                      ...current,
                      location: { ...current.location, province: e.target.value },
                    }))
                  }}
                >
                  {provinceOptions.map((p) => (
                    <option key={p.code} value={p.code} title={p.name}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex h-8 min-w-[9rem] max-w-[min(100%,14rem)] flex-1 items-center gap-1.5 text-xs text-slate-600 sm:min-w-[10rem]">
                <span className="inline-flex shrink-0 items-center gap-0.5 font-medium">
                  City
                  {renderFieldBadge('location.city', 'Run AI extraction to see field confidence and proof.')}
                </span>
                <select
                  className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 text-sm disabled:opacity-70"
                  disabled={citiesLoading && cityOptions.length === 0}
                  value={citySelectValue}
                  onChange={(e) => {
                    setCityFallbackMessage(null)
                    setForm((current) => ({ ...current, location: { ...current.location, city: e.target.value } }))
                  }}
                >
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div data-tutorial-target="unit-details" className="flex min-w-0 flex-wrap items-end gap-x-2 gap-y-1.5">
              <label className="flex h-8 min-w-[6.75rem] shrink-0 items-center gap-1.5 text-xs text-slate-600">
                <span className="inline-flex shrink-0 items-center gap-0.5 font-medium">
                  Beds
                  {renderFieldBadge('location.bedrooms', 'Run AI extraction to see field confidence and proof.')}
                </span>
                <select
                  className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 text-sm tabular-nums"
                  value={Math.min(5, Math.max(0, form.location.bedrooms))}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      location: { ...current.location, bedrooms: Number(e.target.value) },
                    }))
                  }
                >
                  <option value={0}>Studio</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5+</option>
                </select>
              </label>
              <label
                data-tutorial-target="building-type"
                className="flex h-8 min-w-[min(100%,12rem)] max-w-[min(100%,18rem)] flex-1 items-center gap-1.5 text-xs text-slate-600"
              >
                <span className="inline-flex shrink-0 items-center gap-0.5 font-medium">
                  Building
                  {renderFieldBadge('location.buildingType', 'Run AI extraction to see field confidence and proof.')}
                </span>
                <select
                  className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 text-sm"
                  value={ensureLocationBuildingType(form.location).buildingType ?? 'apartment'}
                  onChange={(e) => {
                    const buildingType = e.target.value
                    setForm((current) => {
                      const nextLoc = { ...current.location, buildingType }
                      const eff = effectiveLocationForCmhcLookup(nextLoc)
                      return { ...current, location: { ...nextLoc, structureType: eff.structureType } }
                    })
                  }}
                >
                  {BUILDING_TYPE_CATALOG.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-8 min-w-[6.5rem] items-center gap-1.5 text-xs text-slate-600">
                <span className="inline-flex shrink-0 items-center gap-0.5 font-medium" title="Square feet (optional)">
                  Sqft
                  {renderFieldBadge('unit.squareFeet', 'Run AI extraction to see field confidence and proof.')}
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="opt."
                  className="h-8 w-[4.25rem] rounded border border-slate-300 bg-white px-1.5 text-sm tabular-nums"
                  value={form.unit.squareFeet ?? ''}
                  onChange={(e) => {
                    const v = numberValue(e.target.value)
                    setForm((current) => ({
                      ...current,
                      unit: { squareFeet: v > 0 ? v : undefined },
                    }))
                  }}
                />
              </label>
              <label className="flex h-8 min-w-[6.5rem] items-center gap-1.5 text-xs text-slate-600">
                <span className="inline-flex shrink-0 items-center gap-0.5 font-medium" title="Asking rent (optional)">
                  Rent
                  {renderFieldBadge('askingRent', 'Run AI extraction to see field confidence and proof.')}
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="opt."
                  className="h-8 w-[4.75rem] rounded border border-slate-300 bg-white px-1.5 text-sm tabular-nums"
                  value={form.askingRent ?? ''}
                  onChange={(e) => setForm((current) => ({ ...current, askingRent: numberValue(e.target.value) || undefined }))}
                />
              </label>
            </div>
          </div>
          {cityFallbackMessage ? <p className="mt-1.5 text-[11px] leading-snug text-amber-700">{cityFallbackMessage}</p> : null}
          {geoFallbackMessage ? <p className="mt-1.5 text-[11px] leading-snug text-amber-700">{geoFallbackMessage}</p> : null}
        </section>

        <div data-tutorial-target="amenities" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CalculatorStepHeading step={2} className="mb-0 min-w-0 flex-1">
            Included options
          </CalculatorStepHeading>
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
            onClick={() =>
              setAmenityGroupOpen((current) => {
                const shouldExpand = !(Object.values(current).every(Boolean))
                return Object.fromEntries(
                  (Object.keys(groupLabels) as AmenityGroup[]).map((group) => [group, shouldExpand]),
                ) as Record<AmenityGroup, boolean>
              })
            }
          >
            {Object.values(amenityGroupOpen).every(Boolean) ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
        {(Object.keys(groupLabels) as AmenityGroup[]).map((group) => (
          <div key={group} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-800"
              onClick={() =>
                setAmenityGroupOpen((current) => ({
                  ...current,
                  [group]: !current[group],
                }))
              }
            >
              <span>{groupLabels[group]}</span>
              <span className="text-base leading-none" aria-hidden="true">
                {amenityGroupOpen[group] ? '−' : '+'}
              </span>
            </button>
            {amenityGroupOpen[group] ? (
              <div className="mt-3 space-y-2">
                {amenities.filter((item) => item.group === group).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-x-2"
                  >
                    <label className="flex min-w-0 shrink-0 items-center gap-2 text-sm text-slate-700 sm:max-w-[11rem]">
                      <input
                        type="checkbox"
                        checked={amenityEnabled[item.id]}
                        onChange={(e) => setAmenityEnabled((current) => ({ ...current, [item.id]: e.target.checked }))}
                      />
                      <span className="truncate">{item.label}</span>
                      {renderFieldBadge(`amenity.${item.id}`, 'Run AI extraction to see amenity confidence and proof.')}
                    </label>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                      <select
                        className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-0 text-sm disabled:bg-slate-100 sm:max-w-[14rem]"
                        disabled={!amenityEnabled[item.id]}
                        value={amenityOptions[item.id]}
                        onChange={(e) => setAmenityOptions((current) => ({ ...current, [item.id]: e.target.value }))}
                      >
                        {item.options.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {item.supportsQuantity ? (
                        <input
                          type="number"
                          aria-label={`${item.label} quantity`}
                          title="Quantity"
                          placeholder="Qty"
                          min={0}
                          max={20}
                          step={0.5}
                          disabled={!amenityEnabled[item.id]}
                          className="h-8 w-[3.25rem] shrink-0 rounded-md border border-slate-300 px-1.5 py-0 text-center text-sm tabular-nums placeholder:text-slate-400 disabled:bg-slate-100"
                          value={amenityModifiers[item.id]?.quantity ?? 1}
                          onChange={(e) =>
                            setAmenityModifiers((current) => ({
                              ...current,
                              [item.id]: {
                                ...current[item.id],
                                quantity: clampModifier(numberValue(e.target.value), 20, true),
                              },
                            }))
                          }
                        />
                      ) : null}
                      {item.supportsAreaSqft ? (
                        <input
                          type="number"
                          aria-label={`${item.label} area in square feet`}
                          title="Sqft"
                          placeholder="Sqft"
                          min={0}
                          max={10000}
                          disabled={!amenityEnabled[item.id]}
                          className="h-8 w-[4.25rem] shrink-0 rounded-md border border-slate-300 px-1.5 py-0 text-center text-sm tabular-nums placeholder:text-slate-400 disabled:bg-slate-100"
                          value={amenityModifiers[item.id]?.areaSqft ?? 0}
                          onChange={(e) =>
                            setAmenityModifiers((current) => ({
                              ...current,
                              [item.id]: {
                                ...current[item.id],
                                areaSqft: clampModifier(numberValue(e.target.value), 10000),
                              },
                            }))
                          }
                        />
                      ) : null}
                      {item.supportsShared ? (
                        <label className="flex h-8 shrink-0 items-center gap-1 whitespace-nowrap pl-0.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300"
                            checked={amenityModifiers[item.id]?.shared ?? false}
                            disabled={!amenityEnabled[item.id]}
                            onChange={(e) =>
                              setAmenityModifiers((current) => ({
                                ...current,
                                [item.id]: {
                                  ...current[item.id],
                                  shared: e.target.checked,
                                },
                              }))
                            }
                          />
                          Shared
                        </label>
                      ) : null}
                      <span className="ml-1 text-xs font-medium text-slate-700">
                        {amenityEnabled[item.id] ? money(amenityValueById[item.id] ?? 0) : money(0)}
                      </span>
                      <input
                        type="number"
                        aria-label={`${item.label} override monthly value`}
                        title="Override monthly value"
                        placeholder="Override"
                        min={0}
                        disabled={!amenityEnabled[item.id]}
                        className="h-8 w-[5.5rem] shrink-0 rounded-md border border-slate-300 px-1.5 py-0 text-right text-sm tabular-nums placeholder:text-slate-400 disabled:bg-slate-100"
                        value={typeof amenityOverrides[item.id] === 'number' ? amenityOverrides[item.id] : ''}
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          setAmenityOverrides((current) => ({
                            ...current,
                            [item.id]: raw === '' ? undefined : Math.max(0, numberValue(raw)),
                          }))
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        </div>
        <div className="space-y-1.5">
          <CalculatorStepHeading step={3} id="home-methodology-heading" className="mb-0">
            How options are valued
          </CalculatorStepHeading>
          <p
            data-tutorial-target="methodology-note"
            className="rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-slate-800"
          >
          Methodology: first parking/garage unit counts at full value, extra units at {Math.round(AMENITY_VALUATION_DEFAULTS.additionalQuantityFactor * 100)}%,
          shared garage at {Math.round(AMENITY_VALUATION_DEFAULTS.sharedGarageFactor * 100)}%, and storage sqft uses tiered diminishing rates. Utility-line amounts (electricity, gas/oil heating, natural gas)
          are scaled by province using illustrative relative energy-cost indices — update the table in the codebase periodically (e.g. Statistics Canada or provincial regulators).
          {sqftMarketAdjustment ? (
            <>
              {' '}
              With square footage entered, the CMHC average is adjusted by a percentage for size vs a typical unit for that bedroom count (elasticity {Math.round(SQFT_RENT_ELASTICITY * 100)}% — see{' '}
              <Link to="/methodology#step-r1-sqft" className="font-medium text-brand-800 underline decoration-brand-700/40 underline-offset-2 hover:decoration-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 rounded-sm">
                methodology
              </Link>
              ).
            </>
          ) : null}
        </p>
        </div>

        </section>
      </div>

      <aside
        data-tutorial-target="results"
        className="shrink-0 rounded-t-xl border border-slate-200 border-b-0 bg-slate-50 px-3 py-2 shadow-[0_-3px_12px_rgba(15,23,42,0.08)]"
        aria-labelledby="home-results-heading"
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
          <CalculatorStepHeading
            step={4}
            as="h2"
            id="home-results-heading"
            className="mb-0 min-w-0 flex-1"
            titleClassName="text-sm font-semibold uppercase tracking-wide text-slate-600"
          >
            FairRent results
          </CalculatorStepHeading>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"
            onClick={resetCalculator}
          >
            Reset
          </button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-2.5 pb-1.5 pt-1.5">
          <p className="text-[10px] font-medium leading-none text-slate-600">Rent scale</p>
          <div className="mt-1 px-0.5">
            <div
              className="relative"
              style={{
                height: `${scaleContainerHeight}px`,
              }}
            >
              <div
                className="pointer-events-none absolute left-0 right-0 z-0"
                style={{
                  top: `${scaleLineTop - 20}px`,
                  height: '18px',
                }}
              >
                <div
                  className="absolute"
                  style={{
                    left: `${priceRangeBracket.left}%`,
                    width: `${priceRangeBracket.width}%`,
                  }}
                >
                  <p className="text-center text-[9px] font-medium uppercase tracking-wide text-slate-500">Range price</p>
                  <div
                    className="mt-0.5 h-1.5 w-full rounded-full ring-1 ring-slate-200/60"
                    style={{ background: priceRangeBracket.gradient }}
                  />
                </div>
              </div>
              <div className="absolute left-0 right-0 z-[1] h-0.5 rounded-full bg-slate-300" style={{ top: `${scaleLineTop}px` }} />
              {scalePlotPoints.points.map((point) => {
                const left = `${point.percent}%`
                const percent = point.percent
                const textAnchorClass = percent <= 8 ? 'left-0 text-left' : percent >= 92 ? 'right-0 text-right' : 'left-1/2 -translate-x-1/2 text-center'
                const markerTop = scaleLineTop + 2
                return (
                  <div key={point.id} className="absolute top-0 z-[2] -translate-x-1/2" style={{ left }}>
                    {point.isAboveLine ? (
                      <>
                        <p
                          className={`absolute w-28 whitespace-normal text-[9px] leading-[1.15] ${point.colorClass} ${textAnchorClass}`}
                          style={{ top: `${0 + point.row * scaleTopRowGap}px` }}
                        >
                          {point.label}
                        </p>
                        <p
                          className={`absolute w-28 whitespace-nowrap text-xs font-semibold ${point.colorClass} ${textAnchorClass}`}
                          style={{ top: `${9 + point.row * scaleTopRowGap}px` }}
                        >
                          {money(point.value)}
                        </p>
                        <p className={`absolute left-1/2 -translate-x-1/2 text-[10px] leading-none ${point.colorClass}`} style={{ top: `${markerTop - 8}px` }}>
                          ▼
                        </p>
                      </>
                    ) : (
                      <>
                        <p className={`absolute left-1/2 -translate-x-1/2 text-[10px] leading-none ${point.colorClass}`} style={{ top: `${markerTop + 1}px` }}>
                          ▲
                        </p>
                        <div
                          className={`absolute left-1/2 -translate-x-1/2 border-l border-dotted ${point.colorClass}`}
                          style={{
                            top: `${markerTop + 10}px`,
                            height: `${Math.max(0, scaleLineTop + 12 + point.row * scaleBottomRowGap - (markerTop + 10))}px`,
                          }}
                        />
                        <p
                          className={`absolute w-28 whitespace-nowrap text-xs font-semibold ${point.colorClass} ${textAnchorClass}`}
                          style={{ top: `${scaleLineTop + 10 + point.row * scaleBottomRowGap}px` }}
                        >
                          {money(point.value)}
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {!form.askingRent ? <p className="mt-0.5 text-[9px] leading-tight text-slate-500">Add asking rent for Price asked marker.</p> : null}
          </div>
          <div className="overflow-x-auto">
          <div className="grid min-w-full grid-cols-5 gap-1.5">
            <div className="min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1.5 sm:px-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Minimum price</p>
              <p className="text-sm font-bold leading-tight text-brand-700 tabular-nums sm:text-base">{money(displayBareMinimum)}</p>
            </div>
            <div className="min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1.5 sm:px-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Fair target</p>
              <p className="text-sm font-bold leading-tight text-emerald-700 tabular-nums sm:text-base">{money(displayFairTarget)}</p>
            </div>
            <div className="min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1.5 sm:px-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Without Inclusions</p>
              <p className="text-sm font-bold leading-tight text-slate-900 tabular-nums sm:text-base">{money(marketReference)}</p>
            </div>
            <div className="min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1.5 text-slate-700 sm:px-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-blue-600">Price asked</p>
              {form.askingRent ? (
                <>
                  <p className="text-sm font-bold leading-tight text-blue-600 tabular-nums sm:text-base">{money(form.askingRent)}</p>
                  <p className="text-[10px] leading-tight text-slate-600">
                    vs fair:{' '}
                    <span className={`font-semibold ${displayAskingDelta && displayAskingDelta > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {money(displayAskingDelta ?? 0)}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-[10px] text-slate-400">—</p>
              )}
            </div>
            <div className="min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1.5 sm:px-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Max price</p>
              <p className="text-sm font-bold leading-tight text-red-700 tabular-nums sm:text-base">{money(displayMarketHighest)}</p>
            </div>
          </div>
          </div>
        </div>
      </aside>

      <CalculatorTutorial
        key={tutorialKey}
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
        scrollContainerRef={homeScrollRef}
        returnFocusRef={howToButtonRef}
      />
    </div>
  )
}
