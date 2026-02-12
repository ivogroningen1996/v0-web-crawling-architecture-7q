'use client'

import { useCrawlStatus } from '@/hooks/use-crawler-data'
import {
  Globe,
  FileSearch,
  Brain,
  Filter,
  MapPin,
  Database,
  ArrowRight,
  Zap,
} from 'lucide-react'

const stages = [
  {
    icon: Globe,
    label: 'Frontier',
    description: 'Priority queue of URLs to crawl, sorted by relevance score',
    detail: 'frontier',
  },
  {
    icon: FileSearch,
    label: 'Fetch & Parse',
    description: 'HTTP fetch with retry, HTML parsing, link extraction, JSON-LD',
    detail: 'fetch',
  },
  {
    icon: Brain,
    label: 'AI Analysis',
    description: 'Gemini 2.5 with multi-key fallback classifies and extracts',
    detail: 'ai',
  },
  {
    icon: Filter,
    label: 'Keyword Filter',
    description: 'Multi-tier scoring: React, JS, CSS, Vue, Angular, TypeScript',
    detail: 'keyword',
  },
  {
    icon: MapPin,
    label: 'Geo Filter',
    description: 'Haversine distance, Dutch city detection, postal code mapping',
    detail: 'geo',
  },
  {
    icon: Database,
    label: 'Store',
    description: 'Deduplicated job store with confidence scoring',
    detail: 'store',
  },
]

export function ArchitectureDiagram() {
  const { data } = useCrawlStatus()
  const isRunning = data?.stats?.status === 'running'

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Crawl Pipeline
        </h2>
        {isRunning && (
          <span className="text-[10px] font-mono text-emerald-400 animate-pulse ml-auto">
            LIVE
          </span>
        )}
      </div>

      {/* Pipeline visualization */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-1 flex-shrink-0">
            <div
              className={`flex flex-col items-center gap-1.5 rounded-md border p-3 min-w-[100px] transition-all ${
                isRunning
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted/20'
              }`}
            >
              <stage.icon
                className={`h-4 w-4 ${isRunning ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider text-center">
                {stage.label}
              </span>
              <span className="text-[9px] text-muted-foreground text-center leading-tight max-w-[90px]">
                {stage.description}
              </span>
            </div>
            {i < stages.length - 1 && (
              <ArrowRight
                className={`h-3.5 w-3.5 flex-shrink-0 ${
                  isRunning ? 'text-primary animate-pulse' : 'text-muted-foreground/50'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Feedback loop indicator */}
      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono uppercase tracking-wider">
          Discovered links feed back into the frontier (agentic loop)
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}
