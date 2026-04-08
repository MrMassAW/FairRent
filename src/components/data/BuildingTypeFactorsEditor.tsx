import { useEffect, useState } from 'react'
import { getBuildingTypeFactorsPolicy, setBuildingTypeFactorsPolicy } from '../../lib/adminDataStore'
import type { BuildingTypeFactorsPolicy } from '../../types/adminData'
import { BUILDING_TYPE_CATALOG, mergeDefaultBuildingTypeFactors } from '../../lib/buildingTypes'

export const BuildingTypeFactorsEditor = () => {
  const [draft, setDraft] = useState<Record<string, number> | null>(null)
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    void getBuildingTypeFactorsPolicy().then((p) => setDraft(p.factors))
  }, [])

  const save = async () => {
    if (!draft) return
    setMessage('')
    try {
      const merged = { ...mergeDefaultBuildingTypeFactors(), ...draft }
      const policy: BuildingTypeFactorsPolicy = { factors: merged, updatedAt: new Date().toISOString() }
      await setBuildingTypeFactorsPolicy(policy)
      setDraft(merged)
      setMessage('Saved building type factors.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Building type factors</h2>
        <p className="mt-1 text-sm text-slate-600">
          Multipliers applied to the size-adjusted market reference on the home calculator (after CMHC/StatCan blend and sqft
          adjustment). Values are clamped at runtime between 0.5 and 1.5.
        </p>
      </div>

      {draft ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-700">
                <tr>
                  <th className="px-3 py-2">Building type</th>
                  <th className="px-3 py-2">Factor</th>
                </tr>
              </thead>
              <tbody>
                {BUILDING_TYPE_CATALOG.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{row.label}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className="w-24 rounded border border-slate-300 px-2 py-1 tabular-nums"
                        value={draft[row.id] ?? row.defaultFactor}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setDraft((prev) => {
                            if (!prev) return prev
                            return { ...prev, [row.id]: Number.isFinite(n) ? n : row.defaultFactor }
                          })
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => void save()}
            >
              Save building type factors
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
              onClick={() => setDraft(mergeDefaultBuildingTypeFactors())}
            >
              Reset to code defaults
            </button>
          </div>

          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-slate-600">Loading…</p>
      )}
    </section>
  )
}

