export function parseDeepgramMessage(msg, labels) {
  const you = labels.you
  const them = labels.them
  if (!msg || typeof msg !== 'object') return null

  const channel = msg.channel ?? msg.channels?.[0]
  const alt = channel?.alternatives?.[0]
  if (!alt) return null

  const words = alt.words
  const transcript = (alt.transcript ?? '').trim()
  const isFinal = Boolean(msg.is_final)
  const speechFinal = Boolean(msg.speech_final)

  if (words?.length) {
    const last = words[words.length - 1]
    if (last && typeof last.speaker === 'number') {
      return {
        isFinal,
        speechFinal,
        words,
        transcript,
        lastSpeaker: last.speaker,
        labeled: wordsToLabeled(words, you, them),
      }
    }
  }

  return {
    isFinal,
    speechFinal,
    words: words ?? [],
    transcript,
    lastSpeaker: undefined,
    labeled: transcript || '',
  }
}

function wordsToLabeled(words, you, them) {
  if (!words.length) return ''
  const parts = []
  let curSpeaker = words[0].speaker
  let buf = []
  for (const w of words) {
    if (w.speaker !== curSpeaker) {
      const label = curSpeaker === 0 ? you : them
      parts.push(`${label}: ${buf.join(' ')}`)
      buf = []
      curSpeaker = w.speaker
    }
    buf.push(w.word ?? w.punctuated_word ?? '')
  }
  if (buf.length) {
    const label = curSpeaker === 0 ? you : them
    parts.push(`${label}: ${buf.join(' ')}`)
  }
  return parts.join('\n')
}

export function shouldTriggerCopilot(parsed) {
  if (!parsed) return false
  if (!parsed.isFinal || !parsed.speechFinal) return false
  if (parsed.lastSpeaker !== 1) return false
  return Boolean(parsed.transcript?.trim())
}
