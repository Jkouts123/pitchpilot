import { useState } from 'react'
import { loadDeals } from '../lib/dealsStorage'
import { getAgentById } from '../lib/agentsStorage'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function DealsView({ onBack, onCallAgain }) {
  const deals = loadDeals()
  const [openId, setOpenId] = useState(null)

  const deal = openId ? deals.find((d) => d.id === openId) : null

  if (deal) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <button type="button" onClick={() => setOpenId(null)} className="mb-6 text-sm text-emerald-500/90">
          ← All deals
        </button>
        <header className="mb-6">
          <h1 className="font-display text-2xl font-semibold text-zinc-100">{deal.prospectName}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {deal.company} · {formatDate(deal.date)} · {deal.agentName || deal.presetName}
          </p>
        </header>

        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Summary</h2>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{deal.summaryText}</div>
          </section>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Transcript</h2>
            <pre className="mt-3 max-h-[50vh] overflow-y-auto whitespace-pre-wrap font-sans text-sm text-zinc-400">
              {deal.transcript || '—'}
            </pre>
          </section>
        </div>

        <button
          type="button"
          onClick={() => {
            const agent = getAgentById(deal.presetId)
            if (!agent) {
              alert('Original Sales Agent was removed. Create a new one first.')
              return
            }
            onCallAgain({
              agent,
              initialFromDeal: {
                manualEntry: deal.manualEntry ?? false,
                linkedInUrl: deal.linkedInUrl || '',
                prospectName: deal.prospectName,
                prospectCompany: deal.prospectCompany || deal.company || '',
                prospectRole: deal.prospectRole || '',
                previousNotes: deal.previousNotes || '',
              },
            })
          }}
          className="mt-8 rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-zinc-950"
        >
          Call again
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-zinc-100">Deals</h1>
          <p className="mt-1 text-sm text-zinc-500">Saved calls from summaries.</p>
        </div>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-zinc-300">
          Back
        </button>
      </header>

      {deals.length === 0 ? (
        <p className="text-center text-zinc-500">No deals saved yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
          {deals.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpenId(d.id)}
                className="flex w-full flex-col items-start gap-1 px-5 py-4 text-left hover:bg-zinc-800/40"
              >
                <span className="font-medium text-zinc-100">{d.prospectName}</span>
                <span className="text-sm text-zinc-500">
                  {d.company} · {formatDate(d.date)} · {d.agentName || d.presetName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
