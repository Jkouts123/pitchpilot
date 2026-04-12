import { useEffect, useState } from 'react'
import { completeMessages } from '../lib/anthropic'
import { buildKnowledgeBaseText, buildSystemPrompt } from '../lib/agentsStorage'
import { addDeal } from '../lib/dealsStorage'
import { getProspectDisplayName } from '../lib/preCallDisplay'

const SUMMARY_INSTRUCTIONS = `You write concise post-call notes for a salesperson. Use the knowledge base to provide specific, playbook-aligned analysis.

Use markdown with these exact ## headings:

## What was discussed
## Key signals from prospect
## Objections raised
## How objections were handled
## Sentiment
## Agreed next steps
## Recommended follow-up

Be specific. Reference frameworks from the knowledge base where relevant. If something is unknown from the transcript, say "Not clear" for that section.`

export default function PostCallSummary({ transcript, preCall, onDone, onSaveNavigate }) {
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const kbText = buildKnowledgeBaseText(preCall.knowledgeBase)
        const system = kbText?.trim()
          ? `${SUMMARY_INSTRUCTIONS}\n\n${buildSystemPrompt(kbText)}`
          : SUMMARY_INSTRUCTIONS

        const prospectBlock = preCall.researchResult?.person?.name
          ? [
              `Name: ${preCall.researchResult.person.name}`,
              `Role: ${preCall.researchResult.person.role || '—'}`,
              `Company: ${preCall.researchResult.person.company || '—'}`,
            ].join('\n')
          : preCall.manualEntry
            ? `Name: ${preCall.prospectName}\nCompany: ${preCall.prospectCompany}\nRole: ${preCall.prospectRole}`
            : `LinkedIn: ${preCall.linkedInUrl}`

        const user = [
          `Sales Agent: ${preCall.presetName || '—'}`,
          '',
          '## Prospect context',
          prospectBlock,
          '',
          '## Notes',
          preCall.previousNotes || '—',
          '',
          '## Transcript',
          transcript || '(empty)',
        ].join('\n')

        const out = await completeMessages({
          system,
          messages: [{ role: 'user', content: user }],
        })
        if (!cancelled) setText(out)
      } catch (e) {
        if (!cancelled) setError(e?.message ?? String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [transcript, preCall])

  const saveDeal = () => {
    const prospectName = getProspectDisplayName(preCall)
    const prospectCompany = preCall.manualEntry ? preCall.prospectCompany || '—' : '—'
    const companyLabel = preCall.manualEntry ? prospectCompany : 'LinkedIn'
    addDeal({
      id: crypto.randomUUID(),
      prospectName,
      company: companyLabel,
      prospectCompany,
      date: new Date().toISOString(),
      agentName: preCall.presetName || '—',
      presetName: preCall.presetName || '—', // kept for backward compat with DealsView
      presetId: preCall.presetId || '',
      summaryText: text,
      transcript: transcript || '',
      previousNotes: preCall.previousNotes || '',
      linkedInUrl: preCall.linkedInUrl || '',
      manualEntry: Boolean(preCall.manualEntry),
      prospectRole: preCall.prospectRole || '',
    })
    setSaved(true)
    onSaveNavigate?.()
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Post-call</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-zinc-100">Summary</h1>
        </div>
        <button type="button" onClick={onDone} className="rounded-full border border-zinc-700 px-5 py-2 text-sm text-zinc-400">
          Home
        </button>
      </header>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        {loading && <p className="text-sm text-zinc-500">Generating…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && !error && <SummaryBody text={text} />}
      </div>

      {!loading && !error && (
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveDeal}
            disabled={saved}
            className="rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            {saved ? 'Saved to deals' : 'Save to deals'}
          </button>
        </div>
      )}
    </div>
  )
}

function SummaryBody({ text }) {
  const blocks = text.split(/\n(?=## )/g)
  return (
    <div className="space-y-8 text-[15px] leading-relaxed text-zinc-300">
      {blocks.map((block, i) => {
        const lines = block.trim().split('\n')
        const h = lines[0]
        const body = lines.slice(1).join('\n').trim()
        if (h?.startsWith('## ')) {
          return (
            <section key={i}>
              <h2 className="mb-2 font-display text-lg text-zinc-100">{h.replace(/^##\s*/, '')}</h2>
              <p className="whitespace-pre-wrap text-zinc-400">{body}</p>
            </section>
          )
        }
        return (
          <p key={i} className="whitespace-pre-wrap text-zinc-400">
            {block.trim()}
          </p>
        )
      })}
    </div>
  )
}
