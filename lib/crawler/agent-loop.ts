// ============================================================
// AI Agent Loop: The brain of the autonomous crawler.
// Uses Groq (free tier via AI SDK) to make intelligent decisions
// about page classification, job extraction, and link evaluation.
// Operates as a continuous loop with configurable pacing.
// ============================================================

import { generateText, Output } from 'ai'
import { createXai } from '@ai-sdk/xai'
import { z } from 'zod'
import { getCrawlStore } from './store'
import { getGeminiKeyManager } from './gemini-provider'

const xai = createXai({ apiKey: process.env.XAI_API_KEY })
import { parseHTML } from './extractor'
import { scoreKeywordRelevance, scoreLinkRelevance } from './keyword-filter'
import {
  extractLocationsFromText,
  isWithinRadius,
  isDutchDomain,
} from './geo-filter'
import type { Job, CrawlLink, ExtractedJob } from './types'

// ============================================================
// AI-powered page analysis
// ============================================================

const jobExtractionSchema = z.object({
  isJobRelated: z.boolean().describe('Whether this page contains or links to job postings'),
  isJobListingPage: z.boolean().describe('Whether this page lists multiple job openings'),
  isSingleJobPage: z.boolean().describe('Whether this page describes a single specific job'),
  isCareerPage: z.boolean().describe('Whether this is a company careers/about page'),
  jobs: z
    .array(
      z.object({
        title: z.string().describe('Job title'),
        company: z.string().describe('Company name'),
        location: z.string().describe('Job location (city, country)'),
        description: z.string().describe('Brief job description (max 500 chars)'),
        skills: z.array(z.string()).describe('Required/preferred technical skills'),
        salaryRange: z.string().nullable().describe('Salary range if mentioned'),
        isRemote: z.boolean().describe('Whether the job allows remote work'),
        applicationUrl: z.string().nullable().describe('Direct application link if found'),
        postedDate: z.string().nullable().describe('When the job was posted'),
        confidence: z.number().describe('Confidence score 0-1 that this is a real front-end job'),
      })
    )
    .describe('Extracted job postings from the page'),
  relevantLinks: z
    .array(
      z.object({
        url: z.string().describe('Link URL'),
        reason: z.string().describe('Why this link might lead to more front-end jobs'),
        relevanceScore: z.number().describe('Relevance score 0-100'),
      })
    )
    .describe('Links that likely lead to more front-end job listings'),
  detectedLocation: z.string().nullable().describe('Primary geographic location detected on this page'),
  summary: z.string().describe('Brief summary of what was found on this page'),
})

/**
 * Use AI to analyze a fetched page for job content and link opportunities.
 */
async function analyzePageWithAI(
  pageText: string,
  pageTitle: string,
  pageUrl: string,
  links: Array<{ url: string; anchorText: string; context: string }>
): Promise<z.infer<typeof jobExtractionSchema> | null> {
  const store = getCrawlStore()

  // Prepare a subset of links for the AI to evaluate (max 30 most promising)
  const scoredLinks = links
    .map((l) => ({
      ...l,
      score: scoreLinkRelevance(l.anchorText, l.context, l.url),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)

  const linksList = scoredLinks
    .map(
      (l, i) =>
        `${i + 1}. URL: ${l.url}\n   Text: ${l.anchorText}\n   Context: ${l.context.substring(0, 100)}`
    )
    .join('\n')

  // Build dynamic keyword list
  const baseKeywords = 'React, Vue, Angular, JavaScript, TypeScript, CSS, HTML, Svelte, Next.js, front-end, frontend, UI developer, web developer'
  const extraKeywords = store.config.additionalKeywords.length > 0
    ? `\nADDITIONAL KEYWORDS: ${store.config.additionalKeywords.join(', ')}`
    : ''
  const exclusions = store.config.exclusionTerms.length > 0
    ? `\nEXCLUDE/DEPRIORITIZE: ${store.config.exclusionTerms.join(', ')}`
    : ''
  const seniority = store.config.seniorityFilter !== 'Any'
    ? `\nSENIORITY FOCUS: ${store.config.seniorityFilter} level positions`
    : ''
  const language = store.config.languagePreference !== 'Any'
    ? `\nLANGUAGE PREFERENCE: ${store.config.languagePreference} language postings`
    : ''
  const customPromptSuffix = store.config.customSystemPrompt
    ? `\n\nADDITIONAL CONTEXT FROM USER:\n${store.config.customSystemPrompt}`
    : ''

  const prompt = `You are an expert web crawler agent specializing in finding front-end developer job opportunities in the Netherlands.

CURRENT TARGET: Front-end developer jobs within ${store.config.radiusKm}km of ${store.config.location}, Netherlands.

KEYWORDS TO LOOK FOR: ${baseKeywords}${extraKeywords}${exclusions}${seniority}${language}

Analyze this web page and extract:
1. Any front-end developer job postings found on this page
2. Links that likely lead to MORE front-end job listings (career pages, job boards, company hiring pages)

PAGE URL: ${pageUrl}
PAGE TITLE: ${pageTitle}

PAGE CONTENT (trimmed):
${pageText.substring(0, 5000)}

DISCOVERED LINKS ON THIS PAGE:
${linksList}

INSTRUCTIONS:
- Extract ALL front-end developer jobs visible on this page
- For each job, extract title, company, location, skills, salary if mentioned
- Rate your confidence 0-1 that each extraction is a real, relevant front-end job
- Identify the top 10 most promising links that could lead to more front-end jobs
- Focus on Dutch locations: Amsterdam, Rotterdam, Utrecht, Den Haag, Eindhoven, etc.
- Flag remote-friendly positions
- Return empty arrays if no relevant content found${customPromptSuffix}`

  try {
    const provider = store.config.aiProvider

    if (provider === 'grok') {
      // Use xAI Grok directly
      const model = xai('grok-3-mini-fast')
      const { output } = await generateText({
        model,
        output: Output.object({ schema: jobExtractionSchema }),
        prompt,
        maxOutputTokens: 4000,
        temperature: 0.1,
      })
      return output
    }

    // Gemini providers -- use multi-key fallback
    const geminiManager = getGeminiKeyManager()
    const modelId = provider === 'gemini-3-pro'
      ? 'gemini-2.5-pro-preview-05-06' as const
      : 'gemini-2.5-flash-preview-04-17' as const

    const { result, keyIndex } = await geminiManager.generateWithFallback({
      modelId,
      prompt,
      output: Output.object({ schema: jobExtractionSchema }),
      maxOutputTokens: 4000,
      temperature: 0.1,
    })

    store.log('info', `AI analysis completed using Gemini Key ${keyIndex + 1}`, pageUrl)
    return (result as { output: z.infer<typeof jobExtractionSchema> }).output
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    // Log specific error category for better UX
    if (message.includes('All Gemini keys exhausted')) {
      store.log('warning', `All Gemini keys exhausted -- skipping AI analysis for this page. Structured data and keyword filters still active.`, pageUrl)
    } else {
      store.log('error', `AI analysis failed (${store.config.aiProvider}): ${message}`, pageUrl)
    }
    return null
  }
}

// ============================================================
// Page fetching with retry logic
// ============================================================

async function fetchPage(url: string): Promise<{ html: string; statusCode: number } | null> {
  const store = getCrawlStore()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), store.config.requestTimeout)

    const response = await fetch(url, {
      headers: {
        'User-Agent': store.config.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8',
        'Accept-Encoding': 'identity',
      },
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(timeout)

    if (!response.ok) {
      if (response.status === 429) {
        store.log('warning', `Rate limited (429), will retry later`, url)
        // Re-queue with lower priority and delay
        return null
      }
      if (response.status >= 500) {
        store.log('warning', `Server error ${response.status}`, url)
        return null
      }
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null
    }

    const html = await response.text()
    return { html, statusCode: response.status }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      store.log('warning', `Request timed out`, url)
    } else {
      store.log('error', `Fetch error: ${error instanceof Error ? error.message : 'Unknown'}`, url)
    }
    return null
  }
}

// ============================================================
// Process a single page through the full pipeline
// ============================================================

async function processPage(link: CrawlLink): Promise<void> {
  const store = getCrawlStore()
  store.currentUrl = link.url

  store.log('crawl', `Crawling: ${link.url}`, link.url, `Depth: ${link.depth}, Priority: ${link.priority}`)

  // 1. Fetch the page
  const fetchResult = await fetchPage(link.url)
  if (!fetchResult) {
    store.errorsCount++
    store.markVisited(link.url)
    return
  }

  // 2. Parse the HTML
  const parsed = parseHTML(fetchResult.html, link.url)
  store.markVisited(link.url)

  // 3. Quick keyword pre-filter: skip entirely irrelevant pages
  const quickScore = scoreKeywordRelevance(
    `${parsed.title} ${parsed.bodyText.substring(0, 2000)}`,
    parsed.title
  )

  // 4. Check for structured data (JSON-LD) first - free extraction
  if (parsed.structuredJobs.length > 0) {
    store.log(
      'success',
      `Found ${parsed.structuredJobs.length} structured job(s) via JSON-LD`,
      link.url
    )
    for (const sjob of parsed.structuredJobs) {
      processExtractedJob(
        {
          title: sjob.title,
          company: sjob.company,
          location: sjob.location,
          description: sjob.description,
          skills: [],
          salaryRange: sjob.salary,
          applicationUrl: sjob.url,
          postedDate: sjob.datePosted,
          isRemote: false,
          confidence: 0.85, // Structured data is fairly reliable
        },
        link.url
      )
    }
  }

  // 5. Use AI for deeper analysis if page seems relevant or is a job/career page
  const isLikelyJobPage =
    quickScore.matchedPrimary.length > 0 ||
    /career|job|vacat|hiring|werken|baan|sollicit/i.test(parsed.title + ' ' + link.url)

  if (isLikelyJobPage) {
    const aiAnalysis = await analyzePageWithAI(
      parsed.bodyText,
      parsed.title,
      link.url,
      parsed.links
    )

    if (aiAnalysis) {
      // Process AI-extracted jobs
      if (aiAnalysis.jobs.length > 0) {
        store.log(
          'success',
          `AI extracted ${aiAnalysis.jobs.length} job(s)`,
          link.url,
          aiAnalysis.summary
        )
      }

      for (const job of aiAnalysis.jobs) {
        if (job.confidence >= 0.4) {
          processExtractedJob(job, link.url)
        }
      }

      // Add AI-suggested links to frontier
      if (aiAnalysis.relevantLinks) {
        for (const aiLink of aiAnalysis.relevantLinks) {
          if (aiLink.relevanceScore >= 30) {
            const resolvedUrl = resolveUrlSafe(aiLink.url, link.url)
            if (resolvedUrl) {
              store.addToFrontier({
                url: resolvedUrl,
                depth: link.depth + 1,
                priority: Math.min(100, aiLink.relevanceScore + (isDutchDomain(resolvedUrl) ? 10 : 0)),
                anchorText: aiLink.reason,
                context: `AI-suggested: ${aiLink.reason}`,
                parentUrl: link.url,
                discoveredAt: Date.now(),
              })
            }
          }
        }
      }

      // Log analysis summary
      if (aiAnalysis.summary) {
        store.log('info', aiAnalysis.summary, link.url)
      }
    }
  }

  // 6. Always add promising links to frontier (even without AI)
  for (const pageLink of parsed.links) {
    const linkScore = scoreLinkRelevance(pageLink.anchorText, pageLink.context, pageLink.url)
    if (linkScore > 15) {
      store.addToFrontier({
        url: pageLink.url,
        depth: link.depth + 1,
        priority: Math.min(100, linkScore + (isDutchDomain(pageLink.url) ? 10 : 0)),
        anchorText: pageLink.anchorText,
        context: pageLink.context,
        parentUrl: link.url,
        discoveredAt: Date.now(),
      })
    }
  }
}

// ============================================================
// Process a single extracted job into the store
// ============================================================

function processExtractedJob(job: ExtractedJob, sourceUrl: string): void {
  const store = getCrawlStore()

  // Keyword relevance check
  const keywordScore = scoreKeywordRelevance(
    `${job.title} ${job.description} ${job.skills.join(' ')}`,
    job.title
  )

  if (!keywordScore.isRelevant && job.confidence < 0.7) {
    return // Not relevant enough
  }

  // Geographic check
  const textLocations = extractLocationsFromText(
    `${job.location} ${job.description}`
  )

  let distanceFromCity: number | null = null
  let isGeoRelevant = false

  if (textLocations.length > 0) {
    const geoCheck = isWithinRadius(
      store.config.latitude,
      store.config.longitude,
      store.config.radiusKm,
      textLocations
    )
    distanceFromCity = geoCheck.closestDistance === Infinity ? null : Math.round(geoCheck.closestDistance)
    isGeoRelevant = geoCheck.withinRadius
  }

  // Remote jobs are always relevant if keyword-matched
  if (job.isRemote) {
    isGeoRelevant = true
  }

  // If we have no location data, be lenient (might be relevant)
  if (textLocations.length === 0 && keywordScore.isRelevant) {
    isGeoRelevant = true
    distanceFromCity = null
  }

  if (!isGeoRelevant) return

  // Build the Job object
  const domain = extractDomain(sourceUrl)
  const id = hashJob(job.title, job.company, sourceUrl)

  const jobEntry: Job = {
    id,
    title: job.title,
    company: job.company,
    location: job.location || 'Unknown',
    skills: [...new Set([...job.skills, ...keywordScore.matchedPrimary])],
    url: job.applicationUrl || sourceUrl,
    sourceUrl,
    sourceDomain: domain,
    description: job.description.substring(0, 2000),
    salaryRange: job.salaryRange,
    extractedAt: Date.now(),
    confidence: Math.round(
      ((job.confidence + keywordScore.totalScore / 100) / 2) * 100
    ) / 100,
    latitude: textLocations[0]?.latitude || null,
    longitude: textLocations[0]?.longitude || null,
    distanceFromCity,
    isRemote: job.isRemote,
    applicationUrl: job.applicationUrl,
    postedDate: job.postedDate,
  }

  const added = store.addJob(jobEntry)
  if (added) {
    store.log(
      'success',
      `New job: "${job.title}" at ${job.company} (${job.location})`,
      sourceUrl,
      `Skills: ${jobEntry.skills.join(', ')} | Confidence: ${jobEntry.confidence}`
    )
  }
}

// ============================================================
// The main agentic crawl loop
// ============================================================

let crawlLoopPromise: Promise<void> | null = null
let shouldStop = false

export async function startCrawlLoop(): Promise<void> {
  const store = getCrawlStore()

  if (store.status === 'running') {
    store.log('warning', 'Crawler is already running')
    return
  }

  shouldStop = false
  store.status = 'running'
  store.startedAt = store.startedAt || Date.now()
  store.log('info', `Crawler started targeting ${store.config.location} (${store.config.radiusKm}km radius)`)

  // Seed the frontier if empty
  if (store.frontier.size() === 0) {
    store.seedFrontier()
    store.log('info', `Seeded frontier with ${store.frontier.size()} initial URLs`)
  } else {
    store.log('info', `Frontier already has ${store.frontier.size()} URLs`)
  }

  store.log('info', `Using AI provider: ${store.config.aiProvider}`)

  crawlLoopPromise = runLoop()
  await crawlLoopPromise
}

async function runLoop(): Promise<void> {
  const store = getCrawlStore()

  while (!shouldStop && store.status === 'running') {
    const nextLink = store.getNextLink()

    if (!nextLink) {
      store.log('info', 'Frontier exhausted. Crawler pausing.')
      store.status = 'paused'
      break
    }

    // Skip if already visited
    if (store.isVisited(nextLink.url)) continue

    // Check domain politeness limit
    if (!store.canVisitDomain(nextLink.url)) {
      store.log('info', `Domain limit reached, skipping`, nextLink.url)
      continue
    }

    try {
      await processPage(nextLink)
    } catch (error) {
      store.errorsCount++
      store.log(
        'error',
        `Unhandled error processing page: ${error instanceof Error ? error.message : 'Unknown'}`,
        nextLink.url
      )
    }

    // Rate limiting: wait between requests
    if (!shouldStop && store.status === 'running') {
      await sleep(store.config.delayBetweenRequests)
    }
  }

  if (shouldStop) {
    store.status = 'stopped'
    store.log('info', 'Crawler stopped by user')
  }
}

export function stopCrawlLoop(): void {
  shouldStop = true
  const store = getCrawlStore()
  store.status = 'stopped'
  store.currentUrl = null
  store.log('info', 'Stop signal sent to crawler')
}

export function pauseCrawlLoop(): void {
  shouldStop = true
  const store = getCrawlStore()
  store.status = 'paused'
  store.currentUrl = null
  store.log('info', 'Pause signal sent to crawler')
}

export function resetCrawler(): void {
  shouldStop = true
  const store = getCrawlStore()
  store.reset()
  store.log('info', 'Crawler state reset')
}

// ============================================================
// Helpers
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hashJob(title: string, company: string, url: string): string {
  const str = `${title.toLowerCase().trim()}|${company.toLowerCase().trim()}|${url}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return `job-${Math.abs(hash).toString(36)}`
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function resolveUrlSafe(href: string, base: string): string | null {
  try {
    const resolved = new URL(href, base).toString()
    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      return resolved
    }
    return null
  } catch {
    return null
  }
}
