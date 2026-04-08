import { describe, expect, it } from 'vitest'
import { parseCmhcRmsPageOptions } from './cmhcRmsPageOptions'

const snippet = `
<select id="pdf_edition" name="pdf_edition">
  <option value="{a}">2025</option>
  <option value="{b}">2024</option>
</select>
<select id="pdf_geo" name="pdf_geo">
  <option value="{1}">Canada</option>
  <option value="{2}">Alberta</option>
  <option value="{3}">Qu&#233;bec CMA</option>
</select>
`

describe('parseCmhcRmsPageOptions', () => {
  it('reads edition years and geography labels', () => {
    const { editions, geographies } = parseCmhcRmsPageOptions(snippet)
    expect(editions).toEqual([2025, 2024])
    expect(geographies).toEqual(['Canada', 'Alberta', 'Québec CMA'])
  })
})
