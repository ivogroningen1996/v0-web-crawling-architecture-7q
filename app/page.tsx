'use client'

import { useState } from 'react'
import { CrawlControlPanel } from '@/components/crawl-control-panel'
import { StatsCards } from '@/components/stats-cards'
import { ActivityFeed } from '@/components/activity-feed'
import { JobsTable } from '@/components/jobs-table'
import { AnalyticsPanel } from '@/components/analytics-panel'
import { ArchitectureDiagram } from '@/components/architecture-diagram'
import { useCrawlStatus } from '@/hooks/use-crawler-data'
import { Bot, LayoutDashboard, BarChart3, Layers } from 'lucide-react'

type Tab = 'dashboard' | 'jobs' | 'analytics' | 'architecture'

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs', label: 'Jobs', icon: Layers },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'architecture', label: 'Architecture', icon: Bot },
]

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const { data } = useCrawlStatus()
  const isRunning = data?.stats?.status === 'running'

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-[1440px] px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight">
                JobCrawler
              </h1>
              <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
                Autonomous Front-End Job Discovery
              </p>
            </div>
          </div>

          {/* Connection status badge */}
          <div className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isRunning
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-muted-foreground'
              }`}
            />
            <span className="text-[11px] font-mono text-muted-foreground uppercase">
              {data?.stats?.status || 'idle'}
            </span>
            {data?.config?.aiProvider && (
              <>
                <span className="text-muted-foreground/30">{'|'}</span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {data.config.aiProvider === 'gemini-3-pro'
                    ? 'Gemini Pro'
                    : data.config.aiProvider === 'gemini-3-flash'
                      ? 'Gemini Flash'
                      : 'Grok'}
                </span>
              </>
            )}
            {data?.config?.location && (
              <>
                <span className="text-muted-foreground/30">{'|'}</span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {data.config.location} ({data.config.radiusKm}km)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="mx-auto max-w-[1440px] px-4">
          <nav className="flex gap-1 -mb-px" role="tablist">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  aria-selected={isActive}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-[1440px] px-4 py-6">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'jobs' && <JobsView />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'architecture' && <ArchitectureView />}
      </main>
    </div>
  )
}

function DashboardView() {
  return (
    <div className="flex flex-col gap-6">
      <StatsCards />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 flex flex-col gap-6">
          <CrawlControlPanel />
          <ActivityFeed />
        </div>

        <div className="lg:col-span-8">
          <JobsTable />
        </div>
      </div>

      <ArchitectureDiagram />
    </div>
  )
}

function JobsView() {
  return (
    <div className="flex flex-col gap-6">
      <JobsTable />
    </div>
  )
}

function AnalyticsView() {
  return (
    <div className="flex flex-col gap-6">
      <StatsCards />
      <AnalyticsPanel />
    </div>
  )
}

function ArchitectureView() {
  return (
    <div className="flex flex-col gap-6">
      <ArchitectureDiagram />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ArchBlock
          title="1. Frontier & Prioritization"
          items={[
            'Priority queue ordered by relevance score (0-100)',
            'URL deduplication with normalized URL hashing',
            'Per-domain visit limits to prevent over-crawling',
            'Configurable max frontier size (default: 10,000 URLs)',
            'Depth tracking to prevent infinite crawl loops',
          ]}
        />
        <ArchBlock
          title="2. Fetch & Parse Layer"
          items={[
            'HTTP fetch with configurable timeout and retry logic',
            'User-Agent identification as research crawler',
            'Content-type filtering (HTML/XHTML only)',
            'Rate limiting with configurable delay between requests',
            'HTML cleaning: script/style/nav/footer removal',
            'JSON-LD structured data extraction (schema.org/JobPosting)',
          ]}
        />
        <ArchBlock
          title="3. AI Analysis Engine (Gemini)"
          items={[
            'Gemini 2.5 Pro/Flash via Google AI with multi-key fallback',
            'Multi-key rotation: GEMINI_KEY, KEY_TWO, KEY_THREE',
            'Automatic failover on rate limits (429) with 60s cooldown',
            'Page classification: job listing, career page, or irrelevant',
            'Structured job extraction: title, company, skills, salary',
            'Link evaluation: relevance scoring of discovered URLs',
            'Grok (xAI) available as alternative provider',
          ]}
        />
        <ArchBlock
          title="4. Keyword Filter"
          items={[
            'Primary keywords: React, JavaScript, TypeScript, Vue, Angular, etc.',
            'Secondary boosters: Tailwind, Next.js, testing, design systems',
            'Negative keywords: backend-only, DevOps, data engineering',
            'Positional weighting: title matches score 3x body matches',
            'Multi-tier scoring with minimum threshold for relevance',
          ]}
        />
        <ArchBlock
          title="5. Geographic Filter"
          items={[
            'Haversine distance calculation between coordinates',
            '20 Dutch cities with lat/lon in the city database',
            'Dutch postal code prefix mapping (65 zones)',
            'Text extraction: city names, postal codes, region mentions',
            'Configurable radius from 10km to 150km',
            'Remote jobs bypass geographic filter',
          ]}
        />
        <ArchBlock
          title="6. Agentic Loop"
          items={[
            'Continuous background crawling with stop/pause/resume',
            'New links feed back into the priority frontier',
            'AI decides which links are most promising to explore next',
            'Depth-first on high-priority branches, breadth on others',
            'Self-expanding: discovered career pages seed new searches',
            'Error recovery: timeouts and failures skip gracefully',
          ]}
        />
      </div>
    </div>
  )
}

function ArchBlock({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed"
          >
            <span className="inline-block h-1 w-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
