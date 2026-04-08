import './loadEnv'
import cors from 'cors'
import express from 'express'
import type { ListingAgentParseRequest } from '../src/lib/listingAgentContract'
import { isGeminiConfigured } from './geminiParse'
import { getCanadaGeoDataset, getCanadaGeoLoadError } from './lib/loadCanadaGeo'
import { getCanadaPlacesDataset, getCanadaPlacesLoadError } from './lib/loadCanadaPlaces'
import { fetchListingTextFromUrl } from './jinaFetch'
import { isOpenAiConfigured } from './openaiParse'
import { parseListingTextWithLlm } from './llmParse'

const PORT = Number(process.env.LISTING_AGENT_PORT ?? 8787)

const CMHC_RMS_PAGE_URL =
  'https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables'

const verbose =
  process.env.LISTING_AGENT_VERBOSE === '1' ||
  process.env.LISTING_AGENT_VERBOSE === 'true' ||
  process.env.LISTING_AGENT_VERBOSE === 'yes'

const quiet =
  process.env.LISTING_AGENT_QUIET === '1' ||
  process.env.LISTING_AGENT_QUIET === 'true' ||
  process.env.LISTING_AGENT_QUIET === 'yes'

const isProd = process.env.NODE_ENV === 'production'
/** One line per HTTP request when request starts and when it finishes; off if LISTING_AGENT_QUIET */
const logHttpRequests = !quiet

const devOriginMatchers: RegExp[] = [/localhost:\d+$/, /127\.0\.0\.1:\d+$/]

const extraCorsOrigins = (process.env.LISTING_AGENT_CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const app = express()
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }
      if (extraCorsOrigins.includes('*')) {
        callback(null, true)
        return
      }
      if (extraCorsOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      if (devOriginMatchers.some((re) => re.test(origin))) {
        callback(null, true)
        return
      }
      if (origin === 'https://localhost' || origin === 'capacitor://localhost' || origin === 'http://localhost') {
        callback(null, true)
        return
      }
      callback(null, false)
    },
  }),
)
app.use(express.json({ limit: '2mb' }))

if (logHttpRequests) {
  app.use((req, res, next) => {
    const started = Date.now()
    const origin = req.get('origin') ?? '-'
    const ip = req.ip || req.socket.remoteAddress || '-'
    const ua = (req.get('user-agent') ?? '-').slice(0, 100)
    const who = verbose ? ` ip=${ip} ua=${ua}` : ''
    console.log(`[listing-agent] ${req.method} ${req.originalUrl} (start) origin=${origin}${who}`)
    res.on('finish', () => {
      const ms = Date.now() - started
      console.log(
        `[listing-agent] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms) origin=${origin}${who}`,
      )
    })
    next()
  })
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/geo/provinces', (_req, res) => {
  const geo = getCanadaGeoDataset()
  if (!geo) {
    res.status(503).json({ error: 'Canada geo dataset unavailable', detail: getCanadaGeoLoadError() })
    return
  }
  res.json(geo.provinces)
})

app.get('/geo/cities', (req, res) => {
  const geo = getCanadaGeoDataset()
  if (!geo) {
    res.status(503).json({ error: 'Canada geo dataset unavailable', detail: getCanadaGeoLoadError() })
    return
  }
  const province = typeof req.query.province === 'string' ? req.query.province.trim().toUpperCase() : ''
  const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const q = qRaw.toLowerCase()

  if (!province || !geo.municipalitiesByProvince[province]) {
    res.status(400).json({ error: 'Missing or invalid province (use two-letter code, e.g. ON).' })
    return
  }

  let cities = geo.municipalitiesByProvince[province]
  if (q) {
    cities = cities.filter((name) => name.toLowerCase().includes(q))
  }
  res.json({ province, cities })
})

app.get('/geo/places', (req, res) => {
  const places = getCanadaPlacesDataset()
  if (!places) {
    res.status(503).json({ error: 'Canada places dataset unavailable', detail: getCanadaPlacesLoadError() })
    return
  }
  const province = typeof req.query.province === 'string' ? req.query.province.trim().toUpperCase() : ''
  if (!province) {
    res.status(400).json({ error: 'Missing province (two-letter code, e.g. ON).' })
    return
  }

  const fsaRaw = typeof req.query.fsa === 'string' ? req.query.fsa.trim().toUpperCase().replace(/\s+/g, '') : ''
  if (fsaRaw.length >= 3) {
    const fsa = fsaRaw.slice(0, 3)
    const hit = places.fsas.find((f) => f.province === province && f.fsa === fsa)
    if (!hit) {
      res.status(404).json({ error: 'FSA not found for province.' })
      return
    }
    res.json({ province, fsa: hit })
    return
  }

  const qRaw = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''
  let municipalities = places.municipalities.filter((m) => m.province === province)
  if (qRaw) {
    municipalities = municipalities.filter((m) => m.name.toLowerCase().includes(qRaw))
  }
  const limitRaw = Number(typeof req.query.limit === 'string' ? req.query.limit : '')
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, limitRaw) : 500
  const fsas = places.fsas.filter((f) => f.province === province)
  res.json({
    province,
    municipalities: municipalities.slice(0, limit),
    municipalitiesTotal: municipalities.length,
    fsas,
  })
})

app.get('/cmhc/rms-page-html', async (_req, res) => {
  try {
    const r = await fetch(CMHC_RMS_PAGE_URL, {
      headers: {
        'User-Agent': 'FairRentListingAgent/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!r.ok) {
      res.status(502).json({ error: `CMHC page HTTP ${r.status}` })
      return
    }
    const html = await r.text()
    res.json({ html })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Fetch failed'
    res.status(502).json({ error: message })
  }
})

app.post('/listing-agent/fetch-url', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
  if (verbose) {
    console.log(`[listing-agent] fetch-url urlLen=${url.length}`)
  }
  if (!url) {
    res.status(400).json({ error: 'Missing url.' })
    return
  }
  try {
    const text = await fetchListingTextFromUrl(url)
    res.json({ text, sourceLabel: `Listing URL: ${url}` })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Fetch failed'
    res.status(500).json({ error: message })
  }
})

app.post('/listing-agent/parse', async (req, res) => {
  const body = req.body as ListingAgentParseRequest
  if (!quiet && body) {
    if (body.source === 'url') {
      console.log(`[listing-agent] parse body source=url urlLen=${body.url?.trim().length ?? 0}`)
    } else if (body.source === 'memo') {
      console.log(`[listing-agent] parse body source=memo chars=${body.memo?.trim().length ?? 0}`)
    }
  }
  if (!body || (body.source !== 'url' && body.source !== 'memo')) {
    res.status(400).json({ error: 'Invalid body: source must be "url" or "memo".' })
    return
  }

  try {
    let text: string
    let label: string

    if (body.source === 'url') {
      if (!body.url?.trim()) {
        res.status(400).json({ error: 'Missing url for source "url".' })
        return
      }
      text = await fetchListingTextFromUrl(body.url.trim())
      label = `Listing URL: ${body.url.trim()}`
    } else {
      if (!body.memo?.trim()) {
        res.status(400).json({ error: 'Missing memo for source "memo".' })
        return
      }
      text = body.memo.trim()
      const custom = body.memoLabel?.trim()
      label = custom && custom.length > 0 ? custom : 'User memo'
    }

    const extraction = await parseListingTextWithLlm(label, text)
    res.json(extraction)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Parse failed'
    const status = message.includes('misconfiguration') ? 503 : 500
    res.status(status).json({ error: message })
  }
})

const server = app.listen(PORT, () => {
  process.stdout.write(`Listing agent API listening on http://localhost:${PORT}\n`)
  if (logHttpRequests && !verbose) {
    process.stdout.write(`[listing-agent] HTTP request logging on (dev). Set LISTING_AGENT_VERBOSE=1 for IP/UA + parse details.\n`)
  }
  if (verbose) {
    process.stdout.write(`[listing-agent] verbose logging on (LISTING_AGENT_VERBOSE)\n`)
  }
  if (!isProd && !quiet) {
    process.stdout.write(
      `[listing-agent] Tip: the browser only calls this API when the app was built with VITE_LISTING_AGENT_URL (e.g. http://localhost:${PORT}). Restart Vite after changing .env.\n`,
    )
  }
  const g = isGeminiConfigured()
  const o = isOpenAiConfigured()
  const mode = (process.env.LLM_PROVIDER ?? 'auto').trim().toLowerCase()
  const active =
    mode === 'gemini' || (mode !== 'openai' && g)
      ? 'Gemini'
      : mode === 'openai' || o
        ? 'OpenAI'
        : 'none (add keys to .env)'
  process.stdout.write(`LLM provider: ${active}\n`)
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(
      `[listing-agent] Port ${PORT} is already in use. Stop the other process (Windows: netstat -ano | findstr :${PORT}, then taskkill /PID <pid> /F) or set LISTING_AGENT_PORT to a free port and update VITE_LISTING_AGENT_URL in .env.\n`,
    )
    process.exit(1)
  }
  throw err
})
