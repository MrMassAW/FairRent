import { getLastRefreshAt, runWeeklyRefresh } from './adminDataStore'

export interface CalculateRequest {
  postal_code: string
  bedrooms: number
  unit_type: 'apartment' | 'townhouse' | 'house'
  existing_tenant: boolean
  current_rent?: number
}

export interface CalculateResponse {
  fair_rent: number
  market_average: number
  cma: string
  province: string
  data_as_of: string
  note: string
}

export interface AdminStatusResponse {
  last_updated: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const payload = (await response.json()) as { detail?: string; message?: string }
      message = payload.detail ?? payload.message ?? message
    } catch {
      // Response body may not be JSON; keep default HTTP message.
    }
    throw new Error(message)
  }

  return (await response.json()) as T
}

export const api = {
  calculate: (payload: CalculateRequest) =>
    request<CalculateResponse>('/calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAdminStatus: async () => {
    try {
      return await request<AdminStatusResponse>('/admin/status')
    } catch {
      const local = await getLastRefreshAt()
      return {
        last_updated: local ?? 'Never',
      }
    }
  },

  runAdminRefresh: async (opts?: { onLog?: (line: string) => void }) => {
    const stamp = () => new Date().toISOString().slice(11, 19)
    try {
      const response = await request<{ result: unknown }>('/admin/refresh', {
        method: 'POST',
      })
      const remote = response.result as { logLines?: string[] } | null
      if (remote && Array.isArray(remote.logLines) && remote.logLines.length > 0) {
        remote.logLines.forEach((line) => opts?.onLog?.(line))
      } else {
        opts?.onLog?.(
          `[${stamp()}] Remote POST /admin/refresh succeeded (no verbose logLines in response — local IndexedDB pipeline was not run).`,
        )
      }
      opts?.onLog?.(`[${stamp()}] Running local IndexedDB refresh to sync calculator cache...`)
      const local = await runWeeklyRefresh({ onLog: opts?.onLog })
      return { result: local }
    } catch {
      const result = await runWeeklyRefresh({ onLog: opts?.onLog })
      return { result }
    }
  },
}
