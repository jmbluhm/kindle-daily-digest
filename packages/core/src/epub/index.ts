import EPub from 'epub-gen-memory';

export interface EpubArticle {
  title: string;
  author: string | null;
  siteName: string | null;
  url: string;
  contentHtml: string;
  readingMinutes: number;
}

export interface EpubOptions {
  title: string;
  author?: string;
  date: Date;
  articles: EpubArticle[];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Denver',
  });
}

function generateCoverHtml(title: string, date: Date, articleCount: number): string {
  const formattedDate = formatDate(date);
  const totalMinutes = Math.round(articleCount * 5); // Rough estimate

  return `
    <div style="text-align: center; padding: 40px 20px; font-family: Georgia, serif;">
      <h1 style="font-size: 2.5em; margin-bottom: 0.5em; color: #333;">${title}</h1>
      <p style="font-size: 1.2em; color: #666; margin-bottom: 2em;">${formattedDate}</p>
      <hr style="border: none; border-top: 2px solid #ccc; width: 50%; margin: 2em auto;" />
      <p style="font-size: 1em; color: #888;">${articleCount} articles</p>
      <p style="font-size: 0.9em; color: #888;">~${totalMinutes} min read</p>
    </div>
  `;
}

function generateArticleHtml(article: EpubArticle): string {
  const sourceInfo = [article.siteName, article.author].filter(Boolean).join(' • ');

  return `
    <article style="font-family: Georgia, serif; line-height: 1.6;">
      <header style="margin-bottom: 1.5em; padding-bottom: 1em; border-bottom: 1px solid #ccc;">
        <p style="font-size: 0.85em; color: #666; margin-bottom: 0.5em;">
          ${sourceInfo ? `${sourceInfo} • ` : ''}${article.readingMinutes} min read
        </p>
        <p style="font-size: 0.8em; color: #888;">
          <a href="${article.url}" style="color: #0066cc; text-decoration: none;">Original Article</a>
        </p>
      </header>
      <div class="article-content">
        ${article.contentHtml}
      </div>
    </article>
  `;
}

function generateTocHtml(articles: EpubArticle[]): string {
  const items = articles
    .map(
      (article, index) => `
      <li style="margin-bottom: 0.8em;">
        <span style="color: #666; font-size: 0.9em;">${index + 1}.</span>
        ${article.title}
        <span style="color: #888; font-size: 0.85em;"> — ${article.siteName || 'Unknown'}</span>
      </li>
    `
    )
    .join('');

  return `
    <nav style="font-family: Georgia, serif;">
      <h2 style="font-size: 1.5em; margin-bottom: 1em;">Table of Contents</h2>
      <ol style="list-style: none; padding: 0; margin: 0;">
        ${items}
      </ol>
    </nav>
  `;
}

const EPUB_CSS = `
  body {
    font-family: Georgia, 'Times New Roman', serif;
    line-height: 1.6;
    color: #333;
    max-width: 100%;
    padding: 0;
    margin: 0;
  }

  h1, h2, h3, h4, h5, h6 {
    font-weight: bold;
    line-height: 1.3;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }

  h1 { font-size: 1.8em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.3em; }

  p {
    margin: 1em 0;
    text-align: justify;
  }

  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1em auto;
  }

  a {
    color: #0066cc;
    text-decoration: none;
  }

  blockquote {
    margin: 1em 0;
    padding-left: 1em;
    border-left: 3px solid #ccc;
    color: #555;
    font-style: italic;
  }

  pre, code {
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    background: #f5f5f5;
    padding: 0.2em 0.4em;
    border-radius: 3px;
  }

  pre {
    padding: 1em;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  ul, ol {
    margin: 1em 0;
    padding-left: 2em;
  }

  li {
    margin: 0.5em 0;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }

  th, td {
    border: 1px solid #ccc;
    padding: 0.5em;
    text-align: left;
  }

  hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 2em 0;
  }
`;

export async function generateEpub(options: EpubOptions): Promise<Buffer> {
  const { title, author, date, articles } = options;

  // Build chapters array
  const chapters = [
    {
      title: 'Cover',
      content: generateCoverHtml(title, date, articles.length),
    },
    {
      title: 'Table of Contents',
      content: generateTocHtml(articles),
    },
    ...articles.map((article) => ({
      title: article.title,
      content: generateArticleHtml(article),
    })),
  ];

  const epub = await EPub(
    {
      title,
      author: author || 'Kindle Assist',
      publisher: 'Kindle Assist',
      date: date.toISOString(),
      css: EPUB_CSS,
      tocTitle: 'Contents',
      appendChapterTitles: true,
    },
    chapters
  );

  return Buffer.from(epub);
}

export function generateDigestFilename(date: Date): string {
  const dateStr = date.toISOString().split('T')[0];
  return `kindle-digest-${dateStr}.epub`;
}
