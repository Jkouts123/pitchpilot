import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function anthropicProxyPlugin(mode) {
  return {
    name: 'anthropic-proxy',
    configureServer(server) {
      setupAnthropicProxy(server.middlewares, mode)
    },
    configurePreviewServer(server) {
      setupAnthropicProxy(server.middlewares, mode)
    },
  }
}

function setupAnthropicProxy(middlewares, mode) {
  middlewares.use(async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/anthropic/')) {
      next()
      return
    }
    if (req.method !== 'POST' && req.method !== 'OPTIONS') {
      res.statusCode = 405
      res.end()
      return
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.statusCode = 204
      res.end()
      return
    }

    const env = loadEnv(mode, process.cwd(), '')
    const apiKey = env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Missing VITE_ANTHROPIC_API_KEY.' }))
      return
    }

    const targetPath = url.replace(/^\/api\/anthropic/, '')
    const targetUrl = `https://api.anthropic.com${targetPath}`

    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)

    try {
      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body,
      })

      res.statusCode = upstream.status
      upstream.headers.forEach((value, key) => {
        if (key === 'content-type' || key === 'cache-control') {
          res.setHeader(key, value)
        }
      })
      res.setHeader('Access-Control-Allow-Origin', '*')

      if (!upstream.body) {
        res.end()
        return
      }

      const reader = upstream.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          res.end()
          return
        }
        res.write(Buffer.from(value))
      }
    } catch (e) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: String(e?.message ?? e) }))
    }
  })
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), anthropicProxyPlugin(mode)],
}))
