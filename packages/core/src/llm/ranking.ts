import { getOpenAIClient, getModel } from './index.js';
import { buildRankingPrompt } from './prompts.js';
import type { ArticleForRanking, ArticleTier, RankingBatchResponse } from './types.js';

const BATCH_SIZE = 15;

export async function rankArticlesBatch(
  articles: ArticleForRanking[],
  interests: string[]
): Promise<Map<string, { tier: ArticleTier; tierReason: string }>> {
  const client = getOpenAIClient();
  const model = getModel();
  const results = new Map<string, { tier: ArticleTier; tierReason: string }>();

  // Process in batches
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const { system, user } = buildRankingPrompt(batch, interests);

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed: RankingBatchResponse = JSON.parse(content);
        for (const ranking of parsed.rankings) {
          const tier = validateTier(ranking.tier);
          results.set(ranking.id, {
            tier,
            tierReason: ranking.tierReason,
          });
        }
      }
    } catch (error) {
      console.error('LLM ranking batch failed:', error);
      // Mark batch as 'notable' fallback
      for (const article of batch) {
        results.set(article.id, {
          tier: 'notable',
          tierReason: 'Fallback: LLM ranking failed',
        });
      }
    }
  }

  return results;
}

function validateTier(tier: string): ArticleTier {
  const normalized = tier.toLowerCase().trim();
  if (normalized === 'critical' || normalized === 'notable' || normalized === 'related') {
    return normalized;
  }
  return 'notable'; // Default to notable if invalid
}

export function applyFallbackRanking(
  articles: ArticleForRanking[]
): Map<string, { tier: ArticleTier; tierReason: string }> {
  const results = new Map<string, { tier: ArticleTier; tierReason: string }>();

  if (articles.length === 0) {
    return results;
  }

  // Sort by: manual saves first, then by matched topics count
  const sorted = [...articles].sort((a, b) => {
    if (a.isManualSave !== b.isManualSave) {
      return a.isManualSave ? -1 : 1;
    }
    return (b.matchedTopics?.length || 0) - (a.matchedTopics?.length || 0);
  });

  // Top 20% critical, next 30% notable, rest related
  const criticalCount = Math.max(1, Math.floor(sorted.length * 0.2));
  const notableCount = Math.max(2, Math.floor(sorted.length * 0.3));

  sorted.forEach((article, index) => {
    let tier: ArticleTier;
    if (index < criticalCount) {
      tier = 'critical';
    } else if (index < criticalCount + notableCount) {
      tier = 'notable';
    } else {
      tier = 'related';
    }
    results.set(article.id, {
      tier,
      tierReason: 'Keyword-based fallback ranking',
    });
  });

  return results;
}
