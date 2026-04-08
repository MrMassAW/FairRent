import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

/**
 * Load env from the repo root (not cwd) so keys load reliably.
 * `override: true` — inherited empty vars (e.g. GEMINI_API_KEY="" in the shell) must not block values from `.env`.
 */
const serverDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(serverDir, '..')
dotenv.config({ path: path.join(root, '.env'), override: true })
dotenv.config({ path: path.join(root, '.env.local'), override: true })
