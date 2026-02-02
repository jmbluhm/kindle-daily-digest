import { getOpenAIClient, getModel } from './index.js';
import { buildSummaryPrompt } from './prompts.js';
import type { ArticleForRanking, ArticleTier, SummaryResponse } from './types.js';

const CONCURRENCY = 5;

export async function generateSummary(
  article: ArticleForRanking,
  fullContent: string,
  tier: ArticleTier
): Promise<SummaryResponse> {
  const client = getOpenAIClient();
  const model = getModel();
  const { system, user } = buildSummaryPrompt(article, fullContent, tier);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: tier === 'critical' ? 500 : 200,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content) as SummaryResponse;
      return {
        summary: parsed.summary || article.excerpt.slice(0, 200) + '...',
        oneLiner: parsed.oneLiner,
      };
    }
  } catch (error) {
    console.error('Summary generation failed:', error);
  }

  // Fallback: use excerpt
  return {
    summary: article.excerpt.slice(0, tier === 'critical' ? 400 : 150) + '...',
    oneLiner: tier === 'related' ? article.title : undefined,
  };
}

export async function generateSummariesBatch(
  articles: Array<{ article: ArticleForRanking; fullContent: string; tier: ArticleTier }>
): Promise<Map<string, SummaryResponse>> {
  const results = new Map<string, SummaryResponse>();

  // Process in parallel with concurrency limit
  for (let i = 0; i < articles.length; i += CONCURRENCY) {
    const batch = articles.slice(i, i + CONCURRENCY);
    const promises = batch.map(async ({ article, fullContent, tier }) => {
      const summary = await generateSummary(article, fullContent, tier);
      return { id: article.id, summary };
    });

    const batchResults = await Promise.allSettled(promises);
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.set(result.value.id, result.value.summary);
      }
    }
  }

  return results;
}

export function generateFallbackSummaries(
  articles: Array<{ article: ArticleForRanking; tier: ArticleTier }>
): Map<string, SummaryResponse> {
  const results = new Map<string, SummaryResponse>();

  for (const { article, tier } of articles) {
    results.set(article.id, {
      summary: article.excerpt.slice(0, tier === 'critical' ? 400 : 150) + '...',
      oneLiner: article.title,
    });
  }

  return results;
}
