import type { CmhcRentRow } from '../data/cmhcRents'
import type { ListingAgentParseRequest, ListingExtraction } from './listingAgentContract'
import { extractFromTextHeuristic, fetchListingText } from './listingAgentHeuristic'

export type { FieldAssessment, FieldAssessmentStatus, ListingExtraction } from './listingAgentContract'
export { parseAmenityModifiers } from './listingAgentHeuristic'

/** Called between async steps so the UI can show fetch vs parse progress. */
export type ListingAgentProgress = (message: string) => void

/** User-facing name for the AI listing parser. */
export const LISTING_AGENT_DISPLAY_NAME = 'Rent-O'

/** Matches server-side LLM input cap in `server/geminiParse.ts` and `server/openaiParse.ts`. */
export const LISTING_TEXT_MAX_CHARS = 120_000

/**
 * Must exceed server LLM timeout (`LLM_FETCH_TIMEOUT_MS` = 90s in geminiParse / openaiParse)
 * so the browser does not abort while the model is still generating.
 */
const LISTING_AGENT_FETCH_TIMEOUT_MS = 120_000

export const LISTING_AGENT_TIMEOUT_MESSAGE =
  'Request timed out; check the listing agent server and LLM keys, or try again.'

const listingAgentBaseUrl = (): string | undefined => {
  const raw = import.meta.env.VITE_LISTING_AGENT_URL
  return typeof raw === 'string' && raw.trim() ? raw.trim().replace(/\/$/, '') : undefined
}

let listingAgentUrlMissingDevWarned = false

/** Dev-only: explains why the listing agent terminal shows no HTTP lines. */
const warnListingAgentUrlMissingOnce = () => {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test' || listingAgentUrlMissingDevWarned) return
  if (listingAgentBaseUrl()) return
  listingAgentUrlMissingDevWarned = true
  console.warn(
    '[FairRent] VITE_LISTING_AGENT_URL is not set. This app will not call the listing agent server — memo/link use the local parser only. Add VITE_LISTING_AGENT_URL=http://localhost:8787 to .env and restart the Vite dev server.',
  )
}

const HTML_INSTEAD_OF_JSON_HINT =
  'The response was a web page (HTML), not JSON from the listing agent. Set VITE_LISTING_AGENT_URL to the listing agent API (e.g. http://localhost:8787 from npm run dev:server), not the Vite app URL (port 5173).'

const isAbortOrTimeout = (e: unknown): boolean => {
  if (e instanceof Error) {
    return e.name === 'TimeoutError' || e.name === 'AbortError'
  }
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    return e.name === 'TimeoutError' || e.name === 'AbortError'
  }
  return false
}

const shouldFallbackMemoToHeuristic = (e: unknown): boolean => {
  if (e instanceof TypeError) return true
  const msg = e instanceof Error ? e.message : ''
  if (msg === LISTING_AGENT_TIMEOUT_MESSAGE) return true
  if (/timed out/i.test(msg)) return true
  if (/Failed to fetch|NetworkError|Load failed|network error/i.test(msg)) return true
  return false
}

const listingAgentFetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), LISTING_AGENT_FETCH_TIMEOUT_MS)
  try {
    return await fetch(input, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (e) {
    if (isAbortOrTimeout(e)) {
      throw new Error(LISTING_AGENT_TIMEOUT_MESSAGE)
    }
    throw e
  } finally {
    clearTimeout(id)
  }
}

const capListingText = (raw: string): { text: string; truncated: boolean } => {
  if (raw.length <= LISTING_TEXT_MAX_CHARS) {
    return { text: raw, truncated: false }
  }
  return { text: raw.slice(0, LISTING_TEXT_MAX_CHARS), truncated: true }
}

const readListingAgentJson = async <T>(response: Response): Promise<T> => {
  const raw = await response.text()
  const trimmed = raw.trim()
  if (trimmed.startsWith('<') || trimmed.startsWith('<!')) {
    throw new Error(HTML_INSTEAD_OF_JSON_HINT)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    const preview = trimmed.length > 0 ? trimmed.slice(0, 160).replace(/\s+/g, ' ') : '(empty body)'
    throw new Error(`${LISTING_AGENT_DISPLAY_NAME} returned invalid JSON (${response.status}). ${preview}`)
  }
}

const parseViaApi = async (body: ListingAgentParseRequest): Promise<ListingExtraction> => {
  const base = listingAgentBaseUrl()
  if (!base) {
    throw new Error('Listing agent API URL is not configured (set VITE_LISTING_AGENT_URL).')
  }
  const response = await listingAgentFetch(`${base}/listing-agent/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await readListingAgentJson<{ error?: string } & Partial<ListingExtraction>>(response)
  if (!response.ok) {
    throw new Error(payload.error ?? `Listing agent request failed (${response.status})`)
  }
  const extraction = payload as ListingExtraction
  return {
    formPatch: extraction.formPatch ?? {},
    amenityEnabledPatch: extraction.amenityEnabledPatch ?? {},
    amenityOptionPatch: extraction.amenityOptionPatch ?? {},
    amenityModifierPatch: extraction.amenityModifierPatch ?? {},
    amenityOverridePatch: extraction.amenityOverridePatch ?? {},
    notes: extraction.notes ?? [],
    fieldAssessments: extraction.fieldAssessments ?? {},
  }
}

const fetchListingPageViaApi = async (url: string): Promise<{ text: string; sourceLabel: string }> => {
  const base = listingAgentBaseUrl()
  if (!base) {
    throw new Error('Listing agent API URL is not configured (set VITE_LISTING_AGENT_URL).')
  }
  const response = await listingAgentFetch(`${base}/listing-agent/fetch-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  })
  const payload = await readListingAgentJson<{ error?: string; text?: string; sourceLabel?: string }>(response)
  if (!response.ok) {
    throw new Error(payload.error ?? `Listing fetch failed (${response.status})`)
  }
  const text = payload.text ?? ''
  const sourceLabel = payload.sourceLabel?.trim() || `Listing URL: ${url.trim()}`
  return { text, sourceLabel }
}

export const extractListing = async (
  url: string,
  rows: CmhcRentRow[],
  onProgress?: ListingAgentProgress,
): Promise<ListingExtraction> => {
  warnListingAgentUrlMissingOnce()
  if (listingAgentBaseUrl()) {
    onProgress?.('Fetching listing page…')
    const { text, sourceLabel } = await fetchListingPageViaApi(url)
    const { text: capped } = capListingText(text)
    onProgress?.('Analyzing with AI…')
    return parseViaApi({ source: 'memo', memo: capped, memoLabel: sourceLabel })
  }
  onProgress?.('Fetching listing page…')
  const text = await fetchListingText(url)
  onProgress?.('Parsing text locally…')
  return extractFromTextHeuristic(text, rows)
}

export const extractFromMemo = async (
  memo: string,
  rows: CmhcRentRow[],
  onProgress?: ListingAgentProgress,
  onMemoTruncated?: (truncated: boolean) => void,
): Promise<ListingExtraction> => {
  warnListingAgentUrlMissingOnce()
  if (listingAgentBaseUrl()) {
    const { text, truncated } = capListingText(memo.trim())
    onMemoTruncated?.(truncated)
    onProgress?.('Analyzing with AI…')
    try {
      return await parseViaApi({ source: 'memo', memo: text })
    } catch (e) {
      if (!shouldFallbackMemoToHeuristic(e)) {
        throw e
      }
      onProgress?.('AI unavailable; parsing memo locally…')
      const local = extractFromTextHeuristic(memo, rows)
      return {
        ...local,
        notes: [
          `${LISTING_AGENT_DISPLAY_NAME} did not respond in time or was unreachable; fields were filled using the local parser instead.`,
          ...local.notes,
        ],
      }
    }
  }
  onProgress?.('Parsing memo locally…')
  return extractFromTextHeuristic(memo, rows)
}
