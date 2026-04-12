import { completeMessages, parseJsonFromModel } from './anthropic'

// Max chars of KB to include in suggestion prompts — keep latency low
const KB_EXCERPT_LIMIT = 4000

function buildSystem(knowledgeBaseText) {
  const kbSection = knowledgeBaseText?.trim()
    ? `\n\nSALES PLAYBOOK (reference specific frameworks by name when relevant):\n${knowledgeBaseText.slice(0, KB_EXCERPT_LIMIT)}`
    : ''

  return `You scan live sales call transcript snippets and return short tactical coaching labels.${kbSection}

Output ONLY valid JSON: {"suggestions": string[]}

Rules:
- Return 0 to 2 labels only when something signal-worthy just happened: buying intent, objection, budget mention, timeline, competitor, decision-maker, stall, risk, or strong interest.
- If a knowledge base is provided, name the specific framework from the playbook. Examples: "Price objection — anchor to contract value", "Stall — use the gamechanger question", "They're qualified — move to demo now", "Competitor mentioned — use the switch script".
- Without a knowledge base, use generic labels: "Budget concern — acknowledge it", "Strong interest — pitch now".
- Each label max 10 words.
- If the prospect's last line was routine or added no strategic signal, return {"suggestions": []}.
- No markdown, no explanation, JSON only.`
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
