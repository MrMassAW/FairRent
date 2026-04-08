/**
 * Resolve Statistics Canada URLs for browser fetch.
 * In Vite dev, use `/statcan` proxy to avoid CORS; in production use the real host.
 * In Node (scripts, tests), always use the real host so ingest pipelines can run without a proxy.
 */
const STATCAN_HOST = 'https://www150.statcan.gc.ca'

const isBrowser = (): boolean => typeof window !== 'undefined'

export const getStatCanBaseUrl = (): string => {
  if (!isBrowser()) return STATCAN_HOST
  return import.meta.env.DEV ? '/statcan' : STATCAN_HOST
}

export const resolveStatCanUrl = (pathOrUrl: string): string => {
  if (pathOrUrl.startsWith('http')) {
    try {
      const u = new URL(pathOrUrl)
      if (u.hostname === 'www150.statcan.gc.ca' && isBrowser() && import.meta.env.DEV) {
        return `/statcan${u.pathname}${u.search}`
      }
    } catch {
      /* ignore */
    }
    return pathOrUrl
  }
  const base = getStatCanBaseUrl()
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${base}${path}`
}
