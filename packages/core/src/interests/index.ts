import { z } from 'zod';
import type { FeedItem } from '../rss/index.js';

export const InterestTopicSchema = z.object({
  keywords: z.array(z.string()),
  feeds: z.array(z.string()).optional(),
});

export const DigestInterestsSchema = z.record(z.string(), InterestTopicSchema);

export type InterestTopic = z.infer<typeof InterestTopicSchema>;
export type DigestInterests = z.infer<typeof DigestInterestsSchema>;

export interface ScoredFeedItem extends FeedItem {
  score: number;
  matchedTopics: string[];
  matchedKeywords: string[];
  recencyScore: number;
}

export function parseDigestInterests(jsonString: string | undefined): DigestInterests {
  if (!jsonString) {
    return {};
  }

  try {
    const parsed = JSON.parse(jsonString);
    return DigestInterestsSchema.parse(parsed);
  } catch (error) {
    console.error('Failed to parse DIGEST_INTERESTS_JSON:', error);
    return {};
  }
}

export function getAllFeedsFromInterests(interests: DigestInterests): string[] {
  const feeds = new Set<string>();

  for (const topic of Object.values(interests)) {
    if (topic.feeds) {
      for (const feed of topic.feeds) {
        feeds.add(feed);
      }
    }
  }

  return Array.from(feeds);
}

function calculateRecencyScore(pubDate: Date | null): number {
  if (!pubDate) return 0;

  const now = Date.now();
  const ageMs = now - pubDate.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  // Items less than 6 hours old get max recency score
  // Score decays over 72 hours
  if (ageHours <= 6) return 100;
  if (ageHours >= 72) return 0;

  return Math.max(0, 100 - (ageHours - 6) * (100 / 66));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
}

export function scoreKeyword(keyword: string, text: string): number {
  const normalizedKeyword = normalizeText(keyword);
  const normalizedText = normalizeText(text);

  // Check for exact word boundary match
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(normalizedKeyword)}\\b`, 'gi');
  const matches = normalizedText.match(wordBoundaryRegex);

  if (!matches) return 0;

  // Score based on number of matches, with diminishing returns
  const matchCount = matches.length;
  return Math.min(10, matchCount * 2);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scoreFeedItem(
  item: FeedItem,
  interests: DigestInterests
): ScoredFeedItem {
  const textToSearch = [item.title, item.contentSnippet, item.content]
    .filter(Boolean)
    .join(' ');

  let totalScore = 0;
  const matchedTopics: string[] = [];
  const matchedKeywords: string[] = [];

  for (const [topicName, topic] of Object.entries(interests)) {
    let topicScore = 0;

    for (const keyword of topic.keywords) {
      const keywordScore = scoreKeyword(keyword, textToSearch);
      if (keywordScore > 0) {
        topicScore += keywordScore;
        if (!matchedKeywords.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      }
    }

    if (topicScore > 0) {
      matchedTopics.push(topicName);
      totalScore += topicScore;
    }
  }

  const recencyScore = calculateRecencyScore(item.pubDate);

  // Combined score: keyword relevance + recency boost
  // Recency contributes up to 20% of the final score
  const combinedScore = totalScore + recencyScore * 0.2;

  return {
    ...item,
    score: combinedScore,
    matchedTopics,
    matchedKeywords,
    recencyScore,
  };
}

export function scoreAndRankFeedItems(
  items: FeedItem[],
  interests: DigestInterests
): ScoredFeedItem[] {
  // Score all items
  const scoredItems = items.map((item) => scoreFeedItem(item, interests));

  // Filter out items with no keyword matches
  const relevantItems = scoredItems.filter((item) => item.matchedTopics.length > 0);

  // Sort by score descending
  relevantItems.sort((a, b) => b.score - a.score);

  return relevantItems;
}

export function selectDiverseItems(
  scoredItems: ScoredFeedItem[],
  maxItems: number,
  maxPerTopic: number = 3
): ScoredFeedItem[] {
  const selected: ScoredFeedItem[] = [];
  const topicCounts: Record<string, number> = {};

  for (const item of scoredItems) {
    if (selected.length >= maxItems) break;

    // Check if any matched topic has reached its limit
    const primaryTopic = item.matchedTopics[0];
    const currentCount = topicCounts[primaryTopic] || 0;

    if (currentCount < maxPerTopic) {
      selected.push(item);
      topicCounts[primaryTopic] = currentCount + 1;
    }
  }

  // If we haven't filled the quota, add more items ignoring topic limits
  if (selected.length < maxItems) {
    for (const item of scoredItems) {
      if (selected.length >= maxItems) break;
      if (!selected.includes(item)) {
        selected.push(item);
      }
    }
  }

  return selected;
}
