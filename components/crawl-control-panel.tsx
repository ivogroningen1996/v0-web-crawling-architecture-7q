'use client'

import { useState, useEffect, useCallback } from 'react'
import { useCrawlStatus, startCrawl, stopCrawl, resetCrawl } from '@/hooks/use-crawler-data'
import { usePersistentSettings } from '@/hooks/use-persistent-settings'
import { DUTCH_CITIES } from '@/lib/crawler/types'
import type { AiProvider } from '@/lib/crawler/types'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Globe,
  Play,
  Square,
  RotateCcw,
  MapPin,
  Loader2,
  ChevronDown,
  BrainCircuit,
  Activity,
  Zap,
  X,
  Check,
  RotateCw,
} from 'lucide-react'
import { toast } from 'sonner'

// ============================================================
// Elapsed Timer Display
// ============================================================

function ElapsedTimer({ startedAt }: { startedAt: number | null }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    if (!startedAt) {
      setElapsed('')
      return
    }
    const tick = () => {
      const diff = Math.max(0, Date.now() - startedAt)
      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setElapsed(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  if (!elapsed) return null

  return (
    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
      {elapsed}
    </span>
  )
}

// ============================================================
// AI Provider Ping Card (Enhanced with multi-key health)
// ============================================================

interface KeyHealthInfo {
  index: number
  key: string
  status: 'healthy' | 'rate-limited' | 'error' | 'untested'
  lastError: string | null
  cooldownUntil: number | null
}

interface PingResult {
  status: 'ok' | 'error'
  provider: string
  model: string
  latencyMs: number
  response: string | null
  error?: string
  keyUsed?: number
  keyHealth?: KeyHealthInfo[]
}

const KEY_STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  healthy: { dot: 'bg-emerald-500', label: 'Healthy' },
  'rate-limited': { dot: 'bg-amber-500 animate-pulse', label: 'Rate Limited' },
  error: { dot: 'bg-destructive', label: 'Error' },
  untested: { dot: 'bg-muted-foreground/40', label: 'Untested' },
}

function KeyHealthIndicator({ health }: { health: KeyHealthInfo[] }) {
  return (
    <div className="flex flex-col gap-1">
      {health.map((k) => {
        const style = KEY_STATUS_STYLES[k.status] || KEY_STATUS_STYLES.untested
        return (
          <div key={k.index} className="flex items-center gap-2">
            <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
            <span className="text-[10px] font-mono text-muted-foreground">
              Key {k.index + 1}: {style.label}
            </span>
            {k.status === 'rate-limited' && k.cooldownUntil && (
              <CooldownTimer until={k.cooldownUntil} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function CooldownTimer({ until }: { until: number }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [until])

  if (remaining <= 0) return null

  return (
    <span className="text-[9px] font-mono text-amber-500 tabular-nums">
      {remaining}s
    </span>
  )
}

function ProviderCard({
  provider,
  label,
  modelName,
  subtitle,
  isActive,
  isGemini,
  onSelect,
}: {
  provider: AiProvider
  label: string
  modelName: string
  subtitle: string
  isActive: boolean
  isGemini: boolean
  onSelect: () => void
}) {
  const [isPinging, setIsPinging] = useState(false)
  const [pingResult, setPingResult] = useState<PingResult | null>(null)

  const handlePing = async () => {
    setIsPinging(true)
    setPingResult(null)
    try {
      const res = await fetch('/api/ai/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data: PingResult = await res.json()
      setPingResult(data)
      if (data.status === 'ok') {
        const keyInfo = data.keyUsed !== undefined ? ` (Key ${data.keyUsed + 1})` : ''
        toast.success(`${label} responded in ${data.latencyMs}ms${keyInfo}`)
      } else {
        toast.error(`${label} ping failed: ${data.error}`)
      }
    } catch (err) {
      setPingResult({
        status: 'error',
        provider,
        model: modelName,
        latencyMs: 0,
        response: null,
        error: err instanceof Error ? err.message : 'Network error',
      })
      toast.error(`${label} ping failed`)
    } finally {
      setIsPinging(false)
    }
  }

  return (
    <div
      className={`rounded-md border p-3 flex flex-col gap-2 transition-colors cursor-pointer ${isActive
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:border-muted-foreground/30'
        }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'
              }`}
          />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        {isActive && (
          <span className="text-[9px] font-mono uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            active
          </span>
        )}
      </div>
      <p className="text-[10px] font-mono text-muted-foreground">{modelName}</p>
      <p className="text-[9px] text-muted-foreground/70">{subtitle}</p>

      {/* Key health indicators for Gemini providers */}
      {isGemini && pingResult?.keyHealth && (
        <KeyHealthIndicator health={pingResult.keyHealth} />
      )}

      <button
        onClick={(e) => {
          e.stopPropagation()
          handlePing()
        }}
        disabled={isPinging}
        className="flex items-center justify-center gap-1.5 rounded border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
      >
        {isPinging ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Zap className="h-3 w-3" />
        )}
        {isPinging ? 'Testing...' : 'Test Connection'}
      </button>

      {pingResult && (
        <div
          className={`rounded border px-2 py-1.5 text-[10px] font-mono leading-relaxed ${pingResult.status === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
              : 'border-destructive/30 bg-destructive/5 text-destructive'
            }`}
        >
          {pingResult.status === 'ok' ? (
            <>
              <span className="block">
                Latency: {pingResult.latencyMs}ms
                {pingResult.keyUsed !== undefined && (
                  <span className="text-muted-foreground ml-1">
                    via Key {pingResult.keyUsed + 1}
                  </span>
                )}
              </span>
              <span className="block text-muted-foreground mt-0.5 break-all">
                {pingResult.response}
              </span>
            </>
          ) : (
            <span className="block break-all">{pingResult.error}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Main Crawl Control Panel
// ============================================================

export function CrawlControlPanel() {
  const { data, mutate } = useCrawlStatus()
  const { settings, updateSettings, isHydrated } = usePersistentSettings()
  const [isLoading, setIsLoading] = useState(false)
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [aiConfigOpen, setAiConfigOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)

  // Local draft state for AI config textarea (avoids writing to localStorage on every keystroke)
  const [draftPrompt, setDraftPrompt] = useState('')
  const [draftKeywords, setDraftKeywords] = useState('')
  const [draftExclusions, setDraftExclusions] = useState('')

  // Sync draft from persistent settings on hydration
  useEffect(() => {
    if (isHydrated) {
      setDraftPrompt(settings.customSystemPrompt)
      setDraftKeywords(settings.additionalKeywords.join(', '))
      setDraftExclusions(settings.exclusionTerms.join(', '))
    }
  }, [isHydrated, settings.customSystemPrompt, settings.additionalKeywords, settings.exclusionTerms])

  const stats = data?.stats
  const isRunning = stats?.status === 'running'
  const isPaused = stats?.status === 'paused'

  const handleStart = async () => {
    setIsLoading(true)
    try {
      await startCrawl(settings.location, settings.radiusKm, {
        aiProvider: settings.aiProvider,
        customSystemPrompt: settings.customSystemPrompt,
        additionalKeywords: settings.additionalKeywords,
        exclusionTerms: settings.exclusionTerms,
        seniorityFilter: settings.seniorityFilter,
        languagePreference: settings.languagePreference,
      })
      await mutate()
      toast.success(`Crawler started targeting ${settings.location} (${settings.radiusKm}km)`)
    } catch {
      toast.error('Failed to start crawler')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = async () => {
    setIsLoading(true)
    setShowStopConfirm(false)
    try {
      await stopCrawl()
      await mutate()
      toast.info('Crawler stopped')
    } catch {
      toast.error('Failed to stop crawler')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = async () => {
    setIsLoading(true)
    try {
      await resetCrawl()
      await mutate()
      toast.info('Crawler state reset')
    } catch {
      toast.error('Failed to reset crawler')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveAiConfig = useCallback(() => {
    const keywords = draftKeywords
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const exclusions = draftExclusions
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    updateSettings({
      customSystemPrompt: draftPrompt,
      additionalKeywords: keywords,
      exclusionTerms: exclusions,
    })
    toast.success('AI configuration saved')
  }, [draftPrompt, draftKeywords, draftExclusions, updateSettings])

  return (
    <div className="rounded-lg border border-border bg-card ">
      {/* Progress bar when running */}
      {isRunning && (
        <div className="h-0.5 w-full bg-muted overflow-hidden">
          <div className="h-full w-1/3 bg-primary animate-[slide_1.5s_ease-in-out_infinite] rounded-full" />
        </div>
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Crawler Control
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <ElapsedTimer startedAt={stats?.startedAt ?? null} />
            <span
              className={`inline-block h-2 w-2 rounded-full ${isRunning
                  ? 'bg-emerald-500 animate-pulse'
                  : isPaused
                    ? 'bg-amber-500'
                    : 'bg-muted-foreground'
                }`}
            />
            <span className="text-xs font-mono text-muted-foreground uppercase">
              {stats?.status || 'idle'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Location selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Target City
            </label>
            <select
              value={isHydrated ? settings.location : 'Amsterdam'}
              onChange={(e) => updateSettings({ location: e.target.value })}
              disabled={isRunning}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            >
              {DUTCH_CITIES.map((city) => (
                <option key={city.name} value={city.name}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          {/* Radius slider */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground font-medium">
              Search Radius: {isHydrated ? settings.radiusKm : 50}km
            </label>
            <input
              type="range"
              min={10}
              max={150}
              step={5}
              value={isHydrated ? settings.radiusKm : 50}
              onChange={(e) => updateSettings({ radiusKm: parseInt(e.target.value) })}
              disabled={isRunning}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>10km</span>
              <span>75km</span>
              <span>150km</span>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex gap-2">
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isPaused ? 'Resume' : 'Start Crawl'}
              </button>
            ) : showStopConfirm ? (
              <div className="flex-1 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Stop crawler?</span>
                <button
                  onClick={handleStop}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-1 rounded-md bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Yes
                </button>
                <button
                  onClick={() => setShowStopConfirm(false)}
                  className="flex items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-3 w-3" />
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowStopConfirm(true)}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Stop
              </button>
            )}
            <button
              onClick={handleReset}
              disabled={isLoading || isRunning}
              className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              title="Reset crawler state"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="my-4 border-t border-border" />

        {/* ============================================================ */}
        {/* AI Configuration Section (Collapsible)                       */}
        {/* ============================================================ */}
        <Collapsible open={aiConfigOpen} onOpenChange={setAiConfigOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                AI Configuration
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${aiConfigOpen ? 'rotate-180' : ''
                }`}
            />
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3">
            <div className="flex flex-col gap-3">
              {/* Additional Keywords */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-muted-foreground font-medium">
                  Additional Keywords
                </label>
                <input
                  type="text"
                  value={draftKeywords}
                  onChange={(e) => setDraftKeywords(e.target.value)}
                  placeholder="e.g., Remix, Astro, Three.js"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Comma-separated. Added to the default keyword list.
                </p>
              </div>

              {/* Exclusion Terms */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-muted-foreground font-medium">
                  Exclusion Terms
                </label>
                <input
                  type="text"
                  value={draftExclusions}
                  onChange={(e) => setDraftExclusions(e.target.value)}
                  placeholder="e.g., backend-only, data engineer"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Comma-separated. AI will deprioritize matches.
                </p>
              </div>

              {/* Seniority and Language in a row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-muted-foreground font-medium">
                    Seniority Level
                  </label>
                  <select
                    value={settings.seniorityFilter}
                    onChange={(e) => updateSettings({ seniorityFilter: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {['Any', 'Junior', 'Mid', 'Senior', 'Lead'].map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-muted-foreground font-medium">
                    Language
                  </label>
                  <select
                    value={settings.languagePreference}
                    onChange={(e) => updateSettings({ languagePreference: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {['Any', 'English', 'Dutch', 'Both'].map((lang) => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom System Prompt */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-muted-foreground font-medium">
                    Custom System Prompt
                  </label>
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                    {draftPrompt.length}/500
                  </span>
                </div>
                <textarea
                  value={draftPrompt}
                  onChange={(e) => setDraftPrompt(e.target.value.slice(0, 500))}
                  placeholder="Add extra instructions for the AI, e.g., 'Prioritize companies with 4-day work weeks' or 'Focus on fintech companies'..."
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono resize-none leading-relaxed"
                />
              </div>

              {/* Save button */}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveAiConfig}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <Check className="h-3 w-3" />
                  Save & Apply
                </button>
                <button
                  onClick={() => {
                    setDraftPrompt('')
                    setDraftKeywords('')
                    setDraftExclusions('')
                    updateSettings({
                      customSystemPrompt: '',
                      additionalKeywords: [],
                      exclusionTerms: [],
                      seniorityFilter: 'Any',
                      languagePreference: 'Any',
                    })
                    toast.info('AI configuration reset to defaults')
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <RotateCw className="h-3 w-3" />
                  Reset
                </button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Separator */}
        <div className="my-4 border-t border-border" />

        {/* ============================================================ */}
        {/* AI Diagnostics Section (Collapsible)                         */}
        {/* ============================================================ */}
        <Collapsible open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                AI Diagnostics
              </span>
              <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {settings.aiProvider === 'gemini-3-pro'
                  ? 'Gemini 2.5 Pro'
                  : settings.aiProvider === 'gemini-3-flash'
                    ? 'Gemini 2.5 Flash'
                    : 'Grok 3 Mini'}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${diagnosticsOpen ? 'rotate-180' : ''
                }`}
            />
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3">
            <div className="flex flex-col gap-3">
              <ProviderCard
                provider="gemini-3-pro"
                label="Gemini 2.5 Pro"
                modelName="gemini-2.5-pro-preview-05-06"
                subtitle="Recommended for high-quality analysis"
                isActive={settings.aiProvider === 'gemini-3-pro'}
                isGemini={true}
                onSelect={() => updateSettings({ aiProvider: 'gemini-3-pro' })}
              />
              <ProviderCard
                provider="gemini-3-flash"
                label="Gemini 2.5 Flash"
                modelName="gemini-2.5-flash-preview-04-17"
                subtitle="Default -- fast and cost-effective"
                isActive={settings.aiProvider === 'gemini-3-flash'}
                isGemini={true}
                onSelect={() => updateSettings({ aiProvider: 'gemini-3-flash' })}
              />
              <ProviderCard
                provider="grok"
                label="Grok (xAI)"
                modelName="grok-3-mini-fast"
                subtitle="Fallback provider"
                isActive={settings.aiProvider === 'grok'}
                isGemini={false}
                onSelect={() => updateSettings({ aiProvider: 'grok' })}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Click a card to set the active provider. Gemini providers use multi-key fallback with automatic rotation.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
