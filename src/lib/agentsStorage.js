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
  const kbSection = knowledgeBaseText?.trim()
    ? `KNOWLEDGE BASE — READ THIS FULLY. THIS IS YOUR ONLY REFERENCE:\n${knowledgeBaseText}`
    : `KNOWLEDGE BASE: None uploaded. Use sharp, human best-practice sales technique.`

  return `You are an AI sales copilot on a live call. Your only job is to give the salesperson exact words to say out loud right now.

CRITICAL RULES:
- The knowledge base below is your complete bible. Read it fully and follow it precisely for every single response.
- Every response must reflect the tone, personality, frameworks and exact language described in the knowledge base. Do not deviate.
- Do not use generic sales language. Do not invent approaches. Everything comes from the knowledge base.
- Responses must sound like a real human saying it naturally on a phone call.
- Keep it short — 1 to 3 sentences maximum. The salesperson needs to say this right now out loud.
- Never start with "I". Never sound like an AI wrote it.

${kbSection}`
}
