# Kindle Assist

A personal "read-it-later" service with daily Kindle digest. Save articles, organize with tags, and receive a curated daily EPUB digest on your Kindle.

## Features

- Save articles from any URL with automatic content extraction
- Organize articles with tags and favorites
- Server-rendered admin UI for browsing saved articles
- Daily digest cron job that compiles:
  - Your saved, unsent inbox articles
  - RSS news items scored by your interests
- Generates valid EPUB with cover, TOC, and chapters
- Sends directly to your Kindle via email

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database

### Installation

```bash
# Clone and install
git clone https://github.com/yourusername/kindle-assist.git
cd kindle-assist
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Setup database
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# Start development server
pnpm dev
```

Visit http://localhost:3000 and login with your `ADMIN_PASSWORD`.

### Save an Article

Via UI: Click "+ Add Article" and paste the URL.

Via API:
```bash
curl -X POST http://localhost:3000/api/articles \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "tags": ["tech"]}'
```

### Run Daily Digest

```bash
pnpm cron:run
```

This will:
1. Collect unsent inbox articles
2. Fetch and score RSS items based on your interests
3. Generate an EPUB
4. Email it to your Kindle

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_API_KEY` | API key for programmatic access |
| `ADMIN_PASSWORD` | Password for admin UI login |
| `SESSION_SECRET` | Secret for session cookies |
| `RESEND_API_KEY` | Resend.com API key |
| `EMAIL_FROM` | Sender email (must be verified in Resend) |
| `KINDLE_EMAIL_TO` | Your Kindle email address(es) |

### Interest Configuration

Set `DIGEST_INTERESTS_JSON` to customize what RSS content appears in your digest:

```json
{
  "tech": {
    "keywords": ["apple", "iphone", "ios", "macos"]
  },
  "ai": {
    "keywords": ["llm", "gpt", "claude", "anthropic"],
    "feeds": ["https://aiweekly.com/feed.rss"]
  }
}
```

Each topic defines keywords that score RSS items. Items with more keyword matches rank higher. Optional `feeds` add topic-specific RSS sources.

### Kindle Setup

1. Go to [Amazon Kindle Settings](https://www.amazon.com/hz/mycd/myx#/home/settings/payment)
2. Add your `EMAIL_FROM` address to the approved senders list
3. Find your Kindle email address and set it as `KINDLE_EMAIL_TO`

## Deployment (Render)

1. Fork this repository
2. Create a new Blueprint on Render
3. Connect your forked repo
4. Render will auto-detect `render.yaml` and create:
   - Web service for the API
   - Cron job for daily digest (6 AM Mountain Time)
   - PostgreSQL database
5. Set environment variables in Render dashboard
6. Deploy!

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start API server in dev mode |
| `pnpm build` | Build all packages |
| `pnpm cron:run` | Run digest cron job |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed database with admin user |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint code |
| `pnpm typecheck` | Type check |

## Architecture

```
/apps
  /api        -> Fastify API + server-rendered admin UI
  /cron       -> Daily digest cron runner
/packages
  /core       -> Shared logic (db, extraction, rss, epub, email)
/prisma       -> Database schema
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.

## License

MIT
