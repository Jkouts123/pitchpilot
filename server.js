import express from 'express'
import cors from 'cors'
import Exa from 'exa-js'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
const PORT = 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json())

// ── helpers ───────────────────────────────────────────────────────────────────

function send(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * Try to pull a company name out of raw LinkedIn profile text so we can use it
 * in subsequent searches.  Falls back to the URL slug (which is often the
 * person's name — still useful as a search term).
 */
function extractCompanyHint(text, url) {
  if (text) {
    // Common LinkedIn patterns: "Senior Engineer at Acme Corp ·" or "Acme Corp\n"
    const m = text.match(/\bat\s+([A-Z][A-Za-z0-9 &.,'-]{2,50})(?:\s*[·|\n]|\s*\d{4})/u)
    if (m) return m[1].trim()
  }
  // Fall back to URL slug (usually the person's name — still helpful)
  const slug = url?.match(/\/in\/([^/?#]+)/)?.[1]
  return slug ? slug.replace(/-/g, ' ') : ''
}

function buildResearchPrompt(linkedInText, companyText, tenderText) {
  return `You are a sales intelligence assistant preparing a salesperson for a discovery call.

## LinkedIn Profile Content
${linkedInText || '(not available)'}

## Company Research
${companyText || '(not available)'}

## Relevant Projects / Tenders / Contracts
${tenderText || '(not available)'}

Based on this research, return ONLY a valid JSON object with exactly these fields — no markdown, no extra text:
{
  "person": {
    "name": "full name extracted from LinkedIn, or a best-guess from the URL slug",
    "role": "their job title / role",
    "company": "company name"
  },
  "companySummary": "one clear sentence describing what the company does",
  "opener": "a warm, specific, personalised 2-3 sentence call opener the salesperson says at the very start of the call — reference something concrete from the research to show you have done your homework",
  "talkingPoints": [
    "first relevant talking point tied to this prospect or company",
    "second relevant talking point"
  ]
}`
}

// ── main endpoint ─────────────────────────────────────────────────────────────

app.post('/api/research', async (req, res) => {
  const { linkedinUrl, manualData } = req.body

  // Set SSE headers before any async work
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Manual-only path — nothing to research
  if (!linkedinUrl) {
    send(res, { done: true, result: null })
    return res.end()
  }

  const exa = new Exa(process.env.EXA_API_KEY)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── Step 1: LinkedIn profile ────────────────────────────────────────────────
  send(res, { step: 'Finding LinkedIn profile…' })
  let linkedInText = ''
  try {
    const r = await exa.getContents([linkedinUrl], { text: { maxCharacters: 3000 } })
    linkedInText = r.results?.[0]?.text ?? ''
  } catch {
    linkedInText = `Profile URL: ${linkedinUrl}`
  }

  const companyHint = extractCompanyHint(linkedInText, linkedinUrl)

  // ── Step 2: Company research ────────────────────────────────────────────────
  send(res, { step: 'Researching company…' })
  let companyText = ''
  if (companyHint) {
    try {
      const r = await exa.searchAndContents(companyHint, {
        category: 'company',
        numResults: 2,
        text: { maxCharacters: 2000 },
      })
      companyText =
        r.results
          ?.map((x) => [x.title, x.text ?? ''].filter(Boolean).join('\n'))
          .join('\n---\n') ?? ''
    } catch {
      /* continue without company data */
    }
  }

  // ── Step 3: Tenders / contracts ─────────────────────────────────────────────
  send(res, { step: 'Searching for relevant tenders and contracts…' })
  let tenderText = ''
  try {
    const query = companyHint
      ? `${companyHint} tender government contract construction project`
      : `${linkedinUrl} company tender contract`
    const r = await exa.searchAndContents(query, {
      numResults: 2,
      text: { maxCharacters: 1500 },
    })
    tenderText =
      r.results
        ?.map((x) => [x.title, x.text ?? ''].filter(Boolean).join(': '))
        .join('\n---\n') ?? ''
  } catch {
    /* continue without tender data */
  }

  // ── Step 4: Synthesise with Claude ──────────────────────────────────────────
  send(res, { step: 'Building your opener…' })
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildResearchPrompt(linkedInText, companyText, tenderText) }],
    })

    const raw = msg.content[0].text.trim()
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
    const result = JSON.parse(jsonStr)
    send(res, { done: true, result })
  } catch (e) {
    send(res, {
      done: true,
      result: { person: {}, companySummary: '', opener: '', talkingPoints: [] },
      error: String(e?.message ?? e),
    })
  }

  res.end()
})

app.listen(PORT, () =>
  console.log(`PitchPilot research server → http://localhost:${PORT}`),
)
