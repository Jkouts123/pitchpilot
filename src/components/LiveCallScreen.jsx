import * as Framer from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DeepgramClient } from '@deepgram/sdk'
import { streamMessages } from '../lib/anthropic'
import { acquireAudioStream, attachPCMProcessor } from '../lib/deepgramAudio'
import { buildKnowledgeBaseText, buildSystemPrompt } from '../lib/agentsStorage'
import { getProspectCompanyLine, getProspectDisplayName } from '../lib/preCallDisplay'
import { fetchSuggestionPills } from '../lib/suggestionSignal'
import { parseDeepgramMessage, shouldTriggerCopilot } from '../lib/transcript'

// ── prospect context for AI user messages ─────────────────────────────────────

function buildProspectContext(p) {
  const lines = []
  const r = p.researchResult

  if (r?.person?.name) {
    lines.push(
      `Name: ${r.person.name}`,
      `Role: ${r.person.role || '—'}`,
      `Company: ${r.person.company || '—'}`,
    )
    if (r.companySummary) lines.push(`Company summary: ${r.companySummary}`)
    if (r.talkingPoints?.length) lines.push(`Talking points: ${r.talkingPoints.join('; ')}`)
  } else if (p.manualEntry) {
    lines.push(
      `Name: ${p.prospectName || '—'}`,
      `Company: ${p.prospectCompany || '—'}`,
      `Role: ${p.prospectRole || '—'}`,
    )
  } else {
    lines.push(`LinkedIn URL (reference only): ${p.linkedInUrl || '—'}`)
  }

  if (p.opener) lines.push(`Suggested call opener (already used): ${p.opener}`)
  lines.push(`Previous notes: ${p.previousNotes || '—'}`)
  return lines.join('\n')
}

function buildUserPayload(preCall, transcriptText, extraHint) {
  let body = [
    '## Prospect context',
    buildProspectContext(preCall),
    '',
    '## Full transcript (latest at bottom)',
    transcriptText.trim() || '(no speech yet)',
    '',
    '## Task',
    'Write exactly one thing the salesperson should say out loud right now. Follow the scripts and frameworks from the knowledge base exactly. Sound like the salesperson who wrote the playbook — natural, sharp, specific. No quotes, no preamble, no bullet points. Just the utterance.',
  ].join('\n')
  if (extraHint?.trim()) {
    body += `\n\n## Priority focus\n${extraHint.trim()}`
  }
  return body
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LiveCallScreen({ preCall, onEndCall }) {
  const dgKey = import.meta.env.VITE_DEEPGRAM_API_KEY
  const prospectName = getProspectDisplayName(preCall)
  const companyLine = getProspectCompanyLine(preCall)

  // Build system prompt once from knowledge base
  const knowledgeBaseText = useMemo(
    () => buildKnowledgeBaseText(preCall.knowledgeBase),
    [preCall.knowledgeBase],
  )
  const systemPrompt = useMemo(() => buildSystemPrompt(knowledgeBaseText), [knowledgeBaseText])

  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [transcriptLines, setTranscriptLines] = useState([])
  const [interimLine, setInterimLine] = useState('')
  const [responseText, setResponseText] = useState('')
  const [responseLoading, setResponseLoading] = useState(false)
  const [pills, setPills] = useState([])

  const audioStopRef = useRef(null)
  const socketRef = useRef(null)
  const pendingRef = useRef('')
  const responseAbortRef = useRef(null)
  const suggestionAbortRef = useRef(null)
  const fullTranscriptRef = useRef('')

  useEffect(() => {
    const base = transcriptLines.map((l) => l.text).join('\n')
    fullTranscriptRef.current = interimLine.trim() ? `${base}\n${interimLine.trim()}` : base
  }, [transcriptLines, interimLine])

  const runGetResponse = useCallback(
    async (hint) => {
      responseAbortRef.current?.abort()
      const ac = new AbortController()
      responseAbortRef.current = ac
      setResponseLoading(true)
      setResponseText('')
      try {
        await streamMessages({
          system: systemPrompt,
          messages: [{ role: 'user', content: buildUserPayload(preCall, fullTranscriptRef.current, hint) }],
          signal: ac.signal,
          maxTokens: 1024,
          onDelta: (t) => setResponseText((prev) => prev + t),
        })
      } catch (e) {
        if (e?.name !== 'AbortError') {
          setResponseText((p) => p + `\n[Error: ${e?.message ?? e}]`)
        }
      } finally {
        setResponseLoading(false)
      }
    },
    [preCall, systemPrompt],
  )

  const linesRef = useRef([])
  const interimRef = useRef('')
  linesRef.current = transcriptLines
  interimRef.current = interimLine

  const refreshSuggestions = useCallback(
    async () => {
      const lines = linesRef.current.map((l) => l.text)
      const last6 = lines.slice(-6)
      if (!last6.length) return
      suggestionAbortRef.current?.abort()
      const ac = new AbortController()
      suggestionAbortRef.current = ac
      try {
        const sug = await fetchSuggestionPills(last6, ac.signal, knowledgeBaseText)
        if (!sug.length) {
          setPills([])
          return
        }
        setPills(sug.map((text) => ({ id: crypto.randomUUID(), text })))
      } catch (e) {
        if (e?.name !== 'AbortError') {
          /* ignore suggestion errors */
        }
      }
    },
    [knowledgeBaseText],
  )

  const handleDeepgramMessage = useCallback(
    (msg) => {
      const parsed = parseDeepgramMessage(msg, { you: 'You', them: prospectName })
      if (!parsed) return
      const displayLine = (parsed.labeled?.trim() || parsed.transcript || '').trim()
      if (parsed.isFinal) pendingRef.current = displayLine
      if (!parsed.speechFinal) {
        setInterimLine(displayLine)
        return
      }
      setInterimLine('')
      const chunk = pendingRef.current?.trim()
      pendingRef.current = ''
      if (chunk) {
        setTranscriptLines((prev) => [...prev, { id: crypto.randomUUID(), text: chunk }])
      }
      if (shouldTriggerCopilot(parsed)) {
        refreshSuggestions()
      }
    },
    [prospectName, refreshSuggestions],
  )

  const start = async () => {
    setError(null)
    if (!dgKey) {
      setError('Missing VITE_DEEPGRAM_API_KEY.')
      return
    }
    setStatus('connecting')
    try {
      const { stream, audioContext, sampleRate, rawStreams } = await acquireAudioStream()
      const deepgram = new DeepgramClient({ apiKey: dgKey })
      const socket = await deepgram.listen.v1.createConnection({
        model: 'nova-2',
        diarize: true,
        encoding: 'linear16',
        sample_rate: sampleRate,
        channels: 1,
        interim_results: true,
        smart_format: true,
      })
      socketRef.current = socket
      socket.on('open', () => {
        audioStopRef.current = attachPCMProcessor({
          stream,
          audioContext,
          rawStreams,
          onChunk: (buf) => {
            const s = socketRef.current
            if (!s || s.readyState !== 1) return
            try {
              s.sendMedia(new Uint8Array(buf))
            } catch {
              /* closed */
            }
          },
        })
        setStatus('live')
      })
      socket.on('message', handleDeepgramMessage)
      socket.on('error', (e) => setError(e?.message ?? String(e)))
      socket.on('close', () => setStatus((s) => (s === 'live' ? 'ended' : s)))
      socket.connect()
    } catch (e) {
      setError(e?.message ?? String(e))
      setStatus('idle')
    }
  }

  const end = () => {
    responseAbortRef.current?.abort()
    suggestionAbortRef.current?.abort()
    try {
      socketRef.current?.close()
    } catch {
      /* ignore */
    }
    socketRef.current = null
    if (audioStopRef.current) {
      audioStopRef.current()
      audioStopRef.current = null
    }
    const text = [...transcriptLines.map((l) => l.text), interimLine.trim()].filter(Boolean).join('\n')
    onEndCall(text)
  }

  const onPillClick = (label) => {
    runGetResponse(`The rep should lean into this moment: ${label}`)
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3 sm:px-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Live</p>
          <p className="font-display text-lg text-zinc-100">
            {prospectName}
            <span className="text-zinc-500"> · {companyLine}</span>
          </p>
          <p className="text-xs text-zinc-600">{preCall.presetName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === 'idle' && (
            <button
              type="button"
              onClick={start}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-zinc-950"
            >
              Share audio &amp; start
            </button>
          )}
          {status === 'connecting' && <span className="text-sm text-zinc-500">Connecting…</span>}
          {(status === 'live' || status === 'connecting') && (
            <button
              type="button"
              onClick={end}
              className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_12px_40px_-8px_rgba(220,38,38,0.5)] hover:bg-red-500"
            >
              End call
            </button>
          )}
        </div>
      </header>

      {error && (
        <div
          className={`mx-4 mt-3 rounded-xl border px-4 py-2 text-sm ${
            error.startsWith('BlackHole 2ch')
              ? 'border-amber-500/40 bg-amber-950/30 text-amber-200'
              : 'border-red-500/30 bg-red-950/20 text-red-200'
          }`}
        >
          {error}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-zinc-800/80">
        <section className="flex min-h-[36vh] flex-col border-b border-zinc-800/80 lg:min-h-0 lg:border-b-0">
          <div className="border-b border-zinc-800/80 px-4 py-2 sm:px-6">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Transcript</h2>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
            {transcriptLines.map((line) => (
              <Framer.motion.p
                key={line.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="text-[15px] leading-relaxed text-zinc-300"
              >
                {line.text}
              </Framer.motion.p>
            ))}
            {interimLine ? (
              <p className="text-[15px] leading-relaxed text-zinc-600">{interimLine}</p>
            ) : null}
            {!transcriptLines.length && !interimLine && status === 'live' && (
              <p className="text-sm text-zinc-600">Listening…</p>
            )}
          </div>
        </section>

        <section className="flex min-h-[50vh] flex-col bg-zinc-950/40 lg:min-h-0">
          <div className="border-b border-zinc-800/80 px-4 py-2 sm:px-6">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Copilot</h2>
          </div>

          <div className="flex flex-1 flex-col px-4 py-4 sm:px-6">
            <textarea
              readOnly
              value={responseText}
              placeholder="Your next line appears here…"
              className="min-h-[200px] flex-1 resize-none rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 text-xl leading-snug text-zinc-100 placeholder:text-zinc-600 sm:text-2xl"
            />

            <div className="mt-4 min-h-[52px]">
              <div className="flex flex-wrap justify-center gap-2">
                {pills.map((p) => (
                  <Framer.motion.button
                    key={p.id}
                    type="button"
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                    onClick={() => onPillClick(p.text)}
                    className="rounded-full border border-emerald-500/40 bg-emerald-950/50 px-4 py-2 text-center text-xs font-medium text-emerald-100 shadow-[0_0_24px_-4px_rgba(16,185,129,0.45)] hover:border-emerald-400/60 hover:shadow-[0_0_28px_-2px_rgba(16,185,129,0.55)]"
                  >
                    {p.text}
                  </Framer.motion.button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => runGetResponse()}
              disabled={responseLoading}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-5 text-lg font-bold tracking-tight text-zinc-950 shadow-[0_20px_50px_-12px_rgba(16,185,129,0.55)] hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50"
            >
              {responseLoading ? 'Thinking…' : 'Get response'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
