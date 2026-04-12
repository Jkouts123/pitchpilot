import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { getProspectDisplayName } from '../lib/preCallDisplay'

// ── tiny spinner ──────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-emerald-400"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// ── step tracker row ──────────────────────────────────────────────────────────
function StepRow({ text, done }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="flex items-center gap-3"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {done ? <CheckIcon /> : <Spinner />}
      </span>
      <span className={`text-sm ${done ? 'text-zinc-500' : 'text-zinc-200'}`}>{text}</span>
    </motion.div>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function PreCallScreen({ preset, initialFromDeal, onBack, onStartCall }) {
  const [manualEntry, setManualEntry] = useState(Boolean(initialFromDeal?.manualEntry))
  const [linkedInUrl, setLinkedInUrl] = useState(initialFromDeal?.linkedInUrl ?? '')
  const [prospectName, setProspectName] = useState(initialFromDeal?.prospectName ?? '')
  const [prospectCompany, setProspectCompany] = useState(initialFromDeal?.prospectCompany ?? '')
  const [prospectRole, setProspectRole] = useState(initialFromDeal?.prospectRole ?? '')
  const [previousNotes, setPreviousNotes] = useState(initialFromDeal?.previousNotes ?? '')

  // research state
  const [phase, setPhase] = useState('form') // 'form' | 'researching' | 'review'
  const [steps, setSteps] = useState([])     // { text, done }[]
  const [researchResult, setResearchResult] = useState(null)
  const [editableOpener, setEditableOpener] = useState('')
  const [editingOpener, setEditingOpener] = useState(false)
  const [researchError, setResearchError] = useState(null)

  const previewName = getProspectDisplayName({ manualEntry, linkedInUrl, prospectName })

  // ── build preCall payload ──────────────────────────────────────────────────
  function buildPayload(research) {
    return {
      presetId: preset.id,
      presetName: preset.name,
      knowledgeBase: preset.knowledgeBase ?? [],
      manualEntry,
      linkedInUrl: linkedInUrl.trim(),
      prospectName: prospectName.trim(),
      prospectCompany: prospectCompany.trim(),
      prospectRole: prospectRole.trim(),
      previousNotes: previousNotes.trim(),
      researchResult: research ?? null,
      opener: research?.opener ?? '',
    }
  }

  // ── direct start (manual mode or skip) ────────────────────────────────────
  const startDirect = () => onStartCall(buildPayload(null))

  // ── start with review result ───────────────────────────────────────────────
  const startWithResearch = () =>
    onStartCall(buildPayload({ ...researchResult, opener: editableOpener }))

  // ── run research via SSE stream ────────────────────────────────────────────
  const runResearch = async () => {
    if (manualEntry || !linkedInUrl.trim()) {
      startDirect()
      return
    }

    setPhase('researching')
    setSteps([])
    setResearchResult(null)
    setResearchError(null)

    try {
      const response = await fetch('http://localhost:3001/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinUrl: linkedInUrl.trim() }),
      })

      if (!response.ok) throw new Error(`Server error ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // hold incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event
          try { event = JSON.parse(line.slice(6)) } catch { continue }

          if (event.step) {
            // Mark all previous steps done, add new active step
            setSteps((prev) => [
              ...prev.map((s) => ({ ...s, done: true })),
              { text: event.step, done: false },
            ])
          }

          if (event.done) {
            // Mark final step done
            setSteps((prev) => prev.map((s) => ({ ...s, done: true })))

            if (event.result && event.result.opener) {
              setResearchResult(event.result)
              setEditableOpener(event.result.opener)
              setPhase('review')
            } else {
              // Research returned no usable result — proceed directly
              startDirect()
            }
          }
        }
      }
    } catch (e) {
      setResearchError(e?.message ?? String(e))
      setPhase('form')
    }
  }

  // ── fullscreen overlay for researching + review phases ────────────────────
  if (phase === 'researching' || phase === 'review') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#070708]">
        {/* logo bar */}
        <div className="flex shrink-0 items-center gap-2 px-8 py-6">
          <span className="font-display text-xl font-semibold tracking-tight text-zinc-100">
            PitchPilot
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            copilot
          </span>
        </div>

        {/* ── RESEARCHING ── */}
        {phase === 'researching' && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Researching
            </p>
            <h2 className="mb-10 font-display text-2xl text-zinc-100">{previewName}</h2>

            <div className="w-full max-w-md space-y-4">
              <AnimatePresence initial={false}>
                {steps.map((s, i) => (
                  <StepRow key={i} text={s.text} done={s.done} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ── REVIEW ── */}
        {phase === 'review' && researchResult && (
          <div className="mx-auto w-full max-w-xl px-6 pb-16 pt-4">
            {/* person header */}
            <div className="mb-8 text-center">
              <h2 className="font-display text-2xl text-zinc-100">
                {researchResult.person?.name || previewName}
              </h2>
              {(researchResult.person?.role || researchResult.person?.company) && (
                <p className="mt-1 text-sm text-zinc-500">
                  {[researchResult.person.role, researchResult.person.company]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {researchResult.companySummary && (
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {researchResult.companySummary}
                </p>
              )}
            </div>

            {/* opener card */}
            <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/80 p-6 shadow-[0_0_40px_-10px_rgba(16,185,129,0.15)]">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Your opener
                </span>
                <button
                  type="button"
                  onClick={() => setEditingOpener((v) => !v)}
                  className="text-xs font-medium text-emerald-500 hover:text-emerald-400"
                >
                  {editingOpener ? 'Done' : 'Edit'}
                </button>
              </div>

              {editingOpener ? (
                <textarea
                  value={editableOpener}
                  onChange={(e) => setEditableOpener(e.target.value)}
                  rows={5}
                  autoFocus
                  className="w-full resize-none bg-transparent text-lg leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
                />
              ) : (
                <p className="text-lg leading-relaxed text-zinc-100">{editableOpener}</p>
              )}
            </div>

            {/* talking points */}
            {researchResult.talkingPoints?.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Talking points
                </p>
                {researchResult.talkingPoints.map((tp, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm leading-relaxed text-zinc-300"
                  >
                    {tp}
                  </div>
                ))}
              </div>
            )}

            {/* actions */}
            <button
              type="button"
              onClick={startWithResearch}
              className="mt-8 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-5 text-lg font-bold tracking-tight text-zinc-950 shadow-[0_20px_50px_-12px_rgba(16,185,129,0.55)] hover:from-emerald-400 hover:to-teal-400"
            >
              Start call
            </button>
            <button
              type="button"
              onClick={() => setPhase('form')}
              className="mt-3 w-full rounded-2xl py-3 text-sm text-zinc-500 hover:text-zinc-300"
            >
              Back to form
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── FORM phase ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <header className="mb-10 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Pre-call</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-zinc-100">{preset.name}</h1>
        <p className="mt-2 text-sm text-zinc-500">Prospect context for this session.</p>
      </header>

      {researchError && (
        <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          Research server unavailable — {researchError}. You can still start the call directly.
        </div>
      )}

      <div className="space-y-5">
        {!manualEntry ? (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500">
                LinkedIn URL
              </span>
              <input
                value={linkedInUrl}
                onChange={(e) => setLinkedInUrl(e.target.value)}
                placeholder="Paste profile URL — we'll research the prospect automatically"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100"
              />
            </label>
            <button
              type="button"
              onClick={() => setManualEntry(true)}
              className="text-sm text-emerald-500/90 underline underline-offset-2"
            >
              Enter prospect manually
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setManualEntry(false)}
              className="text-sm text-emerald-500/90 underline underline-offset-2"
            >
              Use LinkedIn URL instead
            </button>
            <input
              value={prospectName}
              onChange={(e) => setProspectName(e.target.value)}
              placeholder="Prospect name"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm"
            />
            <input
              value={prospectCompany}
              onChange={(e) => setProspectCompany(e.target.value)}
              placeholder="Company"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm"
            />
            <input
              value={prospectRole}
              onChange={(e) => setProspectRole(e.target.value)}
              placeholder="Role"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm"
            />
          </>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500">
            Previous notes
          </span>
          <textarea
            value={previousNotes}
            onChange={(e) => setPreviousNotes(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm leading-relaxed"
          />
        </label>

        <p className="text-center text-xs text-zinc-600">Transcript label: {previewName}</p>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-zinc-700 px-8 py-3 text-sm text-zinc-400"
        >
          Back
        </button>
        <button
          type="button"
          onClick={manualEntry || !linkedInUrl.trim() ? startDirect : runResearch}
          className="rounded-full bg-emerald-600 px-10 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-500"
        >
          {manualEntry || !linkedInUrl.trim() ? 'Start call' : 'Research & start'}
        </button>
      </div>
    </div>
  )
}
