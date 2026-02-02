import {
  getDb,
  disconnectDb,
  fetchMultipleFeeds,
  parseRssFeeds,
  parseDigestInterests,
  getAllFeedsFromInterests,
  scoreAndRankFeedItems,
  selectDiverseItems,
  extractArticle,
  generateSummaryEpub,
  generateFullArticlesEpub,
  generateSummaryFilename,
  generateFullArticlesFilename,
  sendTieredDigestToKindle,
  canonicalizeUrl,
  isLLMEnabled,
  rankArticlesBatch,
  applyFallbackRanking,
  generateSummariesBatch,
  generateFallbackSummaries,
} from '@kindle-assist/core';
import type {
  EpubArticle,
  ScoredFeedItem,
  TieredDigestArticle,
  ArticleForRanking,
  ArticleTier,
  ExtractedContent,
} from '@kindle-assist/core';

// Environment config
const DIGEST_MAX_ARTICLES = parseInt(process.env.DIGEST_MAX_ARTICLES || '25', 10);
const DIGEST_MAX_SAVED = parseInt(process.env.DIGEST_MAX_SAVED || '10', 10);
const DIGEST_MAX_RSS = parseInt(process.env.DIGEST_MAX_RSS || '15', 10);
const DIGEST_MAX_PER_TOPIC = parseInt(process.env.DIGEST_MAX_PER_TOPIC || '3', 10);
const DIGEST_SAVE_FEED_ITEMS = process.env.DIGEST_SAVE_FEED_ITEMS === 'true';

function log(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

async function main(): Promise<void> {
  log('Starting daily digest cron job');
  const llmEnabled = isLLMEnabled();
  log('LLM ranking enabled:', { enabled: llmEnabled });

  const db = getDb();
  let digestRun;

  try {
    // 1. Load admin user
    const user = await db.user.findFirst();
    if (!user) {
      throw new Error('No admin user found. Run db:seed first.');
    }
    log('Loaded user', { userId: user.id });

    // Create digest run record
    digestRun = await db.digestRun.create({
      data: {
        userId: user.id,
        status: 'SUCCESS',
      },
    });
    log('Created digest run', { runId: digestRun.id });

    // 2. Get unsent inbox articles (user-saved)
    const savedArticles = await db.article.findMany({
      where: {
        userId: user.id,
        status: 'INBOX',
        sentToKindleAt: null,
      },
      orderBy: [{ favorited: 'desc' }, { createdAt: 'desc' }],
      take: DIGEST_MAX_SAVED,
    });
    log('Found saved articles', { count: savedArticles.length });

    // Get existing article hashes for deduplication
    const existingHashes = new Set(
      (
        await db.article.findMany({
          where: { userId: user.id },
          select: { contentHash: true, canonicalUrl: true },
        })
      ).flatMap((a) => [a.contentHash, a.canonicalUrl])
    );

    // 3. Fetch and score RSS items
    const interests = parseDigestInterests(process.env.DIGEST_INTERESTS_JSON);
    const interestTopics = Object.keys(interests);
    const baseFeeds = parseRssFeeds(process.env.RSS_FEEDS);
    const interestFeeds = getAllFeedsFromInterests(interests);
    const allFeeds = [...new Set([...baseFeeds, ...interestFeeds])];

    log('Fetching RSS feeds', { count: allFeeds.length });

    const feedItems = await fetchMultipleFeeds(allFeeds);
    log('Fetched feed items', { count: feedItems.length });

    // Score items based on interests (keyword pre-filtering)
    const scoredItems = scoreAndRankFeedItems(feedItems, interests);
    log('Scored feed items', { matchingCount: scoredItems.length });

    // Deduplicate against saved articles
    const newItems = scoredItems.filter((item) => {
      const canonical = canonicalizeUrl(item.link);
      return !existingHashes.has(canonical);
    });
    log('After deduplication', { count: newItems.length });

    // Select diverse items
    const selectedFeedItems = selectDiverseItems(newItems, DIGEST_MAX_RSS, DIGEST_MAX_PER_TOPIC);
    log('Selected feed items', { count: selectedFeedItems.length });

    // 4. Check if we have anything to process
    if (savedArticles.length === 0 && selectedFeedItems.length === 0) {
      log('No articles to include in digest, skipping');
      await db.digestRun.update({
        where: { id: digestRun.id },
        data: {
          finishedAt: new Date(),
          status: 'SUCCESS',
          includedArticleIds: [],
          feedItemsIncluded: [],
          error: 'No articles available',
        },
      });
      return;
    }

    // 5. Extract full content for ALL selected items
    const extractedContent = new Map<string, ExtractedContent>();

    // Saved articles already have content in DB
    for (const article of savedArticles) {
      extractedContent.set(article.id, {
        html: article.contentHtml,
        text: article.contentText,
        readingMinutes: article.readingMinutes,
        author: article.author,
      });
    }

    // Extract feed items content
    for (const item of selectedFeedItems) {
      try {
        log('Extracting feed item', { title: item.title, link: item.link });
        const extracted = await extractArticle(item.link);
        extractedContent.set(item.link, {
          html: extracted.contentHtml,
          text: extracted.contentText,
          readingMinutes: extracted.readingMinutes,
          author: extracted.author,
        });

        // Optionally save feed items as articles
        if (DIGEST_SAVE_FEED_ITEMS) {
          await db.article.create({
            data: {
              userId: user.id,
              url: item.link,
              canonicalUrl: extracted.canonicalUrl,
              title: extracted.title,
              author: extracted.author,
              siteName: extracted.siteName,
              publishedAt: item.pubDate,
              excerpt: extracted.excerpt,
              contentHtml: extracted.contentHtml,
              contentText: extracted.contentText,
              wordCount: extracted.wordCount,
              readingMinutes: extracted.readingMinutes,
              contentHash: extracted.contentHash,
              status: 'ARCHIVED',
            },
          });
        }
      } catch (error) {
        log('Failed to extract feed item', {
          title: item.title,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 6. Build unified article list for ranking
    const articlesForRanking: ArticleForRanking[] = [
      ...savedArticles.map((a) => ({
        id: a.id,
        title: a.title,
        source: a.siteName || 'Unknown',
        pubDate: a.publishedAt,
        excerpt: a.excerpt || a.contentText.slice(0, 500),
        contentSnippet: a.excerpt || '',
        url: a.url,
        isManualSave: true,
        matchedTopics: [] as string[],
      })),
      ...selectedFeedItems
        .filter((item) => extractedContent.has(item.link))
        .map((item) => ({
          id: item.link,
          title: item.title,
          source: item.feedTitle,
          pubDate: item.pubDate,
          excerpt: item.contentSnippet || item.content?.slice(0, 500) || '',
          contentSnippet: item.contentSnippet || '',
          url: item.link,
          isManualSave: false,
          matchedTopics: item.matchedTopics,
        })),
    ];

    log('Articles for ranking', { count: articlesForRanking.length });

    // 7. Rank articles with LLM (or fallback)
    let rankings: Map<string, { tier: ArticleTier; tierReason: string }>;

    if (llmEnabled) {
      try {
        rankings = await rankArticlesBatch(articlesForRanking, interestTopics);
        log('LLM ranking complete', { count: rankings.size });
      } catch (error) {
        log('LLM ranking failed, using fallback', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        rankings = applyFallbackRanking(articlesForRanking);
      }
    } else {
      log('LLM disabled, using fallback ranking');
      rankings = applyFallbackRanking(articlesForRanking);
    }

    // Log tier distribution
    const tierCounts = { critical: 0, notable: 0, related: 0 };
    for (const [, ranking] of rankings) {
      tierCounts[ranking.tier]++;
    }
    log('Tier distribution', tierCounts);

    // 8. Generate summaries for ranked articles
    const articlesWithTiers = articlesForRanking.map((article) => ({
      ...article,
      tier: rankings.get(article.id)?.tier || ('related' as ArticleTier),
      tierReason: rankings.get(article.id)?.tierReason || 'Default',
    }));

    const summaryInputs = articlesWithTiers.map((article) => ({
      article,
      fullContent: extractedContent.get(article.id)?.text || article.excerpt,
      tier: article.tier,
    }));

    let summaries: Map<string, { summary: string; oneLiner?: string }>;

    if (llmEnabled) {
      try {
        summaries = await generateSummariesBatch(summaryInputs);
        log('LLM summaries generated', { count: summaries.size });
      } catch (error) {
        log('LLM summaries failed, using fallback', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        summaries = generateFallbackSummaries(summaryInputs);
      }
    } else {
      summaries = generateFallbackSummaries(summaryInputs);
    }

    // 9. Build tiered article lists
    const tieredArticles: TieredDigestArticle[] = articlesWithTiers.map((article) => {
      const content = extractedContent.get(article.id);
      const summaryData = summaries.get(article.id);

      return {
        id: article.id,
        title: article.title,
        author: content?.author || null,
        siteName: article.source,
        url: article.url,
        tier: article.tier,
        summary: summaryData?.summary || article.excerpt.slice(0, 200) + '...',
        oneLiner: summaryData?.oneLiner || article.title,
        contentHtml: content?.html,
        readingMinutes: content?.readingMinutes,
      };
    });

    const criticalArticles = tieredArticles.filter((a) => a.tier === 'critical');
    const notableArticles = tieredArticles.filter((a) => a.tier === 'notable');
    const relatedArticles = tieredArticles.filter((a) => a.tier === 'related');

    log('Tiered articles', {
      critical: criticalArticles.length,
      notable: notableArticles.length,
      related: relatedArticles.length,
    });

    // 10. Generate EPUBs
    const now = new Date();

    // Summary EPUB (all tiers with summaries)
    const summaryEpub = await generateSummaryEpub({
      title: 'Kindle Digest',
      date: now,
      criticalArticles,
      notableArticles,
      relatedArticles,
    });
    const summaryFilename = generateSummaryFilename(now);

    // Full Articles EPUB (critical tier only)
    const fullArticlesForEpub: EpubArticle[] = criticalArticles
      .filter((a) => a.contentHtml)
      .map((a) => ({
        title: a.title,
        author: a.author,
        siteName: a.siteName,
        url: a.url,
        contentHtml: a.contentHtml!,
        readingMinutes: a.readingMinutes || 5,
      }));

    const fullArticlesEpub = await generateFullArticlesEpub({
      title: 'Kindle Digest',
      date: now,
      articles: fullArticlesForEpub,
    });
    const fullArticlesFilename = generateFullArticlesFilename(now);

    log('Generated EPUBs', {
      summarySize: summaryEpub.length,
      fullArticlesSize: fullArticlesEpub.length,
      fullArticleCount: fullArticlesForEpub.length,
    });

    // 11. Send single email with both attachments
    log('Sending to Kindle');
    const emailResult = await sendTieredDigestToKindle(
      {
        summaryEpub,
        summaryFilename,
        fullArticlesEpub,
        fullArticlesFilename,
      },
      {
        critical: criticalArticles.length,
        notable: notableArticles.length,
        related: relatedArticles.length,
        fullArticles: fullArticlesForEpub.length,
      },
      now
    );
    log('Sent to Kindle', { messageId: emailResult.messageId });

    // 12. Update records
    const includedArticleIds = savedArticles
      .filter((a) => tieredArticles.some((t) => t.id === a.id))
      .map((a) => a.id);

    // Mark sent articles
    if (includedArticleIds.length > 0) {
      await db.article.updateMany({
        where: { id: { in: includedArticleIds } },
        data: { sentToKindleAt: now },
      });
    }

    // Update digest run
    await db.digestRun.update({
      where: { id: digestRun.id },
      data: {
        finishedAt: new Date(),
        status: 'SUCCESS',
        includedArticleIds: includedArticleIds,
        feedItemsIncluded: selectedFeedItems.map((i) => ({
          title: i.title,
          link: i.link,
          score: i.score,
          tier: rankings.get(i.link)?.tier || 'related',
          topics: i.matchedTopics,
        })),
        epubFilename: `${summaryFilename}, ${fullArticlesFilename}`,
        emailMessageId: emailResult.messageId,
      },
    });

    log('Digest complete!', {
      savedArticles: includedArticleIds.length,
      feedArticles: selectedFeedItems.filter((i) => extractedContent.has(i.link)).length,
      totalArticles: tieredArticles.length,
      critical: criticalArticles.length,
      notable: notableArticles.length,
      related: relatedArticles.length,
    });
  } catch (error) {
    log('Digest failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    // Update digest run with error
    if (digestRun) {
      await db.digestRun.update({
        where: { id: digestRun.id },
        data: {
          finishedAt: new Date(),
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }

    throw error;
  } finally {
    await disconnectDb();
  }
}

main()
  .then(() => {
    log('Cron job finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cron job failed:', error);
    process.exit(1);
  });
