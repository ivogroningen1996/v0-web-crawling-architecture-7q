import { getCrawlStore } from '@/lib/crawler/store'
import { getGeminiKeyManager } from '@/lib/crawler/gemini-provider'

export const dynamic = 'force-dynamic'

export async function GET() {
  const store = getCrawlStore()
  const stats = store.getStats()
  const recentLogs = store.getRecentLogs(50)
  const geminiManager = getGeminiKeyManager()

  return Response.json({
    stats,
    logs: recentLogs,
    config: {
      location: store.config.location,
      radiusKm: store.config.radiusKm,
      maxDepth: store.config.maxDepth,
      delayBetweenRequests: store.config.delayBetweenRequests,
      aiProvider: store.config.aiProvider,
      additionalKeywords: store.config.additionalKeywords,
      exclusionTerms: store.config.exclusionTerms,
      seniorityFilter: store.config.seniorityFilter,
      languagePreference: store.config.languagePreference,
      customSystemPrompt: store.config.customSystemPrompt,
    },
    keyHealth: geminiManager.getHealthStatus(),
  })
}
