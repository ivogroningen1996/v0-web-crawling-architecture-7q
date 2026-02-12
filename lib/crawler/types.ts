// ============================================================
// Core type definitions for the autonomous web crawling system
// ============================================================

export interface Job {
  id: string
  title: string
  company: string
  location: string
  skills: string[]
  url: string
  sourceUrl: string
  sourceDomain: string
  description: string
  salaryRange: string | null
  extractedAt: number
  confidence: number
  latitude: number | null
  longitude: number | null
  distanceFromCity: number | null
  isRemote: boolean
  applicationUrl: string | null
  postedDate: string | null
}

export interface CrawlLink {
  url: string
  depth: number
  priority: number
  anchorText: string
  context: string
  parentUrl: string
  discoveredAt: number
}

export type CrawlerStatus = 'idle' | 'running' | 'paused' | 'stopped'

export interface CrawlStats {
  status: CrawlerStatus
  pagesProcessed: number
  jobsFound: number
  linksInFrontier: number
  linksVisited: number
  domainsVisited: number
  averageConfidence: number
  startedAt: number | null
  lastActivityAt: number | null
  currentUrl: string | null
  errorsCount: number
  pagesPerMinute: number
}

export type AiProvider = 'gemini-3-pro' | 'gemini-3-flash' | 'grok'

export interface CrawlConfig {
  location: string
  latitude: number
  longitude: number
  radiusKm: number
  maxDepth: number
  maxPagesPerDomain: number
  maxFrontierSize: number
  delayBetweenRequests: number
  requestTimeout: number
  userAgent: string
  // AI configuration
  aiProvider: AiProvider
  customSystemPrompt: string
  additionalKeywords: string[]
  exclusionTerms: string[]
  seniorityFilter: string
  languagePreference: string
}

export interface PageAnalysis {
  isJobPage: boolean
  isJobListPage: boolean
  isCareerPage: boolean
  relevanceScore: number
  extractedJobs: ExtractedJob[]
  discoveredLinks: DiscoveredLink[]
  detectedLocation: string | null
  summary: string
}

export interface ExtractedJob {
  title: string
  company: string
  location: string
  description: string
  skills: string[]
  salaryRange: string | null
  applicationUrl: string | null
  postedDate: string | null
  isRemote: boolean
  confidence: number
}

export interface DiscoveredLink {
  url: string
  anchorText: string
  context: string
  relevanceScore: number
  reason: string
}

export interface ActivityLogEntry {
  id: string
  timestamp: number
  type: 'info' | 'success' | 'warning' | 'error' | 'crawl'
  message: string
  url?: string
  details?: string
}

export interface DutchCity {
  name: string
  latitude: number
  longitude: number
  aliases: string[]
}

// Dutch city database with coordinates
export const DUTCH_CITIES: DutchCity[] = [
  { name: 'Amsterdam', latitude: 52.3676, longitude: 4.9041, aliases: ['adam', 'ams'] },
  { name: 'Rotterdam', latitude: 51.9244, longitude: 4.4777, aliases: ['rdam', 'rtm'] },
  { name: 'Den Haag', latitude: 52.0705, longitude: 4.3007, aliases: ['the hague', "'s-gravenhage", 'sgravenhage'] },
  { name: 'Utrecht', latitude: 52.0907, longitude: 5.1214, aliases: ['utr'] },
  { name: 'Eindhoven', latitude: 51.4416, longitude: 5.4697, aliases: ['ehv'] },
  { name: 'Groningen', latitude: 53.2194, longitude: 6.5665, aliases: ['grn'] },
  { name: 'Tilburg', latitude: 51.5555, longitude: 5.0913, aliases: [] },
  { name: 'Almere', latitude: 52.3508, longitude: 5.2647, aliases: [] },
  { name: 'Breda', latitude: 51.5719, longitude: 4.7683, aliases: [] },
  { name: 'Nijmegen', latitude: 51.8426, longitude: 5.8527, aliases: [] },
  { name: 'Arnhem', latitude: 51.9851, longitude: 5.8987, aliases: [] },
  { name: 'Haarlem', latitude: 52.3874, longitude: 4.6462, aliases: [] },
  { name: 'Enschede', latitude: 52.2215, longitude: 6.8937, aliases: [] },
  { name: 'Apeldoorn', latitude: 52.2112, longitude: 5.9699, aliases: [] },
  { name: 'Amersfoort', latitude: 52.1561, longitude: 5.3878, aliases: [] },
  { name: 'Delft', latitude: 52.0116, longitude: 4.3571, aliases: [] },
  { name: 'Leiden', latitude: 52.1601, longitude: 4.497, aliases: [] },
  { name: 'Dordrecht', latitude: 51.8133, longitude: 4.6901, aliases: [] },
  { name: 'Maastricht', latitude: 50.8514, longitude: 5.6909, aliases: [] },
  { name: 'Zwolle', latitude: 52.5168, longitude: 6.0830, aliases: [] },
]

// Seed URLs for starting the crawl - Dutch job ecosystem entry points
export const SEED_URLS: string[] = [
  // Dutch job boards and career sites
  'https://www.indeed.nl/Front-End-Developer-vacatures',
  'https://www.linkedin.com/jobs/search/?keywords=frontend+developer&location=Netherlands',
  'https://www.glassdoor.nl/Vacature/nederland-frontend-developer-vacatures-SRCH_IL.0,9_IN178_KO10,28.htm',
  'https://stackoverflow.com/jobs?l=Netherlands&d=50&u=Km',
  'https://www.werkenbijstartups.nl/',
  'https://frontendvacatures.nl/',
  // Tech community sites
  'https://www.techjobs.nl/',
  'https://remoteur.com/remote-front-end-jobs',
  'https://www.nationalevacaturebank.nl/vacature/zoeken?query=frontend+developer&location=',
  'https://www.randstad.nl/werkzoekende/vacatures/q-frontend-developer/',
  'https://www.ictergezocht.nl/vacatures/front-end-developer',
  // Tech company career pages
  'https://www.booking.com/careers.html',
  'https://careers.adyen.com/',
  'https://www.ing.jobs/Netherlands.htm',
  'https://www.coolblue.nl/werkenbij',
  'https://www.bol.com/nl/m/over-bol-com/werken-bij/',
  'https://careers.tomtom.com/',
  // Dutch freelance/contract platforms
  'https://www.freelancermap.nl/',
  'https://www.headfirst.nl/opdrachten/frontend-developer/',
  // General tech job aggregators
  'https://angel.co/location/amsterdam',
  'https://remoteok.com/remote-front-end-jobs',
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs',
  'https://www.honeypot.io/en/tech-hiring/netherlands/',
  'https://dutchstartupjobs.com/job_function/engineering/',
]
