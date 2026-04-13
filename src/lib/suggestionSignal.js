import { completeMessages, parseJsonFromModel } from './anthropic'

// Max chars of KB sent with every suggestion request — keeps latency low
const KB_EXCERPT_LIMIT = 4000

function buildSystem(knowledgeBaseText) {
  const kbSection = knowledgeBaseText?.trim()
    ? `SALES PLAYBOOK:\n${knowledgeBaseText.slice(0, KB_EXCERPT_LIMIT)}`
    : ''

  return `You are a live sales call coach whispering tactical cues to the salesperson. You have memorised the playbook.

${kbSection}

Your job: read the last few transcript lines and return 0–2 short coaching labels telling the rep exactly what move to make right now, named after the framework or script in the playbook.

RULES:
- Only fire when there is a real signal: objection, stall, buying intent, competitor mention, qualification moment, phase transition, price pushback, or emotional shift.
- When a signal matches something in the playbook, name the framework exactly as it appears there. Format: "[signal] — [playbook action]"
  Good examples: "Price objection — anchor to contract value", "Stall — gamechanger question", "Buying signal — move to close", "Competitor mention — use the switch script", "They're qualified — transition to demo"
- Without a playbook, use sharp generic labels in the same format.
- If the last line is routine, small talk, or adds no strategic signal → return {"suggestions": []}
- Max 2 labels. Max 10 words each. No markdown. Output ONLY valid JSON: {"suggestions": string[]}`
}

export async function fetchSuggestionPills(lastLines, signal, knowledgeBaseText = '') {
  if (!lastLines.length) return []
  const system = buildSystem(knowledgeBaseText)
  const user = `Last transcript lines (most recent last):\n${lastLines.join('\n')}`
  const text = await completeMessages({
    system,
    messages: [{ role: 'user', content: user }],
    signal,
    maxTokens: 256,
  })
  try {
    const data = parseJsonFromModel(text)
    const arr = Array.isArray(data.suggestions) ? data.suggestions : []
    return arr
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim())
      .slice(0, 2)
  } catch {
    return []
  }
}
