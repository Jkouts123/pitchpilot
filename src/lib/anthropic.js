const MODEL = 'claude-sonnet-4-20250514'

function anthropicBaseUrl() {
  if (typeof window === 'undefined') return 'https://api.anthropic.com'
  return `${window.location.origin}/api/anthropic`
}

export async function streamMessages({ system, messages, onDelta, signal, maxTokens = 4096 }) {
  const res = await fetch(`${anthropicBaseUrl()}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      stream: true,
      system,
      messages,
    }),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || `Anthropic error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const evt = JSON.parse(payload)
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          onDelta(evt.delta.text)
        }
      } catch {
        /* ignore */
      }
    }
  }
}

export async function completeMessages({ system, messages, signal, maxTokens = 4096 }) {
  let text = ''
  await streamMessages({
    system,
    messages,
    signal,
    maxTokens,
    onDelta: (t) => {
      text += t
    },
  })
  return text
}

export function parseJsonFromModel(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1].trim() : text.trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('No JSON object in model output')
  return JSON.parse(raw.slice(start, end + 1))
}
