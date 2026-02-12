// ============================================================
// Gemini Multi-Key Provider with Automatic Fallback & Rotation
// Manages a pool of up to 3 Gemini API keys with health tracking,
// cooldown periods for rate-limited keys, and transparent retry.
// ============================================================

import { generateText, type GenerateTextResult } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// ============================================================
// Types
// ============================================================

export type KeyStatus = 'healthy' | 'rate-limited' | 'error' | 'untested'

export interface KeyHealth {
  index: number
  key: string // masked version for display
  status: KeyStatus
  lastUsed: number | null
  lastError: string | null
  failCount: number
  cooldownUntil: number | null
}

export interface GeminiGenerateOptions {
  modelId: 'gemini-2.5-pro-preview-05-06' | 'gemini-2.5-flash-preview-04-17'
  prompt: string
  output?: Parameters<typeof generateText>[0]['output']
  maxOutputTokens?: number
  temperature?: number
}

export interface FallbackResult<T = GenerateTextResult<never, never>> {
  result: T
  keyIndex: number
}

// ============================================================
// Constants
// ============================================================

const RATE_LIMIT_COOLDOWN_MS = 60_000 // 60 seconds
const MAX_RETRIES_PER_REQUEST = 3 // one attempt per key

// ============================================================
// Singleton Key Manager
// ============================================================

class GeminiKeyManager {
  private keys: string[] = []
  private health: KeyHealth[] = []
  private initialized = false

  /** Load keys from environment variables. Call once at startup or lazily. */
  initialize(): void {
    if (this.initialized) return

    const envKeys = [
      process.env.GEMINI_KEY,
      process.env.GEMINI_KEY_TWO,
      process.env.GEMINI_KEY_THREE,
    ]

    this.keys = []
    this.health = []

    for (let i = 0; i < envKeys.length; i++) {
      const key = envKeys[i]
      if (key && key.trim().length > 0) {
        this.keys.push(key.trim())
        this.health.push({
          index: this.keys.length - 1,
          key: maskKey(key.trim()),
          status: 'untested',
          lastUsed: null,
          lastError: null,
          failCount: 0,
          cooldownUntil: null,
        })
      }
    }

    this.initialized = true
  }

  /** Get the number of available keys. */
  get keyCount(): number {
    this.initialize()
    return this.keys.length
  }

  /** Returns the health status of all keys (safe for API exposure). */
  getHealthStatus(): KeyHealth[] {
    this.initialize()
    // Update cooldown status in real-time
    const now = Date.now()
    for (const h of this.health) {
      if (h.status === 'rate-limited' && h.cooldownUntil && now >= h.cooldownUntil) {
        h.status = 'untested' // cooldown expired, allow retry
        h.cooldownUntil = null
      }
    }
    return this.health.map((h) => ({ ...h }))
  }

  /** Get the best available key index (skipping rate-limited/errored keys). */
  private getBestKeyIndex(): number | null {
    this.initialize()
    const now = Date.now()

    for (let i = 0; i < this.health.length; i++) {
      const h = this.health[i]

      // Skip permanently errored keys (auth failures)
      if (h.status === 'error') continue

      // Skip keys still in cooldown
      if (h.status === 'rate-limited' && h.cooldownUntil && now < h.cooldownUntil) continue

      // If cooldown expired, allow retry
      if (h.status === 'rate-limited' && h.cooldownUntil && now >= h.cooldownUntil) {
        h.status = 'untested'
        h.cooldownUntil = null
      }

      return i
    }

    return null
  }

  /** Create a Google AI provider for a specific key index. */
  createProvider(keyIndex: number) {
    this.initialize()
    if (keyIndex < 0 || keyIndex >= this.keys.length) {
      throw new Error(`Invalid key index: ${keyIndex}`)
    }
    return createGoogleGenerativeAI({ apiKey: this.keys[keyIndex] })
  }

  /** Report a successful call for a key. */
  reportSuccess(keyIndex: number): void {
    if (keyIndex < 0 || keyIndex >= this.health.length) return
    const h = this.health[keyIndex]
    h.status = 'healthy'
    h.lastUsed = Date.now()
    h.lastError = null
    h.failCount = 0
    h.cooldownUntil = null
  }

  /** Report a failed call for a key. Returns category of failure. */
  reportFailure(keyIndex: number, error: unknown): 'rate-limited' | 'auth-error' | 'other' {
    if (keyIndex < 0 || keyIndex >= this.health.length) return 'other'

    const h = this.health[keyIndex]
    h.lastUsed = Date.now()
    h.failCount++

    const message = error instanceof Error ? error.message : String(error)
    h.lastError = message

    // Detect rate limit (HTTP 429)
    if (message.includes('429') || message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('quota')) {
      h.status = 'rate-limited'
      h.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
      return 'rate-limited'
    }

    // Detect auth errors (401, 403)
    if (message.includes('401') || message.includes('403') || message.toLowerCase().includes('api key') || message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('forbidden')) {
      h.status = 'error' // permanent -- bad key
      return 'auth-error'
    }

    // Other transient errors
    if (h.failCount >= 3) {
      h.status = 'error'
    }
    return 'other'
  }

  /**
   * Generate text with automatic key rotation and fallback.
   * Tries each available key in order (primary first).
   * Returns the result plus which key was used.
   */
  async generateWithFallback(options: GeminiGenerateOptions): Promise<FallbackResult> {
    this.initialize()

    if (this.keys.length === 0) {
      throw new Error('No Gemini API keys configured. Set GEMINI_KEY in your environment variables.')
    }

    let lastError: Error | null = null
    const triedKeys: number[] = []

    for (let attempt = 0; attempt < MAX_RETRIES_PER_REQUEST; attempt++) {
      const keyIndex = this.getNextAvailableKey(triedKeys)
      if (keyIndex === null) break

      triedKeys.push(keyIndex)

      try {
        const google = this.createProvider(keyIndex)
        const model = google(options.modelId)

        const result = await generateText({
          model,
          prompt: options.prompt,
          ...(options.output ? { output: options.output } : {}),
          maxTokens: options.maxOutputTokens ?? 4000,
          temperature: options.temperature ?? 0.1,
        })

        this.reportSuccess(keyIndex)
        return { result: result as never, keyIndex }
      } catch (error) {
        const category = this.reportFailure(keyIndex, error)
        lastError = error instanceof Error ? error : new Error(String(error))

        // Log rotation info
        const nextKey = this.getNextAvailableKey(triedKeys)
        if (nextKey !== null) {
          console.log(
            `[GeminiProvider] Key ${keyIndex + 1} failed (${category}), rotating to Key ${nextKey + 1}`
          )
        }
      }
    }

    throw new Error(
      `All Gemini keys exhausted after ${triedKeys.length} attempt(s). Last error: ${lastError?.message ?? 'Unknown'}`
    )
  }

  /**
   * Ping a specific key with a minimal prompt. Used for diagnostics.
   * If keyIndex is not provided, uses the best available key.
   */
  async pingKey(
    modelId: 'gemini-2.5-pro-preview-05-06' | 'gemini-2.5-flash-preview-04-17',
    keyIndex?: number
  ): Promise<{ status: 'ok' | 'error'; latencyMs: number; response: string | null; error?: string; keyIndex: number }> {
    this.initialize()

    const idx = keyIndex ?? this.getBestKeyIndex()
    if (idx === null || idx >= this.keys.length) {
      return { status: 'error', latencyMs: 0, response: null, error: 'No available keys', keyIndex: idx ?? -1 }
    }

    const start = Date.now()
    try {
      const google = this.createProvider(idx)
      const model = google(modelId)

      const { text } = await generateText({
        model,
        prompt: 'Respond with exactly: OK followed by your model name. Nothing else.',
        maxTokens: 50,
        temperature: 0,
      })

      const latencyMs = Date.now() - start
      this.reportSuccess(idx)
      return { status: 'ok', latencyMs, response: text.trim().substring(0, 200), keyIndex: idx }
    } catch (error) {
      const latencyMs = Date.now() - start
      this.reportFailure(idx, error)
      return {
        status: 'error',
        latencyMs,
        response: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        keyIndex: idx,
      }
    }
  }

  /** Get next available key, skipping already-tried and unavailable keys. */
  private getNextAvailableKey(exclude: number[]): number | null {
    const now = Date.now()
    for (let i = 0; i < this.health.length; i++) {
      if (exclude.includes(i)) continue
      const h = this.health[i]
      if (h.status === 'error') continue
      if (h.status === 'rate-limited' && h.cooldownUntil && now < h.cooldownUntil) continue
      return i
    }
    return null
  }
}

// ============================================================
// Helper
// ============================================================

function maskKey(key: string): string {
  if (key.length <= 8) return '***'
  return key.substring(0, 4) + '...' + key.substring(key.length - 4)
}

// ============================================================
// Singleton export
// ============================================================

let instance: GeminiKeyManager | null = null

export function getGeminiKeyManager(): GeminiKeyManager {
  if (!instance) {
    instance = new GeminiKeyManager()
  }
  return instance
}
