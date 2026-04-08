import './loadEnv'
import { isGeminiConfigured, parseListingTextWithGemini } from './geminiParse'
import { isOpenAiConfigured, parseListingTextWithOpenAI } from './openaiParse'

/**
 * LLM_PROVIDER: `gemini` | `openai` | `auto` (default).
 * - `auto`: Gemini when GEMINI_API_KEY or GOOGLE_API_KEY is set; otherwise OpenAI if OPENAI_API_KEY is set.
 */
export const parseListingTextWithLlm = async (sourceLabel: string, text: string) => {
  const mode = (process.env.LLM_PROVIDER ?? 'auto').trim().toLowerCase()

  if (mode === 'gemini') {
    if (!isGeminiConfigured()) {
      throw new Error(
        'Server misconfiguration: LLM_PROVIDER=gemini but GEMINI_API_KEY or GOOGLE_API_KEY is not set. Ensure repo-root .env is loaded (run the server from the project or use loadEnv).',
      )
    }
    return parseListingTextWithGemini(sourceLabel, text)
  }

  if (mode === 'openai') {
    return parseListingTextWithOpenAI(sourceLabel, text)
  }

  if (isGeminiConfigured()) {
    return parseListingTextWithGemini(sourceLabel, text)
  }
  if (isOpenAiConfigured()) {
    return parseListingTextWithOpenAI(sourceLabel, text)
  }
  throw new Error(
    'Server misconfiguration: No LLM API key found. Set GEMINI_API_KEY or GOOGLE_API_KEY (recommended) or OPENAI_API_KEY in the project root .env file.',
  )
}
