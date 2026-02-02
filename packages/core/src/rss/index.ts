import Parser from 'rss-parser';

export interface FeedItem {
  title: string;
  link: string;
  pubDate: Date | null;
  content: string;
  contentSnippet: string;
  author: string | null;
  feedTitle: string;
  feedUrl: string;
}

const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent': 'KindleAssist/1.0',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
});

export async function fetchFeed(feedUrl: string): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(feedUrl);

    return (feed.items || []).map((item) => ({
      title: item.title || 'Untitled',
      link: item.link || '',
      pubDate: item.pubDate ? new Date(item.pubDate) : null,
      content: item.content || item['content:encoded'] || '',
      contentSnippet: item.contentSnippet || item.content?.slice(0, 300) || '',
      author: item.creator || item.author || null,
      feedTitle: feed.title || 'Unknown Feed',
      feedUrl,
    }));
  } catch (error) {
    console.error(`Failed to fetch feed ${feedUrl}:`, error);
    return [];
  }
}

export async function fetchMultipleFeeds(feedUrls: string[]): Promise<FeedItem[]> {
  const results = await Promise.allSettled(feedUrls.map((url) => fetchFeed(url)));

  const items: FeedItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  // Sort by pubDate descending (newest first)
  return items.sort((a, b) => {
    if (!a.pubDate && !b.pubDate) return 0;
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return b.pubDate.getTime() - a.pubDate.getTime();
  });
}

export function parseRssFeeds(feedsEnv: string | undefined): string[] {
  if (!feedsEnv) return [];
  return feedsEnv
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}
