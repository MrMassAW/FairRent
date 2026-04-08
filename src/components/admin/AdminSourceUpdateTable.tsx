import { useEffect, useMemo, useState } from 'react'
import type { SourceReference } from '../../types/adminData'
import { DEFAULT_SOURCES } from '../../lib/sourcesRegistry'
import { canUpdateSource, runSourceUpdate, type SourceUpdateStepEvent } from '../../lib/adminSourceUpdaters'

type SourceStatus = 'idle' | 'running' | 'success' | 'failure'
type StepRow = { id: string; label: string; status: 'running' | 'success' | 'failure'; detail?: string }

/** Cycles `.` → `..` → `...` → repeat while the step is running. */
const AnimatedDots = () => {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % 3), 450)
    return () => clearInterval(id)
  }, [])
  return <span className="text-amber-200">{'.'.repeat(idx + 1)}</span>
}

export const AdminSourceUpdateTable = () => {
  const sources = useMemo(() => DEFAULT_SOURCES, [])
  const [busySourceId, setBusySourceId] = useState<string | null>(null)
  const [statusById, setStatusById] = useState<Record<string, SourceStatus>>({})
  const [steps, setSteps] = useState<StepRow[]>([])
  const [logLines, setLogLines] = useState<string[]>([])
  const [selected, setSelected] = useState<SourceReference | null>(null)

  const onStep = (e: SourceUpdateStepEvent) => {
    if (e.kind !== 'step') return
    if (e.state === 'start') {
      setSteps((prev) => [...prev, { id: e.id, label: e.label, status: 'running' }])
      return
    }
    setSteps((prev) =>
      prev.map((s) =>
        s.id === e.id ? { ...s, status: e.ok ? 'success' : 'failure', detail: e.detail } : s,
      ),
    )
  }

  const runOne = async (s: SourceReference) => {
    setSelected(s)
    setBusySourceId(s.id)
    setSteps([])
    setLogLines([])
    setStatusById((prev) => ({ ...prev, [s.id]: 'running' }))

    const result = await runSourceUpdate(s, {
      onStep,
      onLog: (line) => setLogLines((prev) => [...prev, line]),
    })

    setStatusById((prev) => ({ ...prev, [s.id]: result.ok ? 'success' : 'failure' }))
    setBusySourceId(null)
  }

  const pill = (st: SourceStatus | undefined) => {
    const s = st ?? 'idle'
    if (s === 'success') return 'bg-emerald-100 text-emerald-900'
    if (s === 'failure') return 'bg-red-100 text-red-900'
    if (s === 'running') return 'bg-amber-100 text-amber-900'
    return 'bg-slate-100 text-slate-700'
  }

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Update by source</h3>
      <p className="text-sm text-slate-600">
        Each source runs a <strong>sequential</strong> pipeline (fetch → download → extract → parse → inject) with one
        status row and a detailed log.
      </p>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="w-12 px-4 py-3 font-semibold">#</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sources.map((s, idx) => {
              const st = statusById[s.id]
              const updatable = canUpdateSource(s.id)
              const isBusy = busySourceId === s.id
              return (
                <tr key={s.id} className={selected?.id === s.id ? 'bg-violet-50/40' : undefined}>
                  <td className="px-4 py-3 align-top font-mono text-xs text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all text-xs text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                    >
                      {s.url}
                    </a>
                    <p className="mt-1 text-xs text-slate-500">{s.notes}</p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill(st)}`}>
                      {st ?? 'idle'}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <button
                      type="button"
                      disabled={!updatable || busySourceId !== null}
                      onClick={() => void runOne(s)}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      title={!updatable ? 'Updater not implemented yet' : undefined}
                    >
                      {isBusy ? 'Updating…' : 'Update'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-800">Update progress</h4>
          <span className="text-xs text-slate-500">{busySourceId ? 'Running…' : 'Idle'}</span>
        </div>
        {selected ? (
          <p className="mt-1 text-xs text-slate-500">
            Selected: <span className="font-medium text-slate-700">{selected.name}</span>
          </p>
        ) : null}

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-950 p-3">
            <p className="mb-2 text-xs font-medium text-slate-300">Steps</p>
            {steps.length === 0 && !busySourceId ? (
              <span className="font-mono text-xs text-slate-500">Click Update on a source to see step status.</span>
            ) : (
              <ul className="space-y-0 font-mono text-xs leading-relaxed text-emerald-100">
                {steps.map((p) => (
                  <li
                    key={`${p.id}-${p.label}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-800/80 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 shrink text-slate-400">{p.label}</span>
                    <span className="min-w-[14rem]">
                      {p.status === 'running' ? (
                        <AnimatedDots />
                      ) : p.status === 'success' ? (
                        <span className="text-emerald-300">.............. Success</span>
                      ) : (
                        <span className="text-red-300">.............. Failure</span>
                      )}
                    </span>
                    {p.detail ? <span className="text-red-200">{p.detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-950 p-3">
            <p className="mb-2 text-xs font-medium text-slate-300">Log</p>
            <div className="max-h-[min(52vh,440px)] overflow-y-auto overscroll-y-contain">
              {logLines.length === 0 ? (
                <span className="font-mono text-xs text-slate-500">Verbose step log will appear here.</span>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-emerald-100">
                  {logLines.join('\n')}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

