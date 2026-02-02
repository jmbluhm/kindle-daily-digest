// Database
export { getDb, disconnectDb, PrismaClient } from './db/index.js';
export type { Article, Tag, User, DigestRun, ArticleStatus, DigestStatus } from './db/index.js';

// Extraction
export {
  extractArticle,
  canonicalizeUrl,
  computeContentHash,
} from './extraction/index.js';
export type { ExtractedArticle } from './extraction/index.js';

// RSS
export { fetchFeed, fetchMultipleFeeds, parseRssFeeds } from './rss/index.js';
export type { FeedItem } from './rss/index.js';

// Interests
export {
  parseDigestInterests,
  getAllFeedsFromInterests,
  scoreFeedItem,
  scoreKeyword,
  scoreAndRankFeedItems,
  selectDiverseItems,
  DigestInterestsSchema,
  InterestTopicSchema,
} from './interests/index.js';
export type { DigestInterests, InterestTopic, ScoredFeedItem } from './interests/index.js';

// EPUB
export {
  generateEpub,
  generateDigestFilename,
  generateSummaryEpub,
  generateFullArticlesEpub,
  generateSummaryFilename,
  generateFullArticlesFilename,
} from './epub/index.js';
export type { EpubArticle, EpubOptions, SummaryEpubOptions, FullArticlesEpubOptions } from './epub/index.js';

// Email
export {
  sendEmail,
  sendDigestToKindle,
  sendTieredDigestToKindle,
  parseKindleEmails,
} from './email/index.js';
export type {
  EmailAttachment,
  SendEmailOptions,
  SendEmailResult,
  DigestAttachments,
  DigestStats,
} from './email/index.js';

// LLM
export {
  getOpenAIClient,
  getModel,
  isLLMEnabled,
  rankArticlesBatch,
  applyFallbackRanking,
  generateSummary,
  generateSummariesBatch,
  generateFallbackSummaries,
  buildRankingPrompt,
  buildSummaryPrompt,
} from './llm/index.js';
export type {
  ArticleTier,
  ArticleForRanking,
  RankedArticle,
  RankingBatchResponse,
  SummaryResponse,
  TieredDigestArticle,
  ExtractedContent,
} from './llm/index.js';
