import { Hono, type Context } from 'hono'
import type { BlogConfig } from '@shared/types'
import {
  extractAttachmentIds,
  extractWikiLinks,
  normalizeLinkKey,
  readingMinutes,
} from '@shared/markdown-utils'
import type { AppBindings } from '../env'
import {
  hasAttachmentStorage,
  readAttachmentObjectStream,
} from '../attachments/backend'
import { attachmentObjectKey, type AttachmentObjectStorage } from '../attachments/keys'
import { getBlogConfig } from '../lib/blog-config'
import { escapeHtml, renderBlogMarkdown, type PublishedWikiTarget } from '../lib/blog-markdown'
import {
  renderBlogIndexPage,
  renderBlogNotFoundPage,
  renderBlogPostPage,
  resolveBlogLocale,
  blogText,
  type BlogPageShellContext,
  type BlogPostCardView,
  type PublicCategoryView,
} from '../lib/blog-template'
import { isValidId } from '../lib/id'
import { isInlineSafe } from '../lib/image'

export const blogPublicRoutes = new Hono<AppBindings>()

interface OwnerRow {
  id: string
  name: string
}

interface PublishedPostListRow {
  note_id: string
  slug: string
  summary: string
  category_folder_id: string | null
  published_at: number | null
  updated_at: number
  title: string
  excerpt: string
  word_count: number
}

interface PublishedPostDetailRow extends PublishedPostListRow {
  content: string
}

export function filterPublicTags(noteTags: readonly string[], config: BlogConfig): string[] {
  const configured = new Set(config.tagList.map((item) => item.trim()).filter(Boolean))
  if (config.tagMode === 'allowlist') {
    return noteTags.filter((tag) => configured.has(tag))
  }
  return noteTags.filter((tag) => !configured.has(tag))
}

function parsePageParam(raw: string | undefined): number {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return 1
  return parsed
}

function encodeContentDispositionFilename(filename: string): string {
  return encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

async function getBlogOwner(db: D1Database): Promise<OwnerRow | null> {
  return db
    .prepare(`SELECT id, name FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1`)
    .first<OwnerRow>()
}

async function loadPublicCategories(
  db: D1Database,
  ownerId: string,
  config: BlogConfig,
): Promise<PublicCategoryView[]> {
  if (config.allowedFolderIds.length === 0) return []
  const placeholders = config.allowedFolderIds.map((_, i) => `?${i + 2}`).join(', ')
  const { results } = await db
    .prepare(
      `SELECT id, name FROM folders
        WHERE user_id = ?1 AND deleted_at IS NULL AND id IN (${placeholders})
        ORDER BY position ASC, name ASC`,
    )
    .bind(ownerId, ...config.allowedFolderIds)
    .all<{ id: string; name: string }>()
  return results
}

async function loadPostTagsMap(
  db: D1Database,
  noteIds: readonly string[],
  config: BlogConfig,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (noteIds.length === 0) return map
  const placeholders = noteIds.map((_, i) => `?${i + 1}`).join(', ')
  const { results } = await db
    .prepare(
      `SELECT nt.note_id, t.name
         FROM note_tags nt
         JOIN tags t ON t.id = nt.tag_id
        WHERE nt.note_id IN (${placeholders})
        ORDER BY t.name ASC`,
    )
    .bind(...noteIds)
    .all<{ note_id: string; name: string }>()

  const grouped = new Map<string, string[]>()
  for (const row of results) {
    const list = grouped.get(row.note_id) ?? []
    list.push(row.name)
    grouped.set(row.note_id, list)
  }
  for (const [noteId, list] of grouped) {
    map.set(noteId, filterPublicTags(list, config))
  }
  return map
}

async function loadAllPublicTags(
  db: D1Database,
  ownerId: string,
  config: BlogConfig,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT t.name
         FROM blog_posts bp
         JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
         JOIN note_tags nt ON nt.note_id = n.id
         JOIN tags t ON t.id = nt.tag_id
        WHERE bp.user_id = ?1 AND bp.published = 1 AND n.deleted_at IS NULL
        ORDER BY t.name ASC`,
    )
    .bind(ownerId)
    .all<{ name: string }>()
  return filterPublicTags(
    results.map((r) => r.name),
    config,
  )
}

async function buildShellContext(
  c: Context<AppBindings>,
  owner: OwnerRow | null,
): Promise<{ config: BlogConfig; ctx: BlogPageShellContext }> {
  const config = await getBlogConfig(c.env.DB)
  const locale = resolveBlogLocale(c.req.header('accept-language'))
  const origin = new URL(c.req.url).origin
  const isOwner = Boolean(owner && c.get('userId') === owner.id)
  const [categories, tags] = owner
    ? await Promise.all([
        loadPublicCategories(c.env.DB, owner.id, config),
        loadAllPublicTags(c.env.DB, owner.id, config),
      ])
    : [[], []]

  return {
    config,
    ctx: {
      origin,
      config,
      categories,
      tags,
      locale,
      isOwner,
    },
  }
}

function toCardViews(
  rows: PublishedPostListRow[],
  categories: PublicCategoryView[],
  tagsMap: Map<string, string[]>,
): BlogPostCardView[] {
  const catMap = new Map(categories.map((c) => [c.id, c]))
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title || 'Untitled',
    summary: row.summary || row.excerpt || '',
    publishedAt: row.published_at ?? row.updated_at,
    updatedAt: row.updated_at,
    readingMinutes: readingMinutes(row.word_count),
    category: row.category_folder_id ? (catMap.get(row.category_folder_id) ?? null) : null,
    tags: tagsMap.get(row.note_id) ?? [],
  }))
}

blogPublicRoutes.get('/', async (c) => {
  const owner = await getBlogOwner(c.env.DB)
  const { config, ctx } = await buildShellContext(c, owner)
  if (!owner) {
    return c.html(
      renderBlogIndexPage({
        ctx,
        posts: [],
        page: 1,
        totalPages: 1,
        basePath: '/',
      }),
    )
  }

  const page = parsePageParam(c.req.query('page'))
  const pageSize = config.pageSize
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total
       FROM blog_posts bp
       JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
      WHERE bp.user_id = ?1 AND bp.published = 1 AND n.deleted_at IS NULL`,
  )
    .bind(owner.id)
    .first<{ total: number }>()
  const total = countRow?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const offset = (safePage - 1) * pageSize

  const { results } = await c.env.DB.prepare(
    `SELECT bp.note_id, bp.slug, bp.summary, bp.category_folder_id, bp.published_at, bp.updated_at,
            n.title, n.excerpt, n.word_count
       FROM blog_posts bp
       JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
      WHERE bp.user_id = ?1 AND bp.published = 1 AND n.deleted_at IS NULL
      ORDER BY COALESCE(bp.published_at, bp.updated_at) DESC, bp.note_id DESC
      LIMIT ?2 OFFSET ?3`,
  )
    .bind(owner.id, pageSize, offset)
    .all<PublishedPostListRow>()

  const tagsMap = await loadPostTagsMap(
    c.env.DB,
    results.map((r) => r.note_id),
    config,
  )

  return c.html(
    renderBlogIndexPage({
      ctx,
      posts: toCardViews(results, ctx.categories, tagsMap),
      page: safePage,
      totalPages,
      basePath: '/',
    }),
  )
})

blogPublicRoutes.get('/category/:folderId', async (c) => {
  const folderId = c.req.param('folderId')
  const owner = await getBlogOwner(c.env.DB)
  const { config, ctx } = await buildShellContext(c, owner)
  const category = ctx.categories.find((cat) => cat.id === folderId)
  if (!owner || !category) {
    return c.html(renderBlogNotFoundPage(ctx), 404)
  }

  const page = parsePageParam(c.req.query('page'))
  const pageSize = config.pageSize
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total
       FROM blog_posts bp
       JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
      WHERE bp.user_id = ?1 AND bp.published = 1 AND bp.category_folder_id = ?2 AND n.deleted_at IS NULL`,
  )
    .bind(owner.id, folderId)
    .first<{ total: number }>()
  const total = countRow?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const offset = (safePage - 1) * pageSize

  const { results } = await c.env.DB.prepare(
    `SELECT bp.note_id, bp.slug, bp.summary, bp.category_folder_id, bp.published_at, bp.updated_at,
            n.title, n.excerpt, n.word_count
       FROM blog_posts bp
       JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
      WHERE bp.user_id = ?1 AND bp.published = 1 AND bp.category_folder_id = ?2 AND n.deleted_at IS NULL
      ORDER BY COALESCE(bp.published_at, bp.updated_at) DESC, bp.note_id DESC
      LIMIT ?3 OFFSET ?4`,
  )
    .bind(owner.id, folderId, pageSize, offset)
    .all<PublishedPostListRow>()

  const tagsMap = await loadPostTagsMap(
    c.env.DB,
    results.map((r) => r.note_id),
    config,
  )

  return c.html(
    renderBlogIndexPage({
      ctx,
      posts: toCardViews(results, ctx.categories, tagsMap),
      page: safePage,
      totalPages,
      basePath: `/category/${encodeURIComponent(folderId)}`,
      heading: category.name,
      activeCategoryId: category.id,
    }),
  )
})

blogPublicRoutes.get('/tag/:tagName', async (c) => {
  const tagName = c.req.param('tagName')
  const owner = await getBlogOwner(c.env.DB)
  const { config, ctx } = await buildShellContext(c, owner)
  if (!owner || filterPublicTags([tagName], config).length === 0) {
    return c.html(renderBlogNotFoundPage(ctx), 404)
  }

  const page = parsePageParam(c.req.query('page'))
  const pageSize = config.pageSize
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total
       FROM blog_posts bp
       JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
       JOIN note_tags nt ON nt.note_id = n.id
       JOIN tags t ON t.id = nt.tag_id
      WHERE bp.user_id = ?1 AND bp.published = 1 AND n.deleted_at IS NULL AND t.name = ?2`,
  )
    .bind(owner.id, tagName)
    .first<{ total: number }>()
  const total = countRow?.total ?? 0
  if (total === 0) {
    return c.html(renderBlogNotFoundPage(ctx), 404)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const offset = (safePage - 1) * pageSize

  const { results } = await c.env.DB.prepare(
    `SELECT bp.note_id, bp.slug, bp.summary, bp.category_folder_id, bp.published_at, bp.updated_at,
            n.title, n.excerpt, n.word_count
       FROM blog_posts bp
       JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
       JOIN note_tags nt ON nt.note_id = n.id
       JOIN tags t ON t.id = nt.tag_id
      WHERE bp.user_id = ?1 AND bp.published = 1 AND n.deleted_at IS NULL AND t.name = ?2
      ORDER BY COALESCE(bp.published_at, bp.updated_at) DESC, bp.note_id DESC
      LIMIT ?3 OFFSET ?4`,
  )
    .bind(owner.id, tagName, pageSize, offset)
    .all<PublishedPostListRow>()

  const tagsMap = await loadPostTagsMap(
    c.env.DB,
    results.map((r) => r.note_id),
    config,
  )

  return c.html(
    renderBlogIndexPage({
      ctx,
      posts: toCardViews(results, ctx.categories, tagsMap),
      page: safePage,
      totalPages,
      basePath: `/tag/${encodeURIComponent(tagName)}`,
      heading: `#${tagName}`,
      activeTag: tagName,
    }),
  )
})

blogPublicRoutes.get('/p/:slug', async (c) => {
  const slug = c.req.param('slug')
  const owner = await getBlogOwner(c.env.DB)
  const { config, ctx } = await buildShellContext(c, owner)
  if (!owner) return c.html(renderBlogNotFoundPage(ctx), 404)

  const row = await c.env.DB.prepare(
    `SELECT bp.note_id, bp.slug, bp.summary, bp.category_folder_id, bp.published_at, bp.updated_at,
            n.title, n.excerpt, n.word_count, n.content
       FROM blog_posts bp
       JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
      WHERE bp.user_id = ?1 AND bp.slug = ?2 AND bp.published = 1 AND n.deleted_at IS NULL`,
  )
    .bind(owner.id, slug)
    .first<PublishedPostDetailRow>()

  if (!row) return c.html(renderBlogNotFoundPage(ctx), 404)

  const wikiKeys = [...new Set(extractWikiLinks(row.content).map((link) => link.key))]
  const publishedLinks = new Map<string, PublishedWikiTarget>()
  const ownerNoteIds = new Map<string, string>()

  if (wikiKeys.length > 0) {
    const placeholders = wikiKeys.map((_, i) => `?${i + 2}`).join(', ')
    const { results } = await c.env.DB.prepare(
      `SELECT n.id, n.title, n.title_key, bp.slug, bp.published
         FROM notes n
         LEFT JOIN blog_posts bp ON bp.note_id = n.id AND bp.user_id = n.user_id
        WHERE n.user_id = ?1 AND n.deleted_at IS NULL AND n.title_key IN (${placeholders})`,
    )
      .bind(owner.id, ...wikiKeys)
      .all<{ id: string; title: string; title_key: string; slug: string | null; published: number | null }>()

    for (const target of results) {
      const key = normalizeLinkKey(target.title_key || target.title)
      if (target.published === 1 && target.slug) {
        publishedLinks.set(key, { slug: target.slug, title: target.title })
      } else if (ctx.isOwner) {
        ownerNoteIds.set(key, target.id)
      }
    }
  }

  const tagsMap = await loadPostTagsMap(c.env.DB, [row.note_id], config)
  const catMap = new Map(ctx.categories.map((cat) => [cat.id, cat]))
  const htmlContent = renderBlogMarkdown(row.content, {
    postSlug: row.slug,
    publishedLinks,
    ownerNoteIds: ctx.isOwner ? ownerNoteIds : undefined,
    unpublishedHint: blogText(ctx.locale, 'blog.public_unpublished_hint'),
  })

  return c.html(
    renderBlogPostPage({
      ctx,
      post: {
        slug: row.slug,
        title: row.title || 'Untitled',
        summary: row.summary || row.excerpt || '',
        publishedAt: row.published_at ?? row.updated_at,
        updatedAt: row.updated_at,
        readingMinutes: readingMinutes(row.word_count),
        category: row.category_folder_id ? (catMap.get(row.category_folder_id) ?? null) : null,
        tags: tagsMap.get(row.note_id) ?? [],
        htmlContent,
      },
    }),
  )
})

blogPublicRoutes.get('/blog-assets/:id', async (c) => {
  const id = c.req.param('id')
  if (!isValidId(id)) return c.text('Not found', 404)

  const owner = await getBlogOwner(c.env.DB)
  if (!owner) return c.text('Not found', 404)

  const attachment = await c.env.DB.prepare(
    `SELECT id, user_id, filename, mime, storage FROM attachments WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(id, owner.id)
    .first<{
      id: string
      user_id: string
      filename: string
      mime: string
      storage: AttachmentObjectStorage
    }>()
  if (!attachment) return c.text('Not found', 404)

  let referenced = false
  const postSlug = c.req.query('post')
  if (postSlug) {
    const postRow = await c.env.DB.prepare(
      `SELECT n.content
         FROM blog_posts bp
         JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
        WHERE bp.user_id = ?1 AND bp.slug = ?2 AND bp.published = 1 AND n.deleted_at IS NULL`,
    )
      .bind(owner.id, postSlug)
      .first<{ content: string }>()
    if (postRow && extractAttachmentIds(postRow.content).includes(id)) {
      referenced = true
    }
  }

  if (!referenced) {
    const { results } = await c.env.DB.prepare(
      `SELECT n.content
         FROM blog_posts bp
         JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
        WHERE bp.user_id = ?1 AND bp.published = 1 AND n.deleted_at IS NULL`,
    )
      .bind(owner.id)
      .all<{ content: string }>()
    referenced = results.some((row) => extractAttachmentIds(row.content).includes(id))
  }

  if (!referenced) return c.text('Not found', 404)
  if (!hasAttachmentStorage(c.env, attachment.storage)) {
    return c.text('Storage unavailable', 503)
  }

  const object = await readAttachmentObjectStream(
    c.env,
    attachment.storage,
    attachmentObjectKey(attachment),
  )
  if (!object) return c.text('Not found', 404)

  return new Response(object.body as BodyInit, {
    headers: {
      'Content-Type': attachment.mime,
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `${isInlineSafe(attachment.mime) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeContentDispositionFilename(attachment.filename)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

blogPublicRoutes.get('/robots.txt', (c) => {
  const origin = new URL(c.req.url).origin
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /app',
    'Disallow: /api/',
    'Disallow: /s/',
    'Disallow: /authorize',
    `Sitemap: ${origin}/sitemap.xml`,
  ].join('\n')
  return c.text(body, 200, { 'Content-Type': 'text/plain; charset=utf-8' })
})

blogPublicRoutes.get('/sitemap.xml', async (c) => {
  const origin = new URL(c.req.url).origin
  const owner = await getBlogOwner(c.env.DB)
  const config = await getBlogConfig(c.env.DB)
  const urls: Array<{ loc: string; lastmod?: string }> = [{ loc: `${origin}/` }]

  if (owner) {
    const categories = await loadPublicCategories(c.env.DB, owner.id, config)
    for (const cat of categories) {
      urls.push({ loc: `${origin}/category/${encodeURIComponent(cat.id)}` })
    }
    const { results } = await c.env.DB.prepare(
      `SELECT bp.slug, bp.updated_at
         FROM blog_posts bp
         JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
        WHERE bp.user_id = ?1 AND bp.published = 1 AND n.deleted_at IS NULL
        ORDER BY COALESCE(bp.published_at, bp.updated_at) DESC`,
    )
      .bind(owner.id)
      .all<{ slug: string; updated_at: number }>()
    for (const post of results) {
      urls.push({
        loc: `${origin}/p/${encodeURIComponent(post.slug)}`,
        lastmod: new Date(post.updated_at).toISOString(),
      })
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (item) =>
      `  <url><loc>${escapeHtml(item.loc)}</loc>${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ''}</url>`,
  )
  .join('\n')}
</urlset>`

  return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
})

blogPublicRoutes.get('/rss.xml', async (c) => {
  const origin = new URL(c.req.url).origin
  const owner = await getBlogOwner(c.env.DB)
  const config = await getBlogConfig(c.env.DB)

  let itemsXml = ''
  if (owner) {
    const { results } = await c.env.DB.prepare(
      `SELECT bp.slug, bp.summary, bp.published_at, bp.updated_at, n.title, n.excerpt
         FROM blog_posts bp
         JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
        WHERE bp.user_id = ?1 AND bp.published = 1 AND n.deleted_at IS NULL
        ORDER BY COALESCE(bp.published_at, bp.updated_at) DESC
        LIMIT 20`,
    )
      .bind(owner.id)
      .all<{
        slug: string
        summary: string
        published_at: number | null
        updated_at: number
        title: string
        excerpt: string
      }>()

    itemsXml = results
      .map((post) => {
        const link = `${origin}/p/${encodeURIComponent(post.slug)}`
        const pubDate = new Date(post.published_at ?? post.updated_at).toUTCString()
        const desc = post.summary || post.excerpt || ''
        return `    <item>
      <title>${escapeHtml(post.title || 'Untitled')}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeHtml(desc)}</description>
    </item>`
      })
      .join('\n')
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(config.title)}</title>
    <link>${escapeHtml(origin)}/</link>
    <description>${escapeHtml(config.subtitle || config.title)}</description>
${itemsXml}
  </channel>
</rss>`

  return c.body(xml, 200, { 'Content-Type': 'application/rss+xml; charset=utf-8' })
})

