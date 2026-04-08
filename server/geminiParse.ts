import { buildListingSystemPrompt } from './listingPrompt'
import { validateAndMapListingJson } from './parseModelJson'

/** Default: Gemini 3 Flash (preview). Override with GEMINI_MODEL (e.g. gemini-3.1-flash-lite-preview). */
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview'

const LLM_FETCH_TIMEOUT_MS = 90_000

const isAbortOrTimeout = (e: unknown): boolean => {
  if (e instanceof Error) {
    return e.name === 'TimeoutError' || e.name === 'AbortError'
  }
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    return e.name === 'TimeoutError' || e.name === 'AbortError'
  }
  return false
}

const geminiApiKey = (): string | undefined =>
  process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || undefined

export const isGeminiConfigured = (): boolean => Boolean(geminiApiKey())

export const parseListingTextWithGemini = async (sourceLabel: string, text: string) => {
  const apiKey = geminiApiKey()
  if (!apiKey) {
    throw new Error('Server misconfiguration: GEMINI_API_KEY or GOOGLE_API_KEY is not set.')
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
  const userContent = `${sourceLabel}

--- SOURCE TEXT ---
${text.slice(0, 120000)}
--- END ---`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildListingSystemPrompt() }],
        },
        contents: [{ parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    })
  } catch (e) {
    if (isAbortOrTimeout(e)) {
      throw new Error('Gemini request timed out; try again or check your network.')
    }
    throw e
  } finally {
    clearTimeout(id)
  }

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini request failed (${response.status}): ${errText.slice(0, 500)}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      finishReason?: string
    }>
    error?: { message?: string }
  }

  if (data.error?.message) {
    throw new Error(`Gemini API error: ${data.error.message}`)
  }

  const parts = data.candidates?.[0]?.content?.parts
  const textOut = parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!textOut) {
    throw new Error('Gemini returned no text content.')
  }

  return validateAndMapListingJson(textOut, 'Gemini')
}
