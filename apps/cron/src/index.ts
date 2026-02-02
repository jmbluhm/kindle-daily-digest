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
  generateEpub,
  generateDigestFilename,
  sendDigestToKindle,
  canonicalizeUrl,
} from '@kindle-assist/core';
import type { EpubArticle, ScoredFeedItem } from '@kindle-assist/core';

// Environment config
const DIGEST_MAX_ARTICLES = parseInt(process.env.DIGEST_MAX_ARTICLES || '15', 10);
const DIGEST_MAX_SAVED = parseInt(process.env.DIGEST_MAX_SAVED || '5', 10);
const DIGEST_MAX_RSS = parseInt(process.env.DIGEST_MAX_RSS || '10', 10);
const DIGEST_MAX_PER_TOPIC = parseInt(process.env.DIGEST_MAX_PER_TOPIC || '3', 10);
const DIGEST_SAVE_FEED_ITEMS = process.env.DIGEST_SAVE_FEED_ITEMS === 'true';

function log(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

async function main(): Promise<void> {
  log('Starting daily digest cron job');

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

    // 2. Get unsent inbox articles
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
    const baseFeeds = parseRssFeeds(process.env.RSS_FEEDS);
    const interestFeeds = getAllFeedsFromInterests(interests);
    const allFeeds = [...new Set([...baseFeeds, ...interestFeeds])];

    log('Fetching RSS feeds', { count: allFeeds.length, feeds: allFeeds });

    const feedItems = await fetchMultipleFeeds(allFeeds);
    log('Fetched feed items', { count: feedItems.length });

    // Score items based on interests
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

    // 4. Check if we have anything to send
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

    // 5. Extract full content for feed items
    const feedArticles: EpubArticle[] = [];
    const feedItemsIncluded: ScoredFeedItem[] = [];

    for (const item of selectedFeedItems) {
      try {
        log('Extracting feed item', { title: item.title, link: item.link });
        const extracted = await extractArticle(item.link);

        feedArticles.push({
          title: extracted.title,
          author: extracted.author,
          siteName: extracted.siteName || item.feedTitle,
          url: item.link,
          contentHtml: extracted.contentHtml,
          readingMinutes: extracted.readingMinutes,
        });

        feedItemsIncluded.push(item);

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

    // 6. Build EPUB
    const now = new Date();
    const allEpubArticles: EpubArticle[] = [
      // Saved articles first
      ...savedArticles.map((a) => ({
        title: a.title,
        author: a.author,
        siteName: a.siteName,
        url: a.url,
        contentHtml: a.contentHtml,
        readingMinutes: a.readingMinutes,
      })),
      // Then feed articles
      ...feedArticles,
    ];

    // Limit total articles
    const finalArticles = allEpubArticles.slice(0, DIGEST_MAX_ARTICLES);

    log('Building EPUB', { articleCount: finalArticles.length });

    const epub = await generateEpub({
      title: 'Kindle Digest',
      date: now,
      articles: finalArticles,
    });

    const filename = generateDigestFilename(now);
    log('Generated EPUB', { filename, sizeBytes: epub.length });

    // 7. Send to Kindle
    log('Sending to Kindle');
    const emailResult = await sendDigestToKindle(epub, filename, finalArticles.length, now);
    log('Sent to Kindle', { messageId: emailResult.messageId });

    // 8. Update records
    const includedArticleIds = savedArticles.slice(0, finalArticles.length).map((a) => a.id);

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
        feedItemsIncluded: feedItemsIncluded.map((i) => ({
          title: i.title,
          link: i.link,
          score: i.score,
          topics: i.matchedTopics,
        })),
        epubFilename: filename,
        emailMessageId: emailResult.messageId,
      },
    });

    log('Digest complete!', {
      savedArticles: includedArticleIds.length,
      feedArticles: feedArticles.length,
      totalArticles: finalArticles.length,
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
