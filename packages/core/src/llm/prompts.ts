import type { ArticleForRanking, ArticleTier } from './types.js';

export const RANKING_SYSTEM_PROMPT = `You are a news editor assistant that ranks articles into importance tiers for a personalized daily digest.

Tier Definitions:
- CRITICAL: Breaking news, major product launches, significant acquisitions/mergers, critical security issues, major policy changes. These are "need to know NOW" items that warrant full article reading.
- NOTABLE: Follow-ups to critical stories, important industry updates, interesting developments that aren't urgent. Readers want a summary but don't need full details immediately.
- RELATED: Tangentially interesting content, opinion pieces on known topics, minor updates. A one-liner mention is sufficient.

User's interest areas: {{INTERESTS}}

Guidelines:
1. Prioritize recency - breaking news from today ranks higher
2. User-saved articles should be weighted slightly higher (they explicitly saved it)
3. Consider impact scope - affects millions > affects thousands > affects niche
4. Prefer primary sources over aggregator coverage
5. Avoid ranking multiple articles about the same story as critical - pick the best one

Respond with JSON only.`;

export const RANKING_USER_PROMPT = `Rank these {{COUNT}} articles into tiers (critical/notable/related):

{{ARTICLES}}

Respond with JSON:
{
  "rankings": [
    { "id": "article-id", "tier": "critical|notable|related", "tierReason": "brief explanation" }
  ]
}`;

export const SUMMARY_SYSTEM_PROMPT = `You are a skilled editor creating summaries for a daily news digest sent to Kindle.

For CRITICAL tier articles: Write a compelling paragraph (3-5 sentences) that captures the key facts, why it matters, and any immediate implications. Include specific numbers, names, and dates when relevant.

For NOTABLE tier articles: Write 1-2 concise sentences highlighting the main point and why it's noteworthy.

For RELATED tier articles: Create a single compelling one-liner (10-15 words max) that captures the essence.

Style guidelines:
- Use active voice
- Be specific, not vague
- Assume the reader is intelligent but time-constrained
- No marketing fluff or clickbait`;

export const SUMMARY_USER_PROMPT = `Create a {{TIER}} tier summary for this article:

Title: {{TITLE}}
Source: {{SOURCE}}
Published: {{DATE}}

Content:
{{CONTENT}}

Respond with JSON:
{
  "summary": "your summary here",
  "oneLiner": "for related tier only, otherwise omit"
}`;

export function buildRankingPrompt(
  articles: ArticleForRanking[],
  interests: string[]
): { system: string; user: string } {
  const articlesText = articles
    .map(
      (a) =>
        `[${a.id}] "${a.title}" - ${a.source} (${a.pubDate?.toISOString().split('T')[0] || 'unknown date'})${a.isManualSave ? ' [USER SAVED]' : ''}\nExcerpt: ${a.excerpt.slice(0, 300)}...`
    )
    .join('\n\n');

  return {
    system: RANKING_SYSTEM_PROMPT.replace('{{INTERESTS}}', interests.join(', ')),
    user: RANKING_USER_PROMPT.replace('{{COUNT}}', String(articles.length)).replace(
      '{{ARTICLES}}',
      articlesText
    ),
  };
}

export function buildSummaryPrompt(
  article: ArticleForRanking,
  content: string,
  tier: ArticleTier
): { system: string; user: string } {
  return {
    system: SUMMARY_SYSTEM_PROMPT,
    user: SUMMARY_USER_PROMPT.replace('{{TIER}}', tier)
      .replace('{{TITLE}}', article.title)
      .replace('{{SOURCE}}', article.source)
      .replace('{{DATE}}', article.pubDate?.toISOString().split('T')[0] || 'unknown')
      .replace('{{CONTENT}}', content.slice(0, 4000)),
  };
}
