import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public', 'favicon.svg'))

for (const size of [180, 192, 512]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `pwa-${size}.png`
  await sharp(svg).resize(size, size).png().toFile(join(root, 'public', name))
  console.log('wrote', name)
}
