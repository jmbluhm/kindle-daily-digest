import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export function getModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

export function isLLMEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// Re-export types
export type {
  ArticleTier,
  ArticleForRanking,
  RankedArticle,
  RankingBatchResponse,
  SummaryResponse,
  TieredDigestArticle,
  ExtractedContent,
} from './types.js';

// Re-export ranking functions
export { rankArticlesBatch, applyFallbackRanking } from './ranking.js';

// Re-export summarization functions
export { generateSummary, generateSummariesBatch, generateFallbackSummaries } from './summarization.js';

// Re-export prompt utilities (for testing)
export { buildRankingPrompt, buildSummaryPrompt } from './prompts.js';
