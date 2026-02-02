import { describe, it, expect } from 'vitest';
import { buildRankingPrompt, buildSummaryPrompt } from './prompts.js';
import { applyFallbackRanking } from './ranking.js';
import { generateFallbackSummaries } from './summarization.js';
import type { ArticleForRanking } from './types.js';

describe('prompts', () => {
  const sampleArticle: ArticleForRanking = {
    id: '1',
    title: 'Test Article',
    source: 'Test Source',
    pubDate: new Date('2024-01-15'),
    excerpt: 'This is a test excerpt for the article content.',
    contentSnippet: 'This is a snippet',
    url: 'https://test.com/article',
    isManualSave: false,
  };

  describe('buildRankingPrompt', () => {
    it('builds ranking prompt with correct structure', () => {
      const articles = [sampleArticle];
      const { system, user } = buildRankingPrompt(articles, ['tech', 'ai']);

      expect(system).toContain('tech, ai');
      expect(system).toContain('CRITICAL');
      expect(system).toContain('NOTABLE');
      expect(system).toContain('RELATED');
      expect(user).toContain('Test Article');
      expect(user).toContain('[1]');
      expect(user).toContain('Test Source');
    });

    it('marks user-saved articles', () => {
      const savedArticle = { ...sampleArticle, isManualSave: true };
      const { user } = buildRankingPrompt([savedArticle], ['tech']);

      expect(user).toContain('[USER SAVED]');
    });

    it('handles missing pubDate', () => {
      const noPubDate = { ...sampleArticle, pubDate: null };
      const { user } = buildRankingPrompt([noPubDate], ['tech']);

      expect(user).toContain('unknown date');
    });

    it('handles multiple articles', () => {
      const articles = [
        sampleArticle,
        { ...sampleArticle, id: '2', title: 'Second Article' },
        { ...sampleArticle, id: '3', title: 'Third Article' },
      ];
      const { user } = buildRankingPrompt(articles, ['tech']);

      expect(user).toContain('[1]');
      expect(user).toContain('[2]');
      expect(user).toContain('[3]');
      expect(user).toContain('3 articles');
    });
  });

  describe('buildSummaryPrompt', () => {
    it('builds summary prompt with tier-specific instructions', () => {
      const critical = buildSummaryPrompt(sampleArticle, 'Full content here', 'critical');
      expect(critical.user).toContain('critical');
      expect(critical.system).toContain('CRITICAL');
      expect(critical.system).toContain('paragraph');
    });

    it('includes article metadata', () => {
      const { user } = buildSummaryPrompt(sampleArticle, 'Full content here', 'notable');

      expect(user).toContain('Test Article');
      expect(user).toContain('Test Source');
      expect(user).toContain('2024-01-15');
    });

    it('truncates long content', () => {
      const longContent = 'x'.repeat(5000);
      const { user } = buildSummaryPrompt(sampleArticle, longContent, 'critical');

      // Content should be truncated to 4000 chars
      expect(user.length).toBeLessThan(5500);
    });
  });
});

describe('fallbackRanking', () => {
  const createArticle = (
    id: string,
    isManualSave: boolean,
    matchedTopics: string[] = []
  ): ArticleForRanking => ({
    id,
    title: `Article ${id}`,
    source: 'Feed',
    pubDate: null,
    excerpt: 'Test excerpt',
    contentSnippet: 'Snippet',
    url: `https://test.com/${id}`,
    isManualSave,
    matchedTopics,
  });

  it('returns empty map for empty array', () => {
    const rankings = applyFallbackRanking([]);
    expect(rankings.size).toBe(0);
  });

  it('prioritizes manual saves as critical', () => {
    const articles = [
      createArticle('rss1', false),
      createArticle('saved1', true),
      createArticle('rss2', false),
    ];

    const rankings = applyFallbackRanking(articles);

    expect(rankings.get('saved1')?.tier).toBe('critical');
  });

  it('uses matched topics count for non-saved articles', () => {
    const articles = [
      createArticle('1', false, ['topic1']),
      createArticle('2', false, ['topic1', 'topic2', 'topic3']),
      createArticle('3', false, ['topic1', 'topic2']),
    ];

    const rankings = applyFallbackRanking(articles);

    // Article 2 has most topics, should be critical
    expect(rankings.get('2')?.tier).toBe('critical');
  });

  it('distributes tiers based on percentage', () => {
    const articles = Array.from({ length: 10 }, (_, i) =>
      createArticle(String(i), false, i < 3 ? ['topic1', 'topic2'] : ['topic1'])
    );

    const rankings = applyFallbackRanking(articles);
    const tiers = Array.from(rankings.values()).map((r) => r.tier);

    // Should have at least 1 critical (20% of 10 = 2)
    expect(tiers.filter((t) => t === 'critical').length).toBeGreaterThanOrEqual(1);
    // Should have at least 2 notable (30% of 10 = 3)
    expect(tiers.filter((t) => t === 'notable').length).toBeGreaterThanOrEqual(2);
    // Rest should be related
    expect(tiers.filter((t) => t === 'related').length).toBeGreaterThan(0);
  });

  it('handles single article', () => {
    const articles = [createArticle('1', false)];
    const rankings = applyFallbackRanking(articles);

    expect(rankings.size).toBe(1);
    expect(rankings.get('1')?.tier).toBe('critical'); // Single article gets critical
  });

  it('includes reason in all rankings', () => {
    const articles = [createArticle('1', false), createArticle('2', true)];

    const rankings = applyFallbackRanking(articles);

    for (const [, ranking] of rankings) {
      expect(ranking.tierReason).toBe('Keyword-based fallback ranking');
    }
  });
});

describe('fallbackSummaries', () => {
  const createArticle = (id: string, excerpt: string): ArticleForRanking => ({
    id,
    title: `Article ${id}`,
    source: 'Feed',
    pubDate: null,
    excerpt,
    contentSnippet: 'Snippet',
    url: `https://test.com/${id}`,
    isManualSave: false,
  });

  it('generates summaries from excerpts', () => {
    const articles = [
      { article: createArticle('1', 'This is a long excerpt for testing'), tier: 'critical' as const },
      { article: createArticle('2', 'Short excerpt'), tier: 'notable' as const },
    ];

    const summaries = generateFallbackSummaries(articles);

    expect(summaries.size).toBe(2);
    expect(summaries.get('1')?.summary).toContain('This is a long excerpt');
    expect(summaries.get('2')?.summary).toContain('Short excerpt');
  });

  it('uses title as oneLiner', () => {
    const articles = [
      { article: createArticle('1', 'Excerpt'), tier: 'related' as const },
    ];

    const summaries = generateFallbackSummaries(articles);

    expect(summaries.get('1')?.oneLiner).toBe('Article 1');
  });

  it('truncates critical summaries to 400 chars', () => {
    const longExcerpt = 'x'.repeat(500);
    const articles = [{ article: createArticle('1', longExcerpt), tier: 'critical' as const }];

    const summaries = generateFallbackSummaries(articles);

    // Should be ~400 chars + "..."
    expect(summaries.get('1')?.summary.length).toBeLessThanOrEqual(404);
  });

  it('truncates notable summaries to 150 chars', () => {
    const longExcerpt = 'x'.repeat(500);
    const articles = [{ article: createArticle('1', longExcerpt), tier: 'notable' as const }];

    const summaries = generateFallbackSummaries(articles);

    // Should be ~150 chars + "..."
    expect(summaries.get('1')?.summary.length).toBeLessThanOrEqual(154);
  });
});
