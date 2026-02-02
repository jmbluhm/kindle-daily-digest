import { layout, escapeHtml } from './layout.js';
import type { Tag } from '@kindle-assist/core';

type TagWithCount = Tag & { _count: { articles: number } };

export function tagsPage(tags: TagWithCount[], message?: string): string {
  const content = `
    ${message ? `<div class="alert alert-success">${escapeHtml(message)}</div>` : ''}

    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>Tags</h2>
        <button class="btn btn-primary" onclick="showAddModal()">+ Add Tag</button>
      </div>

      ${tags.length === 0 ? `
        <div class="empty-state">
          <p>No tags yet. Create one using the button above.</p>
        </div>
      ` : `
        <div style="display: flex; flex-wrap: wrap; gap: 12px;">
          ${tags.map((tag) => `
            <a href="/?status=INBOX&tag=${encodeURIComponent(tag.name)}"
               style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #f3f4f6; border-radius: 6px; text-decoration: none; color: inherit;">
              <span>${escapeHtml(tag.name)}</span>
              <span style="background: #e5e7eb; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem;">
                ${tag._count.articles}
              </span>
            </a>
          `).join('')}
        </div>
      `}
    </div>

    <!-- Add Tag Modal -->
    <div id="addModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100;">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px; border-radius: 8px; width: 90%; max-width: 400px;">
        <h3 style="margin-bottom: 16px;">Add Tag</h3>
        <form method="POST" action="/tags" id="addForm">
          <div class="form-group">
            <label for="name">Tag Name</label>
            <input type="text" id="name" name="name" required placeholder="reading">
          </div>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="hideAddModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Tag</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const scripts = `
    <script>
      function showAddModal() {
        document.getElementById('addModal').style.display = 'block';
        document.getElementById('name').focus();
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
    </script>
  `;

  return layout({ title: 'Tags', content, scripts });
}
