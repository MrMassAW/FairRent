/**
 * Verifies HTTP reachability of every URL in sourcesRegistry (HEAD, then GET fallback).
 * Run: npx tsx scripts/verify-sources.ts
 */
import { getAllVerificationUrls } from '../src/lib/sourcesRegistry'

const TIMEOUT_MS = 20_000

const tryHead = async (url: string): Promise<Response | null> => {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    clearTimeout(t)
    return res
  } catch {
    return null
  }
}

const tryGet = async (url: string): Promise<Response | null> => {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
    clearTimeout(t)
    return res
  } catch {
    return null
  }
}

const verifyOne = async (url: string): Promise<{ ok: boolean; status: string }> => {
  const head = await tryHead(url)
  if (head && head.ok) {
    return { ok: true, status: `${head.status} (HEAD)` }
  }
  const get = await tryGet(url)
  if (get && get.ok) {
    return { ok: true, status: `${get.status} (GET)` }
  }
  const status = head?.status ?? get?.status ?? 'no response'
  return { ok: false, status: String(status) }
}

const main = async () => {
  const urls = getAllVerificationUrls()
  console.log(`Checking ${urls.length} URLs…\n`)
  const failures: string[] = []
  for (const url of urls) {
    const { ok, status } = await verifyOne(url)
    if (ok) {
      console.log(`OK  ${status.padEnd(14)} ${url}`)
    } else {
      console.error(`FAIL ${status.padEnd(14)} ${url}`)
      failures.push(url)
    }
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} URL(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll URLs reachable.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
