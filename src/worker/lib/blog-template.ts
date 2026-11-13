import type { BlogConfig } from '@shared/types'
import { EN_US_MESSAGES } from '@shared/locales/en-US'
import { ZH_CN_MESSAGES } from '@shared/locales/zh-CN'
import { escapeHtml } from './blog-markdown'

export type BlogLocale = 'zh-CN' | 'en-US'

export interface PublicCategoryView {
  id: string
  name: string
}

export interface BlogPostCardView {
  slug: string
  title: string
  summary: string
  publishedAt: number
  updatedAt: number
  readingMinutes: number
  category: PublicCategoryView | null
  tags: string[]
}

export interface BlogPostDetailView extends BlogPostCardView {
  htmlContent: string
}

export interface BlogPageShellContext {
  origin: string
  config: BlogConfig
  categories: PublicCategoryView[]
  tags: string[]
  locale: BlogLocale
  isOwner: boolean
}

const MESSAGES = {
  'zh-CN': ZH_CN_MESSAGES,
  'en-US': EN_US_MESSAGES,
} as const

type MessageKey = keyof typeof EN_US_MESSAGES

export function resolveBlogLocale(acceptLanguage: string | undefined): BlogLocale {
  if (!acceptLanguage) return 'zh-CN'
  const lower = acceptLanguage.toLowerCase()
  const zhIndex = lower.indexOf('zh')
  const enIndex = lower.indexOf('en')
  if (enIndex >= 0 && (zhIndex < 0 || enIndex < zhIndex)) return 'en-US'
  return 'zh-CN'
}

export function blogText(
  locale: BlogLocale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const dict = MESSAGES[locale] as Record<string, string>
  let text = dict[key] ?? (EN_US_MESSAGES as Record<string, string>)[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}

function formatDate(timestamp: number, locale: BlogLocale): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp))
}

function blogStyles(): string {
  return `
:root {
  color-scheme: light dark;
  --bg: #faf9f7;
  --surface: #ffffff;
  --text: #1c1917;
  --muted: #57534e;
  --subtle: #78716c;
  --border: #e7e5e4;
  --accent: #b45309;
  --accent-soft: rgba(180, 83, 9, 0.1);
  --code-bg: #f5f5f4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141311;
    --surface: #1c1b18;
    --text: #f5f5f4;
    --muted: #d6d3d1;
    --subtle: #a8a29e;
    --border: #292524;
    --accent: #f59e0b;
    --accent-soft: rgba(245, 158, 11, 0.12);
    --code-bg: #242220;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 780px; margin: 0 auto; padding: 24px 20px 64px; }
.site-header {
  border-bottom: 1px solid var(--border);
  padding-bottom: 20px;
  margin-bottom: 32px;
}
.site-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.site-title { font-size: 24px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
.site-subtitle { margin: 6px 0 0; color: var(--muted); font-size: 15px; }
.site-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  margin-top: 14px;
  font-size: 13.5px;
}
.site-nav a { color: var(--muted); }
.site-nav a.active { color: var(--accent); font-weight: 600; }
.workspace-link {
  font-size: 12.5px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  color: var(--muted);
}
.post-list { display: flex; flex-direction: column; gap: 22px; }
.post-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 22px;
}
.post-card-title { margin: 0; font-size: 20px; line-height: 1.35; }
.post-card-title a { color: var(--text); }
.post-card-title a:hover { color: var(--accent); text-decoration: none; }
.post-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--subtle);
}
.post-summary { margin: 12px 0 0; color: var(--muted); font-size: 14.5px; }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.tag-pill, .cat-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}
.cat-pill { font-weight: 500; }
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 14px;
}
.article-header { margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.article-title { margin: 0; font-size: 30px; line-height: 1.25; letter-spacing: -0.02em; }
.article-body { font-size: 16px; word-break: break-word; }
.article-body h1, .article-body h2, .article-body h3, .article-body h4 { margin: 1.8em 0 0.7em; line-height: 1.3; }
.article-body p, .article-body ul, .article-body ol, .article-body blockquote, .article-body pre, .article-body table { margin: 1em 0; }
.article-body img { max-width: 100%; height: auto; border-radius: 8px; }
.article-body blockquote {
  border-left: 3px solid var(--accent);
  margin-left: 0;
  padding: 4px 16px;
  color: var(--muted);
  background: var(--code-bg);
  border-radius: 0 8px 8px 0;
}
.article-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.88em;
  background: var(--code-bg);
  padding: 2px 5px;
  border-radius: 4px;
}
.article-body pre {
  background: var(--code-bg);
  padding: 14px 16px;
  border-radius: 8px;
  overflow-x: auto;
}
.article-body pre code { background: none; padding: 0; }
.article-body table { width: 100%; border-collapse: collapse; }
.article-body th, .article-body td { border: 1px solid var(--border); padding: 8px 10px; text-align: left; }
.blog-unpublished-link {
  appearance: none;
  background: none;
  border: 0;
  border-bottom: 1px dashed var(--subtle);
  padding: 0 1px;
  margin: 0;
  font: inherit;
  color: var(--subtle);
  cursor: pointer;
}
.blog-unpublished-link:hover { color: var(--accent); border-bottom-color: var(--accent); }
.blog-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  background: var(--text);
  color: var(--bg);
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 13.5px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 999;
  max-width: calc(100vw - 32px);
}
.blog-toast a { color: var(--accent); font-weight: 600; white-space: nowrap; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.empty-box { padding: 48px 20px; text-align: center; color: var(--subtle); background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
.site-footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--border); font-size: 12.5px; color: var(--subtle); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
`
}

function toastScript(editLabel: string, defaultHint: string): string {
  return `<script>
(function(){
  var timer = 0;
  var box = null;
  function showHint(editUrl) {
    if (box) box.remove();
    box = document.createElement('div');
    box.className = 'blog-toast';
    box.setAttribute('role', 'status');
    var msg = document.createElement('span');
    msg.textContent = ${JSON.stringify(defaultHint)};
    box.appendChild(msg);
    if (editUrl) {
      var link = document.createElement('a');
      link.href = editUrl;
      link.textContent = ${JSON.stringify(editLabel)};
      box.appendChild(link);
    }
    document.body.appendChild(box);
    clearTimeout(timer);
    timer = setTimeout(function(){ if (box) { box.remove(); box = null; } }, 3200);
  }
  document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-unpublished-link]') : null;
    if (!btn) return;
    e.preventDefault();
    showHint(btn.getAttribute('data-edit-url') || '');
  });
})();
</script>`
}

function renderDocument(params: {
  ctx: BlogPageShellContext
  title: string
  description: string
  canonicalUrl: string
  ogType: 'website' | 'article'
  activeCategoryId?: string | null
  activeTag?: string | null
  extraHead?: string
  bodyHtml: string
  includeToastScript?: boolean
}): string {
  const { ctx } = params
  const siteTitle = ctx.config.title
  const fullTitle = params.title === siteTitle ? siteTitle : `${params.title} · ${siteTitle}`
  const editLabel = blogText(ctx.locale, 'blog.public_edit_in_app')
  const hint = blogText(ctx.locale, 'blog.public_unpublished_hint')

  const navCategories = ctx.categories
    .map((cat) => {
      const active = params.activeCategoryId === cat.id ? ' class="active"' : ''
      return `<a href="/category/${encodeURIComponent(cat.id)}"${active}>${escapeHtml(cat.name)}</a>`
    })
    .join('')

  return `<!doctype html>
<html lang="${ctx.locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(params.description)}" />
  <link rel="canonical" href="${escapeHtml(params.canonicalUrl)}" />
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(siteTitle)}" href="${escapeHtml(ctx.origin)}/rss.xml" />
  <meta property="og:type" content="${params.ogType}" />
  <meta property="og:title" content="${escapeHtml(params.title)}" />
  <meta property="og:description" content="${escapeHtml(params.description)}" />
  <meta property="og:url" content="${escapeHtml(params.canonicalUrl)}" />
  <meta property="og:site_name" content="${escapeHtml(siteTitle)}" />
  <meta name="twitter:card" content="summary" />
  ${params.extraHead ?? ''}
  <style>${blogStyles()}</style>
</head>
<body>
  <div class="wrap">
    <header class="site-header">
      <div class="site-top">
        <a class="site-title" href="/">${escapeHtml(siteTitle)}</a>
        ${ctx.isOwner ? `<a class="workspace-link" href="/app">${escapeHtml(blogText(ctx.locale, 'blog.public_workspace'))}</a>` : ''}
      </div>
      ${ctx.config.subtitle ? `<p class="site-subtitle">${escapeHtml(ctx.config.subtitle)}</p>` : ''}
      <nav class="site-nav" aria-label="Blog navigation">
        <a href="/"${!params.activeCategoryId && !params.activeTag ? ' class="active"' : ''}>${escapeHtml(blogText(ctx.locale, 'blog.public_all_posts'))}</a>
        ${navCategories}
        <a href="/rss.xml">${escapeHtml(blogText(ctx.locale, 'blog.public_rss'))}</a>
      </nav>
    </header>
    <main>
      ${params.bodyHtml}
    </main>
    <footer class="site-footer">
      <span>${escapeHtml(ctx.config.authorName || siteTitle)}</span>
      <span><a href="/rss.xml">${escapeHtml(blogText(ctx.locale, 'blog.public_rss'))}</a> · <a href="/sitemap.xml">Sitemap</a></span>
    </footer>
  </div>
  ${params.includeToastScript ? toastScript(editLabel, hint) : ''}
</body>
</html>`
}

export function renderBlogIndexPage(params: {
  ctx: BlogPageShellContext
  posts: BlogPostCardView[]
  page: number
  totalPages: number
  basePath: string
  heading?: string
  activeCategoryId?: string | null
  activeTag?: string | null
}): string {
  const { ctx, posts, page, totalPages, basePath } = params
  const tagCloud = ctx.tags.length > 0
    ? `<div class="tag-cloud" aria-label="${escapeHtml(blogText(ctx.locale, 'blog.public_tags'))}">
        ${ctx.tags
          .map((tag) => {
            const active = params.activeTag === tag ? ' style="font-weight:700;outline:1px solid var(--accent);"' : ''
            return `<a class="tag-pill" href="/tag/${encodeURIComponent(tag)}"${active}>#${escapeHtml(tag)}</a>`
          })
          .join('')}
      </div>`
    : ''

  const headingHtml = params.heading
    ? `<h1 style="margin:0 0 18px;font-size:22px;">${escapeHtml(params.heading)}</h1>`
    : ''

  const listHtml = posts.length === 0
    ? `<div class="empty-box">${escapeHtml(blogText(ctx.locale, 'blog.public_empty'))}</div>`
    : `<div class="post-list">
        ${posts
          .map((post) => {
            const catHtml = post.category
              ? `<a class="cat-pill" href="/category/${encodeURIComponent(post.category.id)}">${escapeHtml(post.category.name)}</a>`
              : ''
            const tagsHtml = post.tags.length > 0
              ? `<div class="tag-list">${post.tags
                  .map((tag) => `<a class="tag-pill" href="/tag/${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a>`)
                  .join('')}</div>`
              : ''
            return `<article class="post-card">
              <h2 class="post-card-title"><a href="/p/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h2>
              <div class="post-meta">
                <time datetime="${new Date(post.publishedAt).toISOString()}">${escapeHtml(formatDate(post.publishedAt, ctx.locale))}</time>
                <span>${escapeHtml(blogText(ctx.locale, 'blog.public_min_read', { count: post.readingMinutes }))}</span>
                ${catHtml}
              </div>
              ${post.summary ? `<p class="post-summary">${escapeHtml(post.summary)}</p>` : ''}
              ${tagsHtml}
            </article>`
          })
          .join('')}
      </div>`

  const pageUrl = (targetPage: number) =>
    targetPage <= 1 ? basePath : `${basePath}?page=${targetPage}`

  const paginationHtml = totalPages > 1
    ? `<nav class="pagination" aria-label="Pagination">
        ${page > 1 ? `<a href="${escapeHtml(pageUrl(page - 1))}">← ${escapeHtml(blogText(ctx.locale, 'blog.public_prev_page'))}</a>` : '<span></span>'}
        <span>${page} / ${totalPages}</span>
        ${page < totalPages ? `<a href="${escapeHtml(pageUrl(page + 1))}">${escapeHtml(blogText(ctx.locale, 'blog.public_next_page'))} →</a>` : '<span></span>'}
      </nav>`
    : ''

  const pageTitle = params.heading || ctx.config.title
  const canonicalUrl = page > 1 ? `${ctx.origin}${basePath}?page=${page}` : `${ctx.origin}${basePath}`
  const description = ctx.config.subtitle || ctx.config.title

  return renderDocument({
    ctx,
    title: pageTitle,
    description,
    canonicalUrl,
    ogType: 'website',
    activeCategoryId: params.activeCategoryId,
    activeTag: params.activeTag,
    bodyHtml: `${headingHtml}${tagCloud}${listHtml}${paginationHtml}`,
  })
}

export function renderBlogPostPage(params: {
  ctx: BlogPageShellContext
  post: BlogPostDetailView
}): string {
  const { ctx, post } = params
  const canonicalUrl = `${ctx.origin}/p/${encodeURIComponent(post.slug)}`
  const authorName = ctx.config.authorName || ctx.config.title
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    datePublished: new Date(post.publishedAt).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    author: { '@type': 'Person', name: authorName },
    mainEntityOfPage: canonicalUrl,
  }).replace(/</g, '\\u003c')

  const catHtml = post.category
    ? `<a class="cat-pill" href="/category/${encodeURIComponent(post.category.id)}">${escapeHtml(post.category.name)}</a>`
    : ''
  const tagsHtml = post.tags.length > 0
    ? `<div class="tag-list">${post.tags
        .map((tag) => `<a class="tag-pill" href="/tag/${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a>`)
        .join('')}</div>`
    : ''

  const bodyHtml = `<article>
    <header class="article-header">
      <h1 class="article-title">${escapeHtml(post.title)}</h1>
      <div class="post-meta">
        <time datetime="${new Date(post.publishedAt).toISOString()}">${escapeHtml(formatDate(post.publishedAt, ctx.locale))}</time>
        <span>${escapeHtml(blogText(ctx.locale, 'blog.public_updated', { date: formatDate(post.updatedAt, ctx.locale) }))}</span>
        <span>${escapeHtml(blogText(ctx.locale, 'blog.public_min_read', { count: post.readingMinutes }))}</span>
        ${catHtml}
      </div>
      ${tagsHtml}
    </header>
    <div class="article-body">${post.htmlContent}</div>
    <div class="pagination">
      <a href="/">← ${escapeHtml(blogText(ctx.locale, 'blog.public_back_home'))}</a>
    </div>
  </article>`

  return renderDocument({
    ctx,
    title: post.title,
    description: post.summary || post.title,
    canonicalUrl,
    ogType: 'article',
    activeCategoryId: post.category?.id ?? null,
    extraHead: `<script type="application/ld+json">${jsonLd}</script>`,
    bodyHtml,
    includeToastScript: true,
  })
}

export function renderBlogNotFoundPage(ctx: BlogPageShellContext): string {
  const title = blogText(ctx.locale, 'blog.public_not_found_title')
  const body = blogText(ctx.locale, 'blog.public_not_found_body')
  const back = blogText(ctx.locale, 'blog.public_back_home')
  return renderDocument({
    ctx,
    title,
    description: body,
    canonicalUrl: ctx.origin,
    ogType: 'website',
    extraHead: '<meta name="robots" content="noindex, nofollow" />',
    bodyHtml: `<div class="empty-box">
      <h1 style="margin:0 0 10px;font-size:22px;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 18px;">${escapeHtml(body)}</p>
      <a href="/">${escapeHtml(back)}</a>
    </div>`,
  })
}

