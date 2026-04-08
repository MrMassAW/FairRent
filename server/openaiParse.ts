import { buildListingSystemPrompt } from './listingPrompt'
import { validateAndMapListingJson } from './parseModelJson'

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

export const isOpenAiConfigured = (): boolean => Boolean(process.env.OPENAI_API_KEY?.trim())

export const parseListingTextWithOpenAI = async (sourceLabel: string, text: string) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Server misconfiguration: OPENAI_API_KEY is not set (or configure Gemini: GEMINI_API_KEY / GOOGLE_API_KEY).')
  }
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

  const userContent = `${sourceLabel}

--- SOURCE TEXT ---
${text.slice(0, 120000)}
--- END ---`

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildListingSystemPrompt() },
          { role: 'user', content: userContent },
        ],
      }),
    })
  } catch (e) {
    if (isAbortOrTimeout(e)) {
      throw new Error('OpenAI request timed out; try again or check your network.')
    }
    throw e
  } finally {
    clearTimeout(id)
  }

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI request failed (${response.status}): ${errText.slice(0, 500)}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned no message content.')
  }

  return validateAndMapListingJson(content, 'OpenAI')
}
