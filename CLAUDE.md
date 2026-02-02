# Kindle Assist - Claude Code Context

## Project Overview

Kindle Assist is a personal "read-it-later" service combined with a daily Kindle news digest. It allows saving articles for later reading and automatically compiles a daily digest from saved articles and RSS feeds, then sends it to your Kindle as an EPUB.

## Architecture

### Monorepo Structure

```
/apps
  /api        -> Fastify API + server-rendered admin UI (port 3000)
  /cron       -> Daily digest cron runner (standalone script)
/packages
  /core       -> Shared logic (db, extraction, rss, epub, email, interests)
/prisma       -> Prisma schema + migrations
/docs         -> Ops + deployment notes
```

### Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Package Manager**: pnpm with workspaces
- **Backend**: Fastify (REST API + server-rendered HTML)
- **Database**: PostgreSQL with Prisma ORM
- **Email**: Resend API
- **Content Extraction**: JSDOM + Mozilla Readability
- **RSS Parsing**: rss-parser
- **EPUB Generation**: epub-gen-memory

### Key Design Decisions

1. **Single-user first**: Auth is via password + API key, no OAuth
2. **Server-rendered UI**: No SPA framework, minimal HTML/CSS only
3. **No queues/workers**: Cron runs once per invocation (Render schedules)
4. **RSS only**: No paid APIs for news ingestion
5. **Idempotent cron**: DigestRun records prevent duplicate sends

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL (local or Docker)

### Setup

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed database (creates admin user + default tags)
pnpm db:seed

# Start API server
pnpm dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/kindle_assist
ADMIN_API_KEY=your-secure-api-key
ADMIN_PASSWORD=your-admin-password
SESSION_SECRET=random-32-char-string

# Email (Resend)
RESEND_API_KEY=re_xxx
EMAIL_FROM=digest@yourdomain.com
KINDLE_EMAIL_TO=user_xxx@kindle.com

# RSS feeds (comma-separated)
RSS_FEEDS=https://example.com/feed.rss,https://other.com/feed.xml

# Interests (JSON object)
DIGEST_INTERESTS_JSON='{"topic":{"keywords":["keyword1","keyword2"]}}'
```

### Running Tests

```bash
pnpm test          # Run all tests
pnpm test:watch    # Watch mode
```

### Running Cron Locally

```bash
pnpm cron:run
```

## API Endpoints

### Health
- `GET /healthz` - Health check

### Auth (UI)
- `GET /login` - Login page
- `POST /login` - Submit login
- `POST /logout` - Logout

### Articles (API)
- `POST /api/articles` - Save article `{ url, tags? }`
- `GET /api/articles?status=&tag=&q=&limit=&cursor=` - List articles
- `POST /api/articles/:id/archive` - Archive
- `POST /api/articles/:id/unarchive` - Unarchive
- `POST /api/articles/:id/favorite` - Favorite
- `POST /api/articles/:id/unfavorite` - Unfavorite
- `POST /api/articles/:id/send-to-kindle-now` - Send single article

### Tags (API)
- `GET /api/tags` - List tags
- `POST /api/tags` - Create tag `{ name }`

### Digest (API)
- `POST /api/digest/run` - Info about triggering digest
- `GET /api/digest/runs` - List digest runs

## Interest Configuration

The daily digest uses `DIGEST_INTERESTS_JSON` to score RSS items. Each topic has:
- `keywords[]` - Words to match in titles/content
- `feeds[]` (optional) - Additional RSS feeds for this topic

Example:
```json
{
  "apple_products": {
    "keywords": ["apple", "iphone", "ipad", "mac"]
  },
  "ai": {
    "keywords": ["ai", "llm", "gpt", "claude"],
    "feeds": ["https://aiweekly.com/feed.rss"]
  }
}
```

Items are scored by:
1. Keyword match count (max 10 points per keyword)
2. Recency (up to 20% bonus for items < 6 hours old)

Diversity is enforced: max 3 items per topic by default.

## Render Deployment

### Services

1. **Web Service** (`apps/api`)
   - Build: `pnpm install && pnpm db:generate && pnpm build`
   - Start: `pnpm db:migrate:deploy && node apps/api/dist/index.js`

2. **Cron Job** (`apps/cron`)
   - Build: Same as above
   - Command: `pnpm db:migrate:deploy && node apps/cron/dist/index.js`
   - Schedule: `0 6 * * *` (6 AM UTC daily)

3. **PostgreSQL** (Render managed)

### Environment Variables (Render)

Set these in Render dashboard for both services:
- `DATABASE_URL` (from Render Postgres)
- `ADMIN_API_KEY`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `KINDLE_EMAIL_TO`
- `RSS_FEEDS`
- `DIGEST_INTERESTS_JSON`

## Database Schema

- **User**: Single admin user
- **Article**: Saved articles with extracted content
- **Tag**: Article tags
- **ArticleTag**: Join table
- **DigestRun**: Record of each digest execution

## Common Tasks

### Add an article via API
```bash
curl -X POST http://localhost:3000/api/articles \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "tags": ["tech"]}'
```

### Manually trigger digest
```bash
pnpm cron:run
```

### View digest runs
```bash
curl http://localhost:3000/api/digest/runs \
  -H "x-api-key: YOUR_API_KEY"
```

## Troubleshooting

### Article extraction fails
- Check if the URL is accessible
- Some sites block automated access; try a different article

### Digest not sending
- Verify `RESEND_API_KEY` and `EMAIL_FROM` are set
- Ensure `EMAIL_FROM` domain is verified in Resend
- Check `KINDLE_EMAIL_TO` is whitelisted in Amazon Kindle settings

### No RSS items in digest
- Verify `RSS_FEEDS` is set
- Check `DIGEST_INTERESTS_JSON` keywords match feed content
- Feeds may be empty or rate-limited
