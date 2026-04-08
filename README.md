# FairRent (Canada)

Open-source Canadian rent benchmark UI: market-informed reference (renter path) and cost-based target (landlord path).

## Structure

- `src/` React + TypeScript frontend (Vite).
- `public/data/` bundled CMHC rent dataset fallback.
- `scripts/` utility scripts (for data processing).
- `docs/` short pointers; canonical URLs live in `src/lib/sourcesRegistry.ts`.

## Official-source logic

- **Formulas:** Step-by-step calculations (landlord, renter, amenities) are on `/methodology`.
- **Shipped calculator (browser):** The renter **market reference** uses **CMHC Rental Market Survey–style** average rents (bundled JSON and/or active admin dataset in IndexedDB), resolved by province, city/CMA, bedroom count, and survey year via `cmhcLookup`. Statistics Canada asking-rent tables are **not** wired into the live on-page formula today; they remain operator targets for refresh workflows and future work.
- **Provincial rent-increase rules:** Stored with primary source URLs for **admin / guideline context** and the Sources page; they are **not** applied as `current rent × guideline` on the main Home calculator unless you add that product flow.
- **Optional backend:** If `VITE_API_BASE_URL` is set, the client may call remote `/calculate` and `/admin/*` (see `src/lib/api.ts`). The bundled app runs entirely with local `cmhcLookup`, `rentModel`, and `amenityValuation` without a server.
- **Admin refresh:** Builds rolling monthly snapshots in IndexedDB (`rents_by_cma`, guidelines, utility series when StatCan ingest succeeds).

## AI Listing Agent (optional)

The Home page can call a **local listing agent API** that (1) fetches listing page text via [Jina Reader](https://jina.ai/reader) for a URL, or (2) accepts memo text, then sends it to an LLM for structured JSON that fills calculator fields. **If `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set**, the server uses **Google Gemini** (default model `gemini-3-flash-preview`; override with `GEMINI_MODEL`, e.g. `gemini-3.1-flash-lite-preview`). Otherwise it uses **OpenAI** when `OPENAI_API_KEY` is set. Without a configured server, the app falls back to a small **regex-based** parser (no LLM).

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (recommended) or `OPENAI_API_KEY` (server-side only; do not use `VITE_*` for secrets).
2. Set `VITE_LISTING_AGENT_URL=http://localhost:8787` (or the URL where the API listens).
3. Run the UI and API together:

```bash
npm run dev:full
```

Or run `npm run dev` and `npm run dev:server` in two terminals.

The API exposes `POST /listing-agent/parse` with body `{ "source": "url" | "memo", "url"?: string, "memo"?: string }` and returns the same shape as `src/lib/listingAgentContract.ts` (`ListingExtraction`).

It also serves **Canada municipality dropdown** data used by the Home calculator: `GET /geo/provinces` and `GET /geo/cities?province=ON` (optional `&q=tor` to filter). Data is bundled in `server/data/canadaGeo.json` (Statistics Canada SGC 2021 structure CSV). Regenerate with:

```bash
npm run data:canada-geo
```

## Frontend

```bash
npm install
npm run dev
```

Build and test:

```bash
npm run build
npm run test
```

Run a local manual weekly data job (writes `public/data/historical-rents-db.json`):

```bash
npm run data:weekly-update
```

## Notes

- Canonical source list and link checks: `npm run verify:sources` (uses `sourcesRegistry.ts`).
- Update policy URLs and dataset notes in `sourcesRegistry.ts`; avoid duplicating long URL lists in docs.
