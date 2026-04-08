/** Fetch public listing HTML as markdown-like text via Jina Reader (same approach as the legacy client fetch). */
export const fetchListingTextFromUrl = async (url: string): Promise<string> => {
  const normalized = url.trim()
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('Listing URL must start with http:// or https://')
  }
  const proxyUrl = `https://r.jina.ai/http://${normalized.replace(/^https?:\/\//i, '')}`
  const response = await fetch(proxyUrl)
  if (!response.ok) {
    throw new Error(`Could not read listing page (${response.status}). The site may block readers or require login.`)
  }
  return response.text()
}
