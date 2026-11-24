// Cloudflare Worker: OpenCode Go proxy with a shared access key.
const UPSTREAM = 'https://opencode.ai/inference/go'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const ALLOWED_PATH = /^\/(?:v1|openai\/v1|anthropic\/v1|google\/v1beta)\//

const MAX_BODY_BYTES = 32 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 5 * 60 * 1000

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function isAuthorized(request, env) {
  const expected = env.PROXY_KEY ?? ''
  if (!expected) return false

  // ตรวจสอบ PROXY_KEY จาก Client
  const providedKey = request.headers.get('x-proxy-key')
  if (providedKey && safeEqual(providedKey, expected)) {
    return true
  }

  const authHeader = request.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (safeEqual(token, expected)) {
      return true
    }
  }

  return false
}

function hasEncodedSeparator(pathname) {
  let value = pathname
  for (let depth = 0; depth < 4; depth += 1) {
    if (/%2f|%5c|%00/i.test(value)) return true
    const decoded = value.replace(/%25/gi, '%')
    if (decoded === value) return false
    value = decoded
  }
  return true
}

function forwardHeaders(request, env) {
  const headers = new Headers(request.headers)

  // ลบ header ฝั่ง client และ proxy key ออก
  for (const name of [
    'host',
    'x-proxy-key',
    'authorization',
    'x-opencode-client',
    'x-client-version',
    'cookie',
    'origin',
    'referer',
    'cf-connecting-ip',
    'cf-worker',
    'cf-ray',
    'cf-ipcountry',
    'cf-visitor',
    'cdn-loop',
    'forwarded',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-real-ip',
    'x-api-key',
    'proxy-authorization',
    'true-client-ip',
    'connection',
    'keep-alive',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    headers.delete(name)
  }

  headers.set('user-agent', BROWSER_UA)

  // แนบ API Key จริงของ OpenCode Go ก่อนส่งไปยัง Upstream
  if (env.OPENCODE_API_KEY) {
    headers.set('authorization', `Bearer ${env.OPENCODE_API_KEY}`)
  }

  return headers
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 })
    }

    if (!isAuthorized(request, env)) {
      return json(401, { error: 'Unauthorized' })
    }

    if (!env.OPENCODE_API_KEY) {
      return json(500, { error: 'Missing OPENCODE_API_KEY in worker env' })
    }

    if (hasEncodedSeparator(url.pathname)) {
      return json(404, { error: 'Not found' })
    }

    if (!ALLOWED_PATH.test(url.pathname)) {
      return json(404, { error: 'Not found' })
    }

    const isCatalog = request.method === 'GET' && url.pathname.endsWith('/models')
    if (request.method !== 'POST' && !isCatalog) {
      return json(405, { error: 'Method not allowed' })
    }

    const length = Number(request.headers.get('content-length') ?? 0)
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return json(413, { error: 'Payload too large' })
    }

    const destination = new URL(UPSTREAM + url.pathname + url.search)
    if (!destination.pathname.startsWith('/inference/go/')) {
      return json(404, { error: 'Not found' })
    }

    try {
      const upstream = await fetch(destination.toString(), {
        method: request.method,
        headers: forwardHeaders(request, env), // ส่ง env เข้าไปแนบ key
        body: request.method === 'GET' ? undefined : request.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })

      const headers = new Headers(upstream.headers)
      headers.delete('set-cookie')

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      })
    } catch (error) {
      console.error('proxy upstream failed', error)
      return json(502, { error: 'Upstream request failed' })
    }
  },
}
