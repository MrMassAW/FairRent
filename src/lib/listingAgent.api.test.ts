import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CmhcRentRow } from '../data/cmhcRents'

describe('listingAgent API client', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('POSTs memo to listing agent when VITE_LISTING_AGENT_URL is set', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', 'http://localhost:8787')
    const memoResponse = {
      formPatch: {},
      amenityEnabledPatch: {},
      amenityOptionPatch: {},
      amenityModifierPatch: {},
      amenityOverridePatch: {},
      notes: [],
      fieldAssessments: {},
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(memoResponse),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { extractFromMemo } = await import('./listingAgent')
    const rows: CmhcRentRow[] = []
    await extractFromMemo('test memo', rows)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/listing-agent/parse',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'memo', memo: 'test memo' }),
      }),
    )
  })

  it('falls back to local heuristic when memo API request fails', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', 'http://localhost:8787')
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const { extractFromMemo } = await import('./listingAgent')
    const rows: CmhcRentRow[] = [
      {
        province: 'ON',
        city: 'Cornwall',
        bedrooms: 2,
        structureType: 'purpose-built',
        avgRent: 1500,
        surveyYear: 2025,
      },
    ]
    const memo = '2 bedroom in Cornwall, ON for $1750 per month'
    const result = await extractFromMemo(memo, rows)
    expect(fetchMock).toHaveBeenCalled()
    expect(result.notes[0]).toMatch(/Rent-O did not respond/i)
    expect(result.formPatch.location?.province).toBe('ON')
    expect(result.formPatch.location?.city).toBe('Cornwall')
  })

  it('truncates memo to LISTING_TEXT_MAX_CHARS when calling API', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', 'http://localhost:8787')
    const { extractFromMemo, LISTING_TEXT_MAX_CHARS } = await import('./listingAgent')
    const truncatedCb = vi.fn()
    const memoResponse = {
      formPatch: {},
      amenityEnabledPatch: {},
      amenityOptionPatch: {},
      amenityModifierPatch: {},
      amenityOverridePatch: {},
      notes: [],
      fieldAssessments: {},
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(memoResponse),
    })
    vi.stubGlobal('fetch', fetchMock)
    const rows: CmhcRentRow[] = []
    const longMemo = 'm'.repeat(LISTING_TEXT_MAX_CHARS + 500)
    await extractFromMemo(longMemo, rows, undefined, truncatedCb)
    expect(truncatedCb).toHaveBeenCalledWith(true)
    const parseCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/listing-agent/parse'))
    expect(parseCall).toBeDefined()
    const body = JSON.parse((parseCall![1] as RequestInit).body as string) as { memo: string }
    expect(body.memo.length).toBe(LISTING_TEXT_MAX_CHARS)
  })

  it('fetches URL then parses memo with memoLabel when extracting a listing', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', 'http://localhost:8787')
    const extractionPayload = {
      formPatch: {},
      amenityEnabledPatch: {},
      amenityOptionPatch: {},
      amenityModifierPatch: {},
      amenityOverridePatch: {},
      notes: [],
      fieldAssessments: {},
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            text: 'listing body',
            sourceLabel: 'Listing URL: https://example.com/a',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(extractionPayload),
      })
    vi.stubGlobal('fetch', fetchMock)
    const { extractListing } = await import('./listingAgent')
    const rows: CmhcRentRow[] = []
    await extractListing('https://example.com/a', rows)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8787/listing-agent/fetch-url',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/a' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8787/listing-agent/parse',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          source: 'memo',
          memo: 'listing body',
          memoLabel: 'Listing URL: https://example.com/a',
        }),
      }),
    )
  })

  it('throws a clear error when the URL points at a web app that returns HTML', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', 'http://localhost:5173')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<!DOCTYPE html><html></html>',
    })
    vi.stubGlobal('fetch', fetchMock)
    const { extractListing } = await import('./listingAgent')
    const rows: CmhcRentRow[] = []
    await expect(extractListing('https://example.com/a', rows)).rejects.toThrow(/listing agent API/)
  })
})
