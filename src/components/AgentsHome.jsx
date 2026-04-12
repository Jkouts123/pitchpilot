import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useRef, useState } from 'react'
import { deleteAgent, loadAgents, upsertAgent } from '../lib/agentsStorage'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ── PDF extraction ────────────────────────────────────────────────────────────

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  return pages.join('\n').trim()
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return ''
  }
}

// ── PDF pill (inside modal) ───────────────────────────────────────────────────

function PdfPill({ doc, onRemove }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300">
      <svg className="h-3 w-3 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M4 18V6l6-6h6v18H4zm6-13V1l5 5h-5z" />
      </svg>
      <span className="max-w-[160px] truncate">{doc.filename}</span>
      {doc.loading ? (
        <svg className="h-3 w-3 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${doc.filename}`}
          className="ml-0.5 rounded-full text-zinc-500 hover:text-red-400"
        >
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </span>
  )
}

// ── drop zone (inside modal) ──────────────────────────────────────────────────

function PdfDropZone({ knowledgeBase, onFiles, onRemove }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const processFiles = (fileList) => {
    const pdfs = Array.from(fileList).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    )
    if (pdfs.length) onFiles(pdfs)
  }

  return (
    <div className="mt-1.5 space-y-3">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          processFiles(e.dataTransfer.files)
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragging
            ? 'border-emerald-500/60 bg-emerald-950/20'
            : 'border-zinc-700 hover:border-zinc-600'
        }`}
      >
        <svg className="h-7 w-7 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0-3 3m3-3 3 3M20 16.5A3.5 3.5 0 0 0 16.5 13H15a5 5 0 1 0-9.8 1.5" />
        </svg>
        <div>
          <p className="text-sm text-zinc-400">Drop PDFs here or <span className="text-emerald-500">browse</span></p>
          <p className="mt-0.5 text-xs text-zinc-600">Playbooks, scripts, objection guides — multiple files ok</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => { processFiles(e.target.files); e.target.value = '' }}
      />
      {knowledgeBase.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {knowledgeBase.map((doc, i) => (
            <PdfPill key={doc.id} doc={doc} onRemove={() => onRemove(doc.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function AgentsHome({ onStartCall }) {
  const [agents, setAgents] = useState(() => loadAgents())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  // modal form state
  const [name, setName] = useState('')
  const [knowledgeBase, setKnowledgeBase] = useState([]) // { id, filename, text, loading }[]

  const refresh = () => setAgents(loadAgents())

  const openNew = () => {
    setEditing(null)
    setName('')
    setKnowledgeBase([])
    setModalOpen(true)
  }

  const openEdit = (agent) => {
    setEditing(agent)
    setName(agent.name)
    // Convert stored { filename, text }[] to modal format (add temp ids)
    setKnowledgeBase(
      (agent.knowledgeBase ?? []).map((doc) => ({ ...doc, id: crypto.randomUUID() })),
    )
    setModalOpen(true)
  }

  const handleFiles = async (files) => {
    // Add loading placeholders
    const entries = files.map((f) => ({
      id: crypto.randomUUID(),
      filename: f.name,
      text: '',
      loading: true,
    }))
    setKnowledgeBase((prev) => [...prev, ...entries])

    // Extract text from each PDF in parallel
    await Promise.all(
      files.map(async (file, i) => {
        const id = entries[i].id
        try {
          const text = await extractPdfText(file)
          setKnowledgeBase((prev) =>
            prev.map((doc) => (doc.id === id ? { ...doc, text, loading: false } : doc)),
          )
        } catch {
          // Remove failed entries
          setKnowledgeBase((prev) => prev.filter((doc) => doc.id !== id))
        }
      }),
    )
  }

  const removePdf = (id) => setKnowledgeBase((prev) => prev.filter((doc) => doc.id !== id))

  const saveModal = () => {
    const n = name.trim()
    if (!n) return
    // Strip temp ids before saving; only keep fully extracted docs
    const kbToSave = knowledgeBase
      .filter((doc) => !doc.loading)
      .map(({ filename, text }) => ({ filename, text }))

    const agent = editing
      ? { ...editing, name: n, knowledgeBase: kbToSave }
      : {
          id: crypto.randomUUID(),
          name: n,
          knowledgeBase: kbToSave,
          createdAt: new Date().toISOString(),
        }
    upsertAgent(agent)
    refresh()
    setModalOpen(false)
  }

  const remove = (id) => {
    if (!confirm('Delete this Sales Agent?')) return
    deleteAgent(id)
    refresh()
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-100">
            Your Sales Agents
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Each agent has a knowledge base that drives every response.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-zinc-950 shadow-[0_16px_40px_-12px_rgba(16,185,129,0.5)] hover:bg-emerald-500"
        >
          + New Sales Agent
        </button>
      </header>

      {agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 py-20 text-center text-zinc-500">
          No Sales Agents yet. Create one to get started.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => {
            const pdfCount = agent.knowledgeBase?.length ?? 0
            return (
              <li
                key={agent.id}
                className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-medium text-zinc-100">{agent.name}</h2>
                    <div className="mt-1 flex items-center gap-2">
                      {pdfCount > 0 && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                          {pdfCount} PDF{pdfCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {pdfCount === 0 && (
                        <span className="rounded-full bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] text-zinc-600">
                          No knowledge base
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-zinc-600">
                        {formatDate(agent.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(agent)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      title="Edit"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(agent.id)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-red-950/50 hover:text-red-400"
                      title="Delete"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onStartCall(agent)}
                  className="mt-5 w-full rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-200 hover:border-emerald-600/50 hover:bg-emerald-950/30"
                >
                  Start call
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            role="dialog"
            aria-labelledby="agent-modal-title"
          >
            <h2 id="agent-modal-title" className="font-display text-xl font-semibold text-zinc-100">
              {editing ? 'Edit Sales Agent' : 'New Sales Agent'}
            </h2>

            <label className="mt-5 block">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Agent Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "First Touch Call — Tendor.ai"'
                className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </label>

            <div className="mt-5">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Knowledge Base</span>
              <p className="mt-0.5 text-xs text-zinc-600">
                Upload your playbook PDFs — scripts, objection handles, frameworks. The AI reads these verbatim.
              </p>
              <PdfDropZone
                knowledgeBase={knowledgeBase}
                onFiles={handleFiles}
                onRemove={removePdf}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-full border border-zinc-700 px-5 py-2 text-sm text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveModal}
                disabled={!name.trim()}
                className="rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
