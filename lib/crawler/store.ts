// ============================================================
// In-memory store for crawler state: jobs, frontier, visited
// URLs, activity logs, and statistics. Uses a singleton pattern
// to share state between API routes and the crawler worker.
// ============================================================

import type {
  Job,
  CrawlLink,
  CrawlStats,
  CrawlConfig,
  CrawlerStatus,
  ActivityLogEntry,
  AiProvider,
} from './types'
import { DUTCH_CITIES, SEED_URLS } from './types'
import { findDutchCity } from './geo-filter'

// Priority queue implementation using a sorted array
class PriorityFrontier {
  private links: CrawlLink[] = []
  private urlSet: Set<string> = new Set()
  private maxSize: number

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize
  }

  enqueue(link: CrawlLink): boolean {
    const normalized = this.normalizeUrl(link.url)
    if (this.urlSet.has(normalized)) return false
    if (this.links.length >= this.maxSize) {
      // Evict lowest priority
      if (this.links.length > 0 && link.priority <= this.links[this.links.length - 1].priority) {
        return false
      }
      const evicted = this.links.pop()
      if (evicted) this.urlSet.delete(this.normalizeUrl(evicted.url))
    }
    this.urlSet.add(normalized)
    // Binary insertion to keep sorted (highest priority first)
    let lo = 0
    let hi = this.links.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.links[mid].priority > link.priority) lo = mid + 1
      else hi = mid
    }
    this.links.splice(lo, 0, link)
    return true
  }

  dequeue(): CrawlLink | null {
    const link = this.links.shift() || null
    if (link) this.urlSet.delete(this.normalizeUrl(link.url))
    return link
  }

  peek(): CrawlLink | null {
    return this.links[0] || null
  }

  size(): number {
    return this.links.length
  }

  has(url: string): boolean {
    return this.urlSet.has(this.normalizeUrl(url))
  }

  clear(): void {
    this.links = []
    this.urlSet.clear()
  }

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url)
      // Remove trailing slash, fragment, common tracking params
      u.hash = ''
      u.searchParams.delete('utm_source')
      u.searchParams.delete('utm_medium')
      u.searchParams.delete('utm_campaign')
      u.searchParams.delete('ref')
      u.searchParams.delete('source')
      let path = u.pathname.replace(/\/+$/, '') || '/'
      u.pathname = path
      return u.toString().toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  }
}

// ============================================================
// Singleton CrawlStore
// ============================================================

class CrawlStore {
  // Job storage (keyed by ID for dedup)
  jobs: Map<string, Job> = new Map()

  // Frontier: priority queue of links to visit
  frontier: PriorityFrontier = new PriorityFrontier(10000)

  // Visited URLs (normalized)
  visitedUrls: Set<string> = new Set()

  // Per-domain visit counters (for politeness limits)
  domainVisitCounts: Map<string, number> = new Map()

  // Crawl configuration
  config: CrawlConfig = {
    location: 'Amsterdam',
    latitude: 52.3676,
    longitude: 4.9041,
    radiusKm: 50,
    maxDepth: 5,
    maxPagesPerDomain: 50,
    maxFrontierSize: 10000,
    delayBetweenRequests: 3000,
    requestTimeout: 12000,
    userAgent: 'FrontEndJobCrawler/1.0 (Educational Research Bot)',
    aiProvider: 'gemini-3-flash' as AiProvider,
    customSystemPrompt: '',
    additionalKeywords: [],
    exclusionTerms: [],
    seniorityFilter: 'Any',
    languagePreference: 'Any',
  }

  // Runtime state
  status: CrawlerStatus = 'idle'
  startedAt: number | null = null
  lastActivityAt: number | null = null
  currentUrl: string | null = null
  pagesProcessed: number = 0
  errorsCount: number = 0

  // Activity log (ring buffer, max 200 entries)
  activityLog: ActivityLogEntry[] = []
  private maxLogEntries = 200
  private logCounter = 0

  // Stats tracking
  private processedTimestamps: number[] = []

  // ==========================================================
  // Configuration
  // ==========================================================

  setLocation(locationName: string, radiusKm: number = 50): boolean {
    const city = findDutchCity(locationName)
    if (!city) {
      // Try to find partial match
      const lower = locationName.toLowerCase()
      const found = DUTCH_CITIES.find(
        (c) =>
          c.name.toLowerCase().startsWith(lower) ||
          lower.startsWith(c.name.toLowerCase())
      )
      if (!found) return false
      this.config.location = found.name
      this.config.latitude = found.latitude
      this.config.longitude = found.longitude
    } else {
      this.config.location = city.name
      this.config.latitude = city.latitude
      this.config.longitude = city.longitude
    }
    this.config.radiusKm = radiusKm
    return true
  }

  // ==========================================================
  // Job Management
  // ==========================================================

  addJob(job: Job): boolean {
    if (this.jobs.has(job.id)) return false
    // Check for near-duplicate (same title + company)
    for (const existing of this.jobs.values()) {
      if (
        existing.title.toLowerCase() === job.title.toLowerCase() &&
        existing.company.toLowerCase() === job.company.toLowerCase()
      ) {
        // Keep the one with higher confidence
        if (job.confidence > existing.confidence) {
          this.jobs.set(existing.id, job)
          return true
        }
        return false
      }
    }
    this.jobs.set(job.id, job)
    return true
  }

  getJobs(filters?: {
    skills?: string[]
    minConfidence?: number
    maxDistance?: number
    remoteOnly?: boolean
    search?: string
  }): Job[] {
    let jobs = Array.from(this.jobs.values())

    if (filters) {
      if (filters.skills && filters.skills.length > 0) {
        const skillsLower = filters.skills.map((s) => s.toLowerCase())
        jobs = jobs.filter((j) =>
          j.skills.some((s) => skillsLower.includes(s.toLowerCase()))
        )
      }
      if (filters.minConfidence !== undefined) {
        jobs = jobs.filter((j) => j.confidence >= filters.minConfidence!)
      }
      if (filters.maxDistance !== undefined) {
        jobs = jobs.filter(
          (j) =>
            j.distanceFromCity !== null && j.distanceFromCity <= filters.maxDistance!
        )
      }
      if (filters.remoteOnly) {
        jobs = jobs.filter((j) => j.isRemote)
      }
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        jobs = jobs.filter(
          (j) =>
            j.title.toLowerCase().includes(searchLower) ||
            j.company.toLowerCase().includes(searchLower) ||
            j.description.toLowerCase().includes(searchLower) ||
            j.location.toLowerCase().includes(searchLower)
        )
      }
    }

    // Sort by confidence descending, then by extraction time
    jobs.sort((a, b) => b.confidence - a.confidence || b.extractedAt - a.extractedAt)
    return jobs
  }

  // ==========================================================
  // Frontier Management
  // ==========================================================

  addToFrontier(link: CrawlLink): boolean {
    // Don't add if already visited
    if (this.visitedUrls.has(this.normalizeUrl(link.url))) return false
    // Don't add if too deep
    if (link.depth > this.config.maxDepth) return false
    return this.frontier.enqueue(link)
  }

  getNextLink(): CrawlLink | null {
    return this.frontier.dequeue()
  }

  markVisited(url: string): void {
    this.visitedUrls.add(this.normalizeUrl(url))
    const domain = this.extractDomain(url)
    this.domainVisitCounts.set(
      domain,
      (this.domainVisitCounts.get(domain) || 0) + 1
    )
    this.pagesProcessed++
    this.lastActivityAt = Date.now()
    this.processedTimestamps.push(Date.now())
    // Keep only last 5 minutes of timestamps for rate calc
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    this.processedTimestamps = this.processedTimestamps.filter((t) => t > fiveMinAgo)
  }

  canVisitDomain(url: string): boolean {
    const domain = this.extractDomain(url)
    const count = this.domainVisitCounts.get(domain) || 0
    return count < this.config.maxPagesPerDomain
  }

  isVisited(url: string): boolean {
    return this.visitedUrls.has(this.normalizeUrl(url))
  }

  // ==========================================================
  // Seed the frontier with initial URLs
  // ==========================================================

  seedFrontier(): void {
    for (const url of SEED_URLS) {
      this.addToFrontier({
        url,
        depth: 0,
        priority: 50, // Medium initial priority
        anchorText: 'Seed URL',
        context: 'Initial seed URL for front-end job discovery',
        parentUrl: '',
        discoveredAt: Date.now(),
      })
    }
  }

  // ==========================================================
  // Activity Logging
  // ==========================================================

  log(
    type: ActivityLogEntry['type'],
    message: string,
    url?: string,
    details?: string
  ): void {
    this.logCounter++
    const entry: ActivityLogEntry = {
      id: `log-${this.logCounter}`,
      timestamp: Date.now(),
      type,
      message,
      url,
      details,
    }
    this.activityLog.unshift(entry) // prepend for reverse chronological
    if (this.activityLog.length > this.maxLogEntries) {
      this.activityLog.pop()
    }
  }

  getRecentLogs(limit: number = 50): ActivityLogEntry[] {
    return this.activityLog.slice(0, limit)
  }

  // ==========================================================
  // Statistics
  // ==========================================================

  getStats(): CrawlStats {
    let totalConfidence = 0
    this.jobs.forEach((j) => (totalConfidence += j.confidence))
    const jobCount = this.jobs.size

    // Pages per minute (over last 5 minutes)
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    const recentPages = this.processedTimestamps.filter((t) => t > fiveMinAgo).length
    const minuteSpan = Math.max(
      1,
      (Date.now() - (this.processedTimestamps[0] || Date.now())) / 60000
    )

    return {
      status: this.status,
      pagesProcessed: this.pagesProcessed,
      jobsFound: jobCount,
      linksInFrontier: this.frontier.size(),
      linksVisited: this.visitedUrls.size,
      domainsVisited: this.domainVisitCounts.size,
      averageConfidence: jobCount > 0 ? totalConfidence / jobCount : 0,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      currentUrl: this.currentUrl,
      errorsCount: this.errorsCount,
      pagesPerMinute:
        this.processedTimestamps.length > 1
          ? Math.round(recentPages / Math.min(5, minuteSpan))
          : 0,
    }
  }

  // ==========================================================
  // Analytics helpers
  // ==========================================================

  getTopSkills(limit: number = 10): Array<{ skill: string; count: number }> {
    const counts: Map<string, number> = new Map()
    this.jobs.forEach((j) => {
      j.skills.forEach((s) => {
        counts.set(s, (counts.get(s) || 0) + 1)
      })
    })
    return Array.from(counts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  getTopCompanies(limit: number = 10): Array<{ company: string; count: number }> {
    const counts: Map<string, number> = new Map()
    this.jobs.forEach((j) => {
      counts.set(j.company, (counts.get(j.company) || 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  getTopLocations(limit: number = 10): Array<{ location: string; count: number }> {
    const counts: Map<string, number> = new Map()
    this.jobs.forEach((j) => {
      counts.set(j.location, (counts.get(j.location) || 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  // ==========================================================
  // Reset
  // ==========================================================

  reset(): void {
    this.jobs.clear()
    this.frontier.clear()
    this.visitedUrls.clear()
    this.domainVisitCounts.clear()
    this.activityLog = []
    this.status = 'idle'
    this.startedAt = null
    this.lastActivityAt = null
    this.currentUrl = null
    this.pagesProcessed = 0
    this.errorsCount = 0
    this.processedTimestamps = []
    this.logCounter = 0
  }

  // ==========================================================
  // Private helpers
  // ==========================================================

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url)
      u.hash = ''
      u.searchParams.delete('utm_source')
      u.searchParams.delete('utm_medium')
      u.searchParams.delete('utm_campaign')
      u.searchParams.delete('ref')
      u.searchParams.delete('source')
      u.pathname = u.pathname.replace(/\/+$/, '') || '/'
      return u.toString().toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }
}

// Singleton instance
let storeInstance: CrawlStore | null = null

export function getCrawlStore(): CrawlStore {
  if (!storeInstance) {
    storeInstance = new CrawlStore()
  }
  return storeInstance
}
