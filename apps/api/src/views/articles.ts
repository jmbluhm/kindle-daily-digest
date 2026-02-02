import { layout, escapeHtml } from './layout.js';
import type { Article, Tag } from '@kindle-assist/core';

type ArticleWithTags = Article & { tags: { tag: Tag }[] };

export function articlesPage(
  articles: ArticleWithTags[],
  status: 'INBOX' | 'ARCHIVED',
  tags: Tag[],
  currentTag?: string,
  message?: string
): string {
  const content = `
    ${message ? `<div class="alert alert-success">${escapeHtml(message)}</div>` : ''}

    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>${status === 'INBOX' ? 'Inbox' : 'Archive'}</h2>
        <button class="btn btn-primary" onclick="showAddModal()">+ Add Article</button>
      </div>

      <div class="filters">
        <a href="/?status=${status}" class="filter-btn ${!currentTag ? 'active' : ''}">All</a>
        ${tags.map((tag) => `
          <a href="/?status=${status}&tag=${encodeURIComponent(tag.name)}"
             class="filter-btn ${currentTag === tag.name ? 'active' : ''}">
            ${escapeHtml(tag.name)}
          </a>
        `).join('')}
      </div>

      ${articles.length === 0 ? `
        <div class="empty-state">
          <p>No articles yet. Add one using the button above.</p>
        </div>
      ` : `
        <div class="article-list">
          ${articles.map((article) => articleItem(article, status)).join('')}
        </div>
      `}
    </div>

    <!-- Add Article Modal -->
    <div id="addModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100;">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px; border-radius: 8px; width: 90%; max-width: 500px;">
        <h3 style="margin-bottom: 16px;">Add Article</h3>
        <form method="POST" action="/articles" id="addForm">
          <div class="form-group">
            <label for="url">URL</label>
            <input type="url" id="url" name="url" required placeholder="https://...">
          </div>
          <div class="form-group">
            <label for="tags">Tags (comma-separated)</label>
            <input type="text" id="tags" name="tags" placeholder="tech, reading">
          </div>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="hideAddModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Article</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const scripts = `
    <script>
      function showAddModal() {
        document.getElementById('addModal').style.display = 'block';
        document.getElementById('url').focus();
      }

      function hideAddModal() {
        document.getElementById('addModal').style.display = 'none';
        document.getElementById('addForm').reset();
      }

      document.getElementById('addModal').addEventListener('click', function(e) {
        if (e.target === this) hideAddModal();
      });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') hideAddModal();
      });

      async function toggleFavorite(id, favorited) {
        const action = favorited ? 'unfavorite' : 'favorite';
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/articles/' + id + '/' + action;
        document.body.appendChild(form);
        form.submit();
      }

      async function archiveArticle(id) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/articles/' + id + '/archive';
        document.body.appendChild(form);
        form.submit();
      }

      async function unarchiveArticle(id) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/articles/' + id + '/unarchive';
        document.body.appendChild(form);
        form.submit();
      }

      async function sendToKindle(id) {
        if (!confirm('Send this article to Kindle?')) return;
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/articles/' + id + '/send-to-kindle';
        document.body.appendChild(form);
        form.submit();
      }
    </script>
  `;

  return layout({ title: status === 'INBOX' ? 'Inbox' : 'Archive', content, scripts });
}

function articleItem(article: ArticleWithTags, currentStatus: 'INBOX' | 'ARCHIVED'): string {
  const isInbox = currentStatus === 'INBOX';

  return `
    <div class="article-item">
      <div class="article-content">
        <h3 class="article-title">
          <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">
            ${escapeHtml(article.title)}
          </a>
          ${article.favorited ? '<span class="favorite">★</span>' : ''}
        </h3>
        <div class="article-meta">
          ${article.siteName ? escapeHtml(article.siteName) + ' • ' : ''}
          ${article.readingMinutes} min read
          ${article.sentToKindleAt ? ' • Sent to Kindle' : ''}
        </div>
        ${article.excerpt ? `<p class="article-excerpt">${escapeHtml(article.excerpt)}</p>` : ''}
        ${article.tags.length > 0 ? `
          <div class="tags">
            ${article.tags.map((t) => `<span class="tag">${escapeHtml(t.tag.name)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="article-actions">
        <button class="btn btn-sm btn-secondary" onclick="toggleFavorite('${article.id}', ${article.favorited})" title="${article.favorited ? 'Unfavorite' : 'Favorite'}">
          ${article.favorited ? '★' : '☆'}
        </button>
        ${isInbox ? `
          <button class="btn btn-sm btn-secondary" onclick="archiveArticle('${article.id}')" title="Archive">
            ✓
          </button>
        ` : `
          <button class="btn btn-sm btn-secondary" onclick="unarchiveArticle('${article.id}')" title="Move to Inbox">
            ↩
          </button>
        `}
        <button class="btn btn-sm btn-secondary" onclick="sendToKindle('${article.id}')" title="Send to Kindle">
          📖
        </button>
      </div>
    </div>
  `;
}
