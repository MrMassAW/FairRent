import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const StepCard = ({
  step,
  title,
  children,
  icon,
}: {
  step: number
  title: string
  children: ReactNode
  icon: ReactNode
}) => (
  <div className="flex gap-4 rounded-2xl border border-slate-200/90 bg-white/80 p-4 shadow-sm shadow-slate-900/[0.03] ring-1 ring-slate-900/[0.03] backdrop-blur-sm md:p-5">
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200/60"
      aria-hidden
    >
      {icon}
    </div>
    <div className="min-w-0 space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Step {step}</p>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  </div>
)

export const LandingPage = () => {
  return (
    <div className="relative w-full pb-10 pt-2 md:pb-14 md:pt-4">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -left-1/4 top-0 h-[28rem] w-[28rem] rounded-full bg-brand-100/40 blur-3xl" />
        <div className="absolute -right-1/4 top-24 h-[22rem] w-[22rem] rounded-full bg-violet-100/35 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-64 w-[min(100%,48rem)] -translate-x-1/2 rounded-full bg-slate-100/60 blur-3xl" />
      </div>

      <div className="app-surface relative mx-auto max-w-3xl space-y-10 p-6 md:space-y-12 md:p-10">
        <header className="space-y-5 text-center md:space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700/90">Canada</p>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl md:leading-[1.15]">
            Estimate fair rent with real costs and market data
          </h1>
          <p className="mx-auto max-w-xl text-pretty text-base leading-relaxed text-slate-600 md:text-lg">
            FairRent helps landlords and renters compare a unit to typical area rents, then layer in what is included—so
            you get a clearer picture, not a single mystery number.
          </p>
        </header>

        <section aria-labelledby="how-it-works-heading" className="space-y-4">
          <h2 id="how-it-works-heading" className="text-center text-lg font-semibold text-slate-900 md:text-xl">
            How it works
          </h2>
          <div className="grid gap-3 md:gap-4">
            <StepCard
              step={1}
              title="Tell us where and what you’re comparing"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            >
              Choose province, city, bedrooms, and basics like size or structure. You can also start from a listing link
              or memo when the optional AI helper is available.
            </StepCard>
            <StepCard
              step={2}
              title="We anchor to published area rents"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            >
              The calculator pulls a typical rent for your area from CMHC-style average rent data, so the baseline
              reflects what similar homes tend to rent for nearby.
            </StepCard>
            <StepCard
              step={3}
              title="Add what’s included"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              }
            >
              Parking, utilities, laundry, and other amenities adjust the picture. Your ownership costs and assumptions
              add context for landlords; renters see how extras compare to the market reference.
            </StepCard>
            <StepCard
              step={4}
              title="Read the chart and context"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              }
            >
              The result is an estimate with bands and explanations—not a legal ruling. Use it to inform conversations
              and your own judgment.
            </StepCard>
          </div>
        </section>

        <p className="text-center text-xs leading-relaxed text-slate-500">
          FairRent is not legal or financial advice. Results depend on your inputs and public data; verify anything
          important before you rely on it.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <Link
            to="/calculator"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-900/15 transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            Open calculator
          </Link>
          <Link
            to="/methodology"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 sm:w-auto"
          >
            How we calculate
          </Link>
        </div>
      </div>
    </div>
  )
}
