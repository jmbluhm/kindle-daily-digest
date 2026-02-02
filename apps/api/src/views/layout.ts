export interface LayoutOptions {
  title: string;
  content: string;
  scripts?: string;
}

export function layout({ title, content, scripts = '' }: LayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Kindle Assist</title>
  <style>
    :root {
      --bg: #f5f5f5;
      --card-bg: #ffffff;
      --text: #333333;
      --text-muted: #666666;
      --border: #e0e0e0;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --success: #16a34a;
      --danger: #dc2626;
      --warning: #ca8a04;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }

    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 16px 0;
      margin-bottom: 24px;
    }

    header .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 0;
      padding-bottom: 0;
    }

    .logo {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text);
      text-decoration: none;
    }

    nav {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    nav a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.9rem;
    }

    nav a:hover {
      color: var(--primary);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
    }

    .btn-primary:hover {
      background: var(--primary-hover);
    }

    .btn-secondary {
      background: var(--border);
      color: var(--text);
    }

    .btn-secondary:hover {
      background: #d1d5db;
    }

    .btn-danger {
      background: var(--danger);
      color: white;
    }

    .btn-sm {
      padding: 4px 10px;
      font-size: 0.8rem;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }

    .article-item {
      display: flex;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid var(--border);
    }

    .article-item:last-child {
      border-bottom: none;
    }

    .article-content {
      flex: 1;
    }

    .article-title {
      font-size: 1rem;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .article-title a {
      color: var(--text);
      text-decoration: none;
    }

    .article-title a:hover {
      color: var(--primary);
    }

    .article-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .article-excerpt {
      font-size: 0.875rem;
      color: var(--text-muted);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .article-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      align-items: flex-start;
    }

    .tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .tag {
      display: inline-block;
      padding: 2px 8px;
      background: #e5e7eb;
      border-radius: 4px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 6px;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.9rem;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .alert {
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 0.875rem;
    }

    .alert-error {
      background: #fef2f2;
      color: var(--danger);
      border: 1px solid #fecaca;
    }

    .alert-success {
      background: #f0fdf4;
      color: var(--success);
      border: 1px solid #bbf7d0;
    }

    .filters {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .filter-btn {
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card-bg);
      color: var(--text-muted);
      font-size: 0.8rem;
      cursor: pointer;
      text-decoration: none;
    }

    .filter-btn:hover,
    .filter-btn.active {
      border-color: var(--primary);
      color: var(--primary);
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
    }

    .favorite {
      color: var(--warning);
    }

    .loading {
      opacity: 0.5;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <a href="/" class="logo">Kindle Assist</a>
      <nav>
        <a href="/">Inbox</a>
        <a href="/?status=ARCHIVED">Archive</a>
        <a href="/tags">Tags</a>
        <form action="/logout" method="POST" style="display: inline;">
          <button type="submit" class="btn btn-secondary btn-sm">Logout</button>
        </form>
      </nav>
    </div>
  </header>
  <main class="container">
    ${content}
  </main>
  ${scripts}
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
