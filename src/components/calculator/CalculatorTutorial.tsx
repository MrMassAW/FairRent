import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CALCULATOR_TUTORIAL_STEPS } from '../../tutorial/calculatorTutorialSteps'

const PADDING = 10
const RING_INSET = 2
const CARD_MAX_W = 380
const Z_BACKDROP = 100
const Z_RING = 101
const Z_CARD = 102

type SpotlightRect = { top: number; left: number; width: number; height: number }

const emptyRect: SpotlightRect = { top: 0, left: 0, width: 0, height: 0 }

function clampRect(rect: DOMRectReadOnly, vw: number, vh: number): SpotlightRect {
  const pad = PADDING
  const top = Math.max(0, rect.top - pad)
  const left = Math.max(0, rect.left - pad)
  const width = Math.min(vw - left, rect.width + pad * 2)
  const height = Math.min(vh - top, rect.height + pad * 2)
  return { top, left, width: Math.max(0, width), height: Math.max(0, height) }
}

export type CalculatorTutorialProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  scrollContainerRef: RefObject<HTMLElement | null>
  returnFocusRef: RefObject<HTMLElement | null>
}

export function CalculatorTutorial({ open, onOpenChange, scrollContainerRef, returnFocusRef }: CalculatorTutorialProps) {
  const titleId = useId()
  const descId = useId()
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<SpotlightRect>(emptyRect)
  const [contentKey, setContentKey] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)

  const steps = CALCULATOR_TUTORIAL_STEPS
  const step = steps[stepIndex]
  const total = steps.length

  const measure = useCallback(() => {
    if (!open || !step) return
    const el = document.querySelector(`[data-tutorial-target="${step.target}"]`)
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (!el || !(el instanceof HTMLElement)) {
      setRect({ top: vh * 0.25, left: vw * 0.25, width: vw * 0.5, height: 120 })
      return
    }
    const r = el.getBoundingClientRect()
    setRect(clampRect(r, vw, vh))
  }, [open, step])

  useLayoutEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => measure())
    return () => cancelAnimationFrame(id)
  }, [open, stepIndex, measure, contentKey])

  useEffect(() => {
    if (!open) return
    const onResize = () => measure()
    const ro = new ResizeObserver(() => measure())
    window.addEventListener('resize', onResize)
    const scrollEl = scrollContainerRef.current
    scrollEl?.addEventListener('scroll', onResize, { passive: true })
    window.addEventListener('scroll', onResize, { passive: true })
    const target = step ? document.querySelector(`[data-tutorial-target="${step.target}"]`) : null
    if (target instanceof HTMLElement) ro.observe(target)
    return () => {
      window.removeEventListener('resize', onResize)
      scrollEl?.removeEventListener('scroll', onResize)
      window.removeEventListener('scroll', onResize)
      ro.disconnect()
    }
  }, [open, step, measure, scrollContainerRef])

  useEffect(() => {
    if (!open) return
    const el = step ? document.querySelector(`[data-tutorial-target="${step.target}"]`) : null
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      const id = window.requestAnimationFrame(() => measure())
      return () => cancelAnimationFrame(id)
    }
  }, [open, stepIndex, step, measure])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    if (open) {
      root.setAttribute('inert', '')
      document.body.style.overflow = 'hidden'
    } else {
      root.removeAttribute('inert')
      document.body.style.overflow = ''
    }
    return () => {
      root.removeAttribute('inert')
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => {
      cardRef.current?.querySelector<HTMLElement>('button:last-of-type')?.focus()
    }, 150)
    return () => clearTimeout(id)
  }, [open, stepIndex])

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      requestAnimationFrame(() => returnFocusRef.current?.focus())
    }
    wasOpenRef.current = open
  }, [open, returnFocusRef])

  const close = () => onOpenChange(false)

  const goPrev = () => {
    if (stepIndex <= 0) return
    setStepIndex((i) => i - 1)
    setContentKey((k) => k + 1)
  }

  const goNext = () => {
    if (stepIndex >= total - 1) {
      close()
      return
    }
    setStepIndex((i) => i + 1)
    setContentKey((k) => k + 1)
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const { top, left, width, height } = rect

  const topH = top
  const leftW = left
  const rightW = Math.max(0, vw - left - width)
  const bottomH = Math.max(0, vh - top - height)

  if (!open) return null

  const overlay = (
    <div className="fixed inset-0" style={{ zIndex: Z_BACKDROP }} role="presentation">
      <div
        className="pointer-events-auto absolute bg-slate-900/55 backdrop-blur-[1px] transition-opacity duration-300"
        style={{ top: 0, left: 0, width: '100%', height: topH, zIndex: Z_BACKDROP }}
      />
      <div
        className="pointer-events-auto absolute bg-slate-900/55 backdrop-blur-[1px] transition-opacity duration-300"
        style={{ top, left: 0, width: leftW, height, zIndex: Z_BACKDROP }}
      />
      <div
        className="pointer-events-auto absolute bg-slate-900/55 backdrop-blur-[1px] transition-opacity duration-300"
        style={{ top, left: left + width, width: rightW, height, zIndex: Z_BACKDROP }}
      />
      <div
        className="pointer-events-auto absolute bg-slate-900/55 backdrop-blur-[1px] transition-opacity duration-300"
        style={{ top: top + height, left: 0, width: '100%', height: bottomH, zIndex: Z_BACKDROP }}
      />

      <div
        className="pointer-events-none absolute rounded-xl border-2 border-sky-400 transition-all duration-300 ease-out tutorial-spotlight-ring"
        style={{
          top: top - RING_INSET,
          left: left - RING_INSET,
          width: width + RING_INSET * 2,
          height: height + RING_INSET * 2,
          zIndex: Z_RING,
        }}
        aria-hidden
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="pointer-events-auto fixed bottom-6 left-1/2 w-[min(calc(100vw-32px),380px)] max-w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out"
        style={{ zIndex: Z_CARD, transform: 'translateX(-50%)', maxWidth: CARD_MAX_W }}
      >
        <div key={contentKey} className="flex max-h-[min(38vh,280px)] flex-col p-4 animate-tutorial-step-in">
          <p className="text-[11px] font-medium uppercase tracking-wide text-sky-600">
            Step {stepIndex + 1} of {total}
          </p>
          <h2 id={titleId} className="mt-1 text-lg font-semibold text-slate-900">
            {step?.title}
          </h2>
          <p id={descId} className="mt-2 flex-1 overflow-y-auto text-sm leading-relaxed text-slate-600">
            {step?.body}
          </p>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={goPrev}
              disabled={stepIndex === 0}
              aria-label="Previous step"
            >
              <span aria-hidden className="text-lg leading-none">
                ‹
              </span>
              Previous
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-sky-700"
              onClick={goNext}
              aria-label={stepIndex >= total - 1 ? 'Finish tutorial' : 'Next step'}
            >
              {stepIndex >= total - 1 ? 'Done' : 'Next'}
              {stepIndex < total - 1 ? (
                <span aria-hidden className="text-lg leading-none">
                  ›
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
