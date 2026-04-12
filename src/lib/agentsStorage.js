const KEY = 'pitchpilot.agents'
const OLD_KEY = 'pitchpilot.presets'

// ── migration ──────────────────────────────────────────────────────────────────
function migrateFromPresets() {
  const raw = localStorage.getItem(OLD_KEY)
  if (!raw) return
  try {
    const agents = JSON.parse(raw).map((p) => ({
      id: p.id,
      name: p.name,
      knowledgeBase: [],
      createdAt: p.createdAt ?? new Date().toISOString(),
    }))
    localStorage.setItem(KEY, JSON.stringify(agents))
    localStorage.removeItem(OLD_KEY)
  } catch {
    /* ignore bad data */
  }
}

// ── public API ─────────────────────────────────────────────────────────────────

export function loadAgents() {
  migrateFromPresets()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveAgents(agents) {
  localStorage.setItem(KEY, JSON.stringify(agents))
}

export function upsertAgent(agent) {
  const list = loadAgents()
  const idx = list.findIndex((a) => a.id === agent.id)
  if (idx >= 0) list[idx] = agent
  else list.push(agent)
  saveAgents(list)
}

export function deleteAgent(id) {
  saveAgents(loadAgents().filter((a) => a.id !== id))
}

export function getAgentById(id) {
  return loadAgents().find((a) => a.id === id) ?? null
}

// ── knowledge base helpers ─────────────────────────────────────────────────────

/** Join all uploaded PDF texts into a single string for use in AI prompts. */
export function buildKnowledgeBaseText(knowledgeBase) {
  if (!knowledgeBase?.length) return ''
  return knowledgeBase
    .map((doc) => `--- ${doc.filename} ---\n${doc.text}`)
    .join('\n\n')
}

/** Build the system prompt from the agent's knowledge base. */
export function buildSystemPrompt(knowledgeBaseText) {
  if (!knowledgeBaseText?.trim()) {
    return 'You are an AI sales copilot. Help the salesperson respond effectively and close the deal.'
  }
  return `You are an AI sales copilot. Use the following knowledge base as your complete reference for every response. Follow the frameworks, scripts, objection handles, and style described exactly.

KNOWLEDGE BASE:
${knowledgeBaseText}`
}
