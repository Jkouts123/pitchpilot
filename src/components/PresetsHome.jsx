import { useState } from 'react'
import { deletePreset, loadPresets, upsertPreset } from '../lib/presetsStorage'

function truncate(s, n = 140) {
  const t = (s || '').trim()
  if (t.length <= n) return t || '—'
  return `${t.slice(0, n)}…`
}

export default function PresetsHome({ onStartCall }) {
  const [presets, setPresets] = useState(() => loadPresets())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [masterPrompt, setMasterPrompt] = useState('')

  const refresh = () => setPresets(loadPresets())

  const openNew = () => {
    setEditing(null)
    setName('')
    setMasterPrompt('')
    setModalOpen(true)
  }

  const openEdit = (p) => {
    setEditing(p)
    setName(p.name)
    setMasterPrompt(p.masterPrompt)
    setModalOpen(true)
  }

  const saveModal = () => {
    const n = name.trim()
    if (!n || !masterPrompt.trim()) return
    const preset = editing
      ? { ...editing, name: n, masterPrompt: masterPrompt.trim() }
      : { id: crypto.randomUUID(), name: n, masterPrompt: masterPrompt.trim(), createdAt: new Date().toISOString() }
    upsertPreset(preset)
    refresh()
    setModalOpen(false)
  }

  const remove = (id) => {
    if (!confirm('Delete this preset?')) return
    deletePreset(id)
    refresh()
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-100">Presets</h1>
          <p className="mt-2 text-sm text-zinc-500">Your rules, context, and style — one tap before each call.</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-zinc-950 shadow-[0_16px_40px_-12px_rgba(16,185,129,0.5)] hover:bg-emerald-500"
        >
          + New preset
        </button>
      </header>

      {presets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 py-20 text-center text-zinc-500">
          No presets yet. Create one to get started.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {presets.map((p) => (
            <li
              key={p.id}
              className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg font-medium text-zinc-100">{p.name}</h2>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                    title="Edit"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-red-950/50 hover:text-red-400"
                    title="Delete"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-500">{truncate(p.masterPrompt)}</p>
              <button
                type="button"
                onClick={() => onStartCall(p)}
                className="mt-5 w-full rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-200 hover:border-emerald-600/50 hover:bg-emerald-950/30"
              >
                Start call
              </button>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            role="dialog"
            aria-labelledby="preset-modal-title"
          >
            <h2 id="preset-modal-title" className="font-display text-xl font-semibold text-zinc-100">
              {editing ? 'Edit preset' : 'New preset'}
            </h2>
            <label className="mt-4 block">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Preset name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100"
              />
            </label>
            <label className="mt-4 block">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Master prompt</span>
              <textarea
                value={masterPrompt}
                onChange={(e) => setMasterPrompt(e.target.value)}
                rows={14}
                placeholder="Paste full rules: company, tone, objections, openers…"
                className="mt-1.5 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-mono text-xs leading-relaxed text-zinc-200"
              />
            </label>
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
                className="rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-zinc-950"
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
