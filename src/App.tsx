import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DataPage } from './pages/DataPage'
import { HomePage } from './pages/HomePage'
import { LandingPage } from './pages/LandingPage'
import { MethodologyPage } from './pages/MethodologyPage'
import { SourcesPage } from './pages/SourcesPage'

const TabIconCalc = ({ className }: { className?: string }) => (
  <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      d="M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
    />
    <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M9 8h6M9 12h6M9 16h4" />
  </svg>
)

const TabIconDoc = ({ className }: { className?: string }) => (
  <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      d="M7 3h7l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
    />
    <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M14 3v4h4" />
    <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M9 13h6M9 17h6" />
  </svg>
)

const TabIconSources = ({ className }: { className?: string }) => (
  <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M9 6h12M9 12h12M9 18h12" />
    <circle cx="5" cy="6" r="1.5" fill="currentColor" />
    <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="5" cy="18" r="1.5" fill="currentColor" />
  </svg>
)

const TabIconMore = ({ className }: { className?: string }) => (
  <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" />
  </svg>
)

const desktopNavClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 ${
    isActive
      ? 'bg-white text-brand-700 shadow-sm shadow-slate-900/5 ring-1 ring-slate-200/70'
      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
  }`

const mobileDrawerLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 ${
      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'
    }`

const tabClass = (active: boolean) =>
  `flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold leading-tight transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 sm:text-xs ${
    active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
  }`

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const moreMenuActive = location.pathname.startsWith('/data')

  useEffect(() => {
    return () => {
      setMenuOpen(false)
    }
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-brand-50/35 antialiased">
      <header className="shrink-0 border-b border-slate-200/60 bg-white/80 pt-[max(0px,env(safe-area-inset-top))] shadow-sm shadow-slate-900/[0.035] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:py-3.5">
          <Link
            to="/"
            className="flex min-h-11 min-w-0 shrink-0 items-center gap-2 rounded-lg py-1.5 pl-1 pr-1 text-lg font-bold leading-none tracking-tight transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 md:text-xl"
          >
            <span className="bg-gradient-to-r from-brand-700 via-violet-600 to-indigo-600 bg-clip-text text-transparent">
              FairRent
            </span>
            <span className="rounded-full bg-slate-100/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200/80">
              CA
            </span>
          </Link>
          <nav
            className="hidden items-center gap-1 rounded-full border border-slate-200/80 bg-slate-100/90 p-1 shadow-inner shadow-slate-900/[0.04] md:flex"
            aria-label="Primary"
          >
            <NavLink to="/calculator" end className={desktopNavClass}>
              Calculator
            </NavLink>
            <NavLink to="/methodology" className={desktopNavClass}>
              Methodology
            </NavLink>
            <NavLink to="/sources" className={desktopNavClass}>
              Sources
            </NavLink>
            <NavLink to="/data" className={desktopNavClass}>
              Data
            </NavLink>
          </nav>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[2px] transition-opacity duration-200 md:hidden ${
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      />

      <nav
        id="mobile-nav"
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(100%,20.5rem)] flex-col rounded-l-3xl border-l border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-xl transition-transform duration-300 ease-out md:hidden ${
          menuOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          paddingLeft: '1.1rem',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
        aria-hidden={!menuOpen}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">More</span>
            <p className="mt-0.5 text-sm text-slate-600">Data, admin &amp; tools</p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-1 overflow-y-auto pb-4">
          <NavLink to="/data" className={mobileDrawerLinkClass} onClick={() => setMenuOpen(false)}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
              D
            </span>
            Data
          </NavLink>
          <p className="px-3 pt-2 text-xs leading-relaxed text-slate-500">
            Same app on web and in the store build—configure APIs in <code className="rounded bg-slate-100 px-1">.env</code>.
          </p>
        </div>
      </nav>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-y-auto px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 max-md:pb-[calc(4.35rem+env(safe-area-inset-bottom))] md:pt-3">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/calculator" element={<HomePage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/admin" element={<Navigate to="/data" replace />} />
          <Route path="/admin/*" element={<Navigate to="/data" replace />} />
        </Routes>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200/80 bg-white/90 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-app-nav backdrop-blur-xl backdrop-saturate-150 md:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-center gap-0.5">
          <NavLink
            to="/calculator"
            end
            className={({ isActive }) =>
              tabClass(isActive) + (isActive ? ' bg-brand-50/90 shadow-sm shadow-brand-900/10' : '')
            }
          >
            <TabIconCalc className="shrink-0 opacity-90" />
            <span>Calc</span>
          </NavLink>
          <NavLink
            to="/methodology"
            className={({ isActive }) =>
              tabClass(isActive) + (isActive ? ' bg-brand-50/90 shadow-sm shadow-brand-900/10' : '')
            }
          >
            <TabIconDoc className="shrink-0 opacity-90" />
            <span>Method</span>
          </NavLink>
          <NavLink
            to="/sources"
            className={({ isActive }) =>
              tabClass(isActive) + (isActive ? ' bg-brand-50/90 shadow-sm shadow-brand-900/10' : '')
            }
          >
            <TabIconSources className="shrink-0 opacity-90" />
            <span>Sources</span>
          </NavLink>
          <button
            type="button"
            className={
              tabClass(moreMenuActive || menuOpen) +
              (moreMenuActive || menuOpen ? ' bg-brand-50/90 shadow-sm shadow-brand-900/10' : '')
            }
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'More options'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <TabIconMore className="shrink-0 opacity-90" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

export default App
