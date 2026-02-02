import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { fetch } from 'undici';
import { createHash } from 'crypto';

export interface ExtractedArticle {
  title: string;
  author: string | null;
  siteName: string | null;
  publishedAt: Date | null;
  excerpt: string | null;
  contentHtml: string;
  contentText: string;
  wordCount: number;
  readingMinutes: number;
  canonicalUrl: string;
  contentHash: string;
}

const USER_AGENT =
  'Mozilla/5.0 (compatible; KindleAssist/1.0; +https://github.com/kindle-assist)';

const WORDS_PER_MINUTE = 200;

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove common tracking parameters
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'source',
      'fbclid',
      'gclid',
      'mc_cid',
      'mc_eid',
    ];

    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }

    // Normalize protocol to https
    parsed.protocol = 'https:';

    // Remove trailing slash from pathname
    if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Remove www prefix
    if (parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4);
    }

    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();

    return parsed.toString();
  } catch {
    return url;
  }
}

export function computeContentHash(contentText: string): string {
  // Normalize whitespace and lowercase for consistent hashing
  const normalized = contentText
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000); // Use first 5000 chars for hash to handle large articles

  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

function calculateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

function extractPublishedDate(doc: Document): Date | null {
  // Check meta tags for published date
  const metaSelectors = [
    'meta[property="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[name="publish-date"]',
    'meta[itemprop="datePublished"]',
    'time[datetime]',
  ];

  for (const selector of metaSelectors) {
    const el = doc.querySelector(selector);
    if (el) {
      const value = el.getAttribute('content') || el.getAttribute('datetime');
      if (value) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  }

  return null;
}

function extractSiteName(doc: Document, url: string): string | null {
  // Check meta tags
  const ogSiteName = doc
    .querySelector('meta[property="og:site_name"]')
    ?.getAttribute('content');
  if (ogSiteName) return ogSiteName;

  // Fall back to hostname
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    // Capitalize first letter of each part
    return hostname
      .split('.')
      .slice(0, -1)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } catch {
    return null;
  }
}

function findCanonicalUrl(doc: Document, originalUrl: string): string {
  // Check canonical link
  const canonicalLink = doc.querySelector('link[rel="canonical"]');
  if (canonicalLink) {
    const href = canonicalLink.getAttribute('href');
    if (href) {
      try {
        // Handle relative URLs
        return new URL(href, originalUrl).toString();
      } catch {
        // Fall through
      }
    }
  }

  // Check og:url
  const ogUrl = doc.querySelector('meta[property="og:url"]')?.getAttribute('content');
  if (ogUrl) {
    try {
      return new URL(ogUrl, originalUrl).toString();
    } catch {
      // Fall through
    }
  }

  return originalUrl;
}

export async function extractArticle(url: string): Promise<ExtractedArticle> {
  // Fetch the HTML
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Parse with JSDOM
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Find canonical URL from the document
  const docCanonicalUrl = findCanonicalUrl(doc, url);

  // Extract metadata before Readability modifies the DOM
  const publishedAt = extractPublishedDate(doc);
  const siteName = extractSiteName(doc, url);

  // Use Readability to extract content
  const reader = new Readability(doc, {
    charThreshold: 100,
  });

  const article = reader.parse();

  if (!article) {
    throw new Error('Failed to extract article content');
  }

  const contentText = article.textContent || '';
  const wordCount = countWords(contentText);

  return {
    title: article.title || 'Untitled',
    author: article.byline || null,
    siteName: article.siteName || siteName,
    publishedAt,
    excerpt: article.excerpt || contentText.slice(0, 200) + '...',
    contentHtml: article.content || '',
    contentText,
    wordCount,
    readingMinutes: calculateReadingMinutes(wordCount),
    canonicalUrl: canonicalizeUrl(docCanonicalUrl),
    contentHash: computeContentHash(contentText),
  };
}
