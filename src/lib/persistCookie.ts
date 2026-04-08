import type { CalculatorFormState } from '../types/calculator'

const COOKIE_NAME = 'fairrent_state_v1'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 120

const encode = (state: CalculatorFormState) => {
  const compact = JSON.stringify(state)
  return encodeURIComponent(compact)
}

const decode = (value: string): CalculatorFormState | null => {
  try {
    return JSON.parse(decodeURIComponent(value)) as CalculatorFormState
  } catch {
    return null
  }
}

export const readCalculatorCookie = (): CalculatorFormState | null => {
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${COOKIE_NAME}=`))

  if (!cookie) {
    return null
  }

  const value = cookie.split('=').slice(1).join('=')
  return decode(value)
}

export const writeCalculatorCookie = (state: CalculatorFormState): void => {
  const encoded = encode(state)
  if (encoded.length > 3800) {
    return
  }

  document.cookie = `${COOKIE_NAME}=${encoded}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`
}

export const clearCalculatorCookie = (): void => {
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
}
