export type ArticleTier = 'critical' | 'notable' | 'related';

export interface ArticleForRanking {
  id: string;
  title: string;
  source: string;
  pubDate: Date | null;
  excerpt: string;
  contentSnippet: string;
  url: string;
  isManualSave: boolean;
  matchedTopics?: string[];
}

export interface RankedArticle extends ArticleForRanking {
  tier: ArticleTier;
  tierReason: string;
  summary?: string;
  oneLiner?: string;
}

export interface RankingBatchResponse {
  rankings: Array<{
    id: string;
    tier: ArticleTier;
    tierReason: string;
  }>;
}

export interface SummaryResponse {
  summary: string;
  oneLiner?: string;
}

export interface TieredDigestArticle {
  id: string;
  title: string;
  author: string | null;
  siteName: string | null;
  url: string;
  tier: ArticleTier;
  summary: string;
  oneLiner?: string;
  contentHtml?: string;
  readingMinutes?: number;
}

export interface ExtractedContent {
  html: string;
  text: string;
  readingMinutes: number;
  author?: string | null;
}
