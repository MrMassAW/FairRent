import { describe, expect, it } from 'vitest'
import { parseOebBillDataXml, summarizeOebOntarioResidentialElectricity } from './oebBillData'

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<BillDataTable>
<BillDataRow>
<Dist>Test LDC</Dist>
<Class>RESIDENTIAL</Class>
<YEAR>2026</YEAR>
<Net>0.02</Net>
<SC>25</SC>
</BillDataRow>
<BillDataRow>
<Class>COMMERCIAL</Class>
<Net>0.5</Net>
</BillDataRow>
</BillDataTable>`

describe('parseOebBillDataXml', () => {
  it('keeps residential rows only', () => {
    const rows = parseOebBillDataXml(sampleXml)
    expect(rows).toHaveLength(1)
    expect(rows[0].distributor).toBe('Test LDC')
    expect(rows[0].netPerKwh).toBe(0.02)
    expect(rows[0].serviceChargeMonthly).toBe(25)
  })
})

describe('summarizeOebOntarioResidentialElectricity', () => {
  it('averages Net and SC', () => {
    const rows = parseOebBillDataXml(sampleXml)
    const s = summarizeOebOntarioResidentialElectricity(rows)
    expect(s?.meanNetPerKwh).toBe(0.02)
    expect(s?.meanServiceCharge).toBe(25)
    expect(s?.count).toBe(1)
  })
})
