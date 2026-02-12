import { generateText } from 'ai'
import { createXai } from '@ai-sdk/xai'
import { getGeminiKeyManager } from '@/lib/crawler/gemini-provider'
import type { AiProvider } from '@/lib/crawler/types'

export const dynamic = 'force-dynamic'

const xai = createXai({ apiKey: process.env.XAI_API_KEY })

const GEMINI_MODEL_MAP = {
  'gemini-3-pro': 'gemini-2.5-pro-preview-05-06',
  'gemini-3-flash': 'gemini-2.5-flash-preview-04-17',
} as const

const PROVIDER_LABELS: Record<AiProvider, string> = {
  'gemini-3-pro': 'Gemini 2.5 Pro',
  'gemini-3-flash': 'Gemini 2.5 Flash',
  'grok': 'Grok 3 Mini Fast',
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const provider = (body.provider || 'gemini-3-flash') as AiProvider
  const keyIndex = typeof body.keyIndex === 'number' ? body.keyIndex : undefined

  const label = PROVIDER_LABELS[provider] || provider
  const startTime = Date.now()

  try {
    // Handle Grok provider
    if (provider === 'grok') {
      const { text } = await generateText({
        model: xai('grok-3-mini-fast'),
        prompt: 'Respond with exactly: OK followed by your model name. Nothing else.',
        maxTokens: 50,
        temperature: 0,
      })

      const latencyMs = Date.now() - startTime
      return Response.json({
        status: 'ok',
        provider,
        model: label,
        latencyMs,
        response: text.trim().substring(0, 200),
      })
    }

    // Handle Gemini providers with multi-key support
    const geminiManager = getGeminiKeyManager()
    const modelId = GEMINI_MODEL_MAP[provider as keyof typeof GEMINI_MODEL_MAP]

    if (!modelId) {
      return Response.json(
        { status: 'error', provider, model: label, latencyMs: 0, response: null, error: `Unknown provider: ${provider}` },
        { status: 400 }
      )
    }

    const pingResult = await geminiManager.pingKey(modelId, keyIndex)
    const keyHealth = geminiManager.getHealthStatus()

    return Response.json(
      {
        status: pingResult.status,
        provider,
        model: label,
        latencyMs: pingResult.latencyMs,
        response: pingResult.response,
        error: pingResult.error,
        keyUsed: pingResult.keyIndex,
        keyHealth,
      },
      { status: pingResult.status === 'ok' ? 200 : 500 }
    )
  } catch (error) {
    const latencyMs = Date.now() - startTime
    const geminiManager = getGeminiKeyManager()

    return Response.json(
      {
        status: 'error',
        provider,
        model: label,
        latencyMs,
        response: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        keyHealth: geminiManager.getHealthStatus(),
      },
      { status: 500 }
    )
  }
}
