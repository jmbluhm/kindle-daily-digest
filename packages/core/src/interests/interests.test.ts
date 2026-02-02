import { describe, it, expect } from 'vitest';
import {
  parseDigestInterests,
  scoreKeyword,
  scoreFeedItem,
  scoreAndRankFeedItems,
  selectDiverseItems,
} from './index.js';
import type { FeedItem } from '../rss/index.js';

describe('parseDigestInterests', () => {
  it('parses valid JSON', () => {
    const json = JSON.stringify({
      tech: { keywords: ['apple', 'iphone'] },
      ai: { keywords: ['llm', 'gpt'], feeds: ['https://example.com/ai.rss'] },
    });

    const interests = parseDigestInterests(json);
    expect(interests).toEqual({
      tech: { keywords: ['apple', 'iphone'] },
      ai: { keywords: ['llm', 'gpt'], feeds: ['https://example.com/ai.rss'] },
    });
  });

  it('returns empty object for undefined', () => {
    const interests = parseDigestInterests(undefined);
    expect(interests).toEqual({});
  });

  it('returns empty object for invalid JSON', () => {
    const interests = parseDigestInterests('not valid json');
    expect(interests).toEqual({});
  });

  it('returns empty object for invalid schema', () => {
    const json = JSON.stringify({ tech: 'not an object' });
    const interests = parseDigestInterests(json);
    expect(interests).toEqual({});
  });
});

describe('scoreKeyword', () => {
  it('returns 0 for no match', () => {
    const score = scoreKeyword('apple', 'This article is about oranges');
    expect(score).toBe(0);
  });

  it('scores single match', () => {
    const score = scoreKeyword('apple', 'Apple announces new iPhone');
    expect(score).toBe(2);
  });

  it('scores multiple matches with diminishing returns', () => {
    const score = scoreKeyword('apple', 'Apple Apple Apple Apple Apple Apple');
    expect(score).toBe(10); // Capped at 10
  });

  it('matches word boundaries', () => {
    const score = scoreKeyword('ai', 'AI tools are here to stay');
    expect(score).toBe(2);
  });

  it('does not match partial words incorrectly', () => {
    // 'ai' should not match 'train' in the middle
    const score = scoreKeyword('ai', 'training data');
    expect(score).toBe(0);
  });

  it('is case insensitive', () => {
    const score1 = scoreKeyword('Apple', 'APPLE IPHONE');
    const score2 = scoreKeyword('APPLE', 'apple iphone');
    expect(score1).toBeGreaterThan(0);
    expect(score2).toBeGreaterThan(0);
  });

  it('handles multi-word keywords', () => {
    const score = scoreKeyword('model context protocol', 'The model context protocol is new');
    expect(score).toBe(2);
  });
});

describe('scoreFeedItem', () => {
  const baseFeedItem: FeedItem = {
    title: 'Test Article',
    link: 'https://example.com/article',
    pubDate: new Date(),
    content: '',
    contentSnippet: '',
    author: null,
    feedTitle: 'Test Feed',
    feedUrl: 'https://example.com/feed.rss',
  };

  it('scores based on keyword matches in title', () => {
    const item: FeedItem = {
      ...baseFeedItem,
      title: 'Apple announces new iPhone 16',
    };

    const interests = {
      apple_products: { keywords: ['apple', 'iphone'] },
    };

    const scored = scoreFeedItem(item, interests);
    expect(scored.matchedTopics).toContain('apple_products');
    expect(scored.matchedKeywords).toContain('apple');
    expect(scored.matchedKeywords).toContain('iphone');
    expect(scored.score).toBeGreaterThan(0);
  });

  it('scores based on content snippet', () => {
    const item: FeedItem = {
      ...baseFeedItem,
      title: 'Breaking news',
      contentSnippet: 'OpenAI releases GPT-5 with reasoning capabilities',
    };

    const interests = {
      ai: { keywords: ['openai', 'gpt', 'reasoning'] },
    };

    const scored = scoreFeedItem(item, interests);
    expect(scored.matchedTopics).toContain('ai');
    expect(scored.score).toBeGreaterThan(0);
  });

  it('includes recency score for recent items', () => {
    const recentItem: FeedItem = {
      ...baseFeedItem,
      title: 'Apple news',
      pubDate: new Date(), // Now
    };

    const oldItem: FeedItem = {
      ...baseFeedItem,
      title: 'Apple news',
      pubDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    };

    const interests = { tech: { keywords: ['apple'] } };

    const recentScored = scoreFeedItem(recentItem, interests);
    const oldScored = scoreFeedItem(oldItem, interests);

    expect(recentScored.recencyScore).toBeGreaterThan(oldScored.recencyScore);
  });

  it('matches multiple topics', () => {
    const item: FeedItem = {
      ...baseFeedItem,
      title: 'Apple uses AI for new iPhone features',
    };

    const interests = {
      apple: { keywords: ['apple', 'iphone'] },
      ai: { keywords: ['ai', 'machine learning'] },
    };

    const scored = scoreFeedItem(item, interests);
    expect(scored.matchedTopics).toContain('apple');
    expect(scored.matchedTopics).toContain('ai');
  });
});

describe('scoreAndRankFeedItems', () => {
  const createItem = (title: string, pubDate: Date = new Date()): FeedItem => ({
    title,
    link: `https://example.com/${title.toLowerCase().replace(/\s/g, '-')}`,
    pubDate,
    content: '',
    contentSnippet: '',
    author: null,
    feedTitle: 'Test Feed',
    feedUrl: 'https://example.com/feed.rss',
  });

  it('filters out items with no keyword matches', () => {
    const items = [
      createItem('Apple iPhone announcement'),
      createItem('Weather forecast for today'),
      createItem('Sports scores'),
    ];

    const interests = {
      tech: { keywords: ['apple', 'iphone'] },
    };

    const ranked = scoreAndRankFeedItems(items, interests);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].title).toBe('Apple iPhone announcement');
  });

  it('sorts by score descending', () => {
    const items = [
      createItem('Tech news'),
      createItem('Apple iPhone Apple iPad Apple Watch'),
      createItem('Apple'),
    ];

    const interests = {
      apple: { keywords: ['apple', 'iphone', 'ipad', 'watch'] },
    };

    const ranked = scoreAndRankFeedItems(items, interests);
    expect(ranked[0].title).toBe('Apple iPhone Apple iPad Apple Watch');
  });
});

describe('selectDiverseItems', () => {
  const createScoredItem = (
    title: string,
    score: number,
    topic: string
  ) => ({
    title,
    link: `https://example.com/${title}`,
    pubDate: new Date(),
    content: '',
    contentSnippet: '',
    author: null,
    feedTitle: 'Test',
    feedUrl: 'https://example.com/feed.rss',
    score,
    matchedTopics: [topic],
    matchedKeywords: [],
    recencyScore: 50,
  });

  it('limits items from same topic in first pass, then fills remaining', () => {
    const items = [
      createScoredItem('Apple 1', 100, 'tech'),
      createScoredItem('Apple 2', 90, 'tech'),
      createScoredItem('Apple 3', 80, 'tech'),
      createScoredItem('Apple 4', 70, 'tech'),
      createScoredItem('AI 1', 60, 'ai'),
      createScoredItem('AI 2', 50, 'ai'),
    ];

    // With maxItems=5 and maxPerTopic=2:
    // First pass: 2 tech + 2 AI = 4 items
    // Second pass: fills with 1 more tech to reach maxItems=5
    const selected = selectDiverseItems(items, 5, 2);

    expect(selected).toHaveLength(5);
    // First pass respects limits, second pass fills remaining
    expect(selected[0].title).toBe('Apple 1');
    expect(selected[1].title).toBe('Apple 2');
    expect(selected[2].title).toBe('AI 1');
    expect(selected[3].title).toBe('AI 2');
    expect(selected[4].title).toBe('Apple 3'); // Filled in second pass
  });

  it('respects maxItems limit', () => {
    const items = [
      createScoredItem('Item 1', 100, 'a'),
      createScoredItem('Item 2', 90, 'b'),
      createScoredItem('Item 3', 80, 'c'),
      createScoredItem('Item 4', 70, 'd'),
      createScoredItem('Item 5', 60, 'e'),
    ];

    const selected = selectDiverseItems(items, 3, 10);
    expect(selected).toHaveLength(3);
  });

  it('fills remaining slots if topic limits not reached', () => {
    const items = [
      createScoredItem('Item 1', 100, 'a'),
      createScoredItem('Item 2', 90, 'a'),
      createScoredItem('Item 3', 80, 'a'),
      createScoredItem('Item 4', 70, 'a'),
    ];

    // With maxPerTopic=2, first pass gets 2, then fills remaining
    const selected = selectDiverseItems(items, 4, 2);
    expect(selected).toHaveLength(4);
  });
});
