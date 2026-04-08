import { useState } from 'react'
import { AdminDatabaseEditor } from '../components/admin/AdminDatabaseEditor'
import { AdminDatasetFetchPanels } from '../components/admin/AdminDatasetFetchPanels'
import { CmhcRmsPipelinePanel } from '../components/admin/CmhcRmsPipelinePanel'
import { BuildingTypeFactorsEditor } from '../components/data/BuildingTypeFactorsEditor'

type DataTab = 'rental' | 'utilities' | 'local-db' | 'building-type-factors'

export const DataPage = () => {
  const [tab, setTab] = useState<DataTab>('rental')

  return (
    <article className="app-surface space-y-5 p-6">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Data</h2>
      <p className="text-sm text-slate-600">
        Rental Data: CMHC RMS workbooks from the{' '}
        <a
          className="font-semibold text-violet-700 underline decoration-violet-300"
          href="https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables"
          target="_blank"
          rel="noreferrer"
        >
          CMHC Rental Market Survey data tables
        </a>
        . Utility Data: upstream fetches and a local editor. Local DB tools and policy editors live on tabs below.
      </p>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === 'rental' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          onClick={() => setTab('rental')}
        >
          Rental Data
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === 'utilities' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          onClick={() => setTab('utilities')}
        >
          Utility Data
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === 'local-db' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          onClick={() => setTab('local-db')}
        >
          Local DB editor
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === 'building-type-factors'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          onClick={() => setTab('building-type-factors')}
        >
          Building type factors
        </button>
      </div>

      {tab === 'rental' ? <CmhcRmsPipelinePanel /> : null}

      {tab === 'utilities' ? (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900">Utility data</h3>
            <p className="text-sm text-slate-600">Fetch upstream utility multipliers, then review and edit the table below.</p>
            <AdminDatasetFetchPanels categories={['utilities']} />
          </section>
          <AdminDatabaseEditor variant="utilities" />
        </div>
      ) : null}

      {tab === 'local-db' ? <AdminDatabaseEditor variant="full" /> : null}

      {tab === 'building-type-factors' ? <BuildingTypeFactorsEditor /> : null}
    </article>
  )
}
