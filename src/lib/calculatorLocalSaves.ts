import type { CalculatorFormState } from '../types/calculator'

const STORAGE_KEY = 'fairrent_named_saves_v1'
const MAX_SAVES = 40

export interface NamedCalculatorSave {
  id: string
  name: string
  savedAt: string
  form: CalculatorFormState
  includeInclusionsInResults?: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const readNamedSaves = (): NamedCalculatorSave[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is NamedCalculatorSave => {
        if (!isRecord(entry)) return false
        return (
          typeof entry.id === 'string' &&
          typeof entry.name === 'string' &&
          typeof entry.savedAt === 'string' &&
          isRecord(entry.form)
        )
      })
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0))
  } catch {
    return []
  }
}

const writeAll = (saves: NamedCalculatorSave[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves))
  } catch {
    /* quota or private mode */
  }
}

export const addNamedSave = (name: string, form: CalculatorFormState): NamedCalculatorSave | null => {
  const trimmed = name.trim()
  if (!trimmed) return null
  const entry: NamedCalculatorSave = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: trimmed,
    savedAt: new Date().toISOString(),
    form: JSON.parse(JSON.stringify(form)) as CalculatorFormState,
  }
  const list = readNamedSaves().filter((s) => s.id !== entry.id)
  writeAll([entry, ...list].slice(0, MAX_SAVES))
  return entry
}
