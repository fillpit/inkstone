import { Hono } from 'hono'
import type { BlogConfig, BlogPostInfo, BlogPostListItem, BlogPostUpsertInput } from '@shared/types'
import type { AppBindings } from '../env'
import { getBlogConfig, setBlogConfig } from '../lib/blog-config'
import { ApiError } from '../lib/errors'
import { JSON_BODY_LIMITS, readJson } from '../lib/request'
import { requireAuth } from '../middleware/auth'

export const blogManageRoutes = new Hono<AppBindings>()

const BLOG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface BlogPostRow {
  note_id: string
  user_id: string
  slug: string
  published: number
  summary: string
  category_folder_id: string | null
  published_at: number | null
  updated_at: number
  created_at: number
}

function toBlogPostInfo(row: BlogPostRow, origin: string): BlogPostInfo {
  return {
    noteId: row.note_id,
    slug: row.slug,
    url: `${origin}/p/${row.slug}`,
    published: Boolean(row.published),
    summary: row.summary,
    categoryFolderId: row.category_folder_id,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
}

export function normalizeBlogSlug(value: unknown): string {
  if (typeof value !== 'string') throw ApiError.badRequest('Invalid blog slug')
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed.length > 120 || !BLOG_SLUG_RE.test(trimmed)) {
    throw ApiError.badRequest('Slug must use lowercase letters, numbers, and hyphens')
  }
  return trimmed
}

blogManageRoutes.use('*', requireAuth)
blogManageRoutes.use('*', async (c, next) => {
  if (c.get('user').role !== 'owner') {
    throw ApiError.forbidden('Only the owner can manage the blog')
  }
  await next()
})

blogManageRoutes.get('/config', async (c) => {
  const config = await getBlogConfig(c.env.DB)
  return c.json({ config })
})

blogManageRoutes.put('/config', async (c) => {
  const body = await readJson<Partial<BlogConfig>>(c, JSON_BODY_LIMITS.settings)
  const saved = await setBlogConfig(c.env.DB, {
    ...(await getBlogConfig(c.env.DB)),
    ...body,
  })
  return c.json({ config: saved })
})

blogManageRoutes.get('/posts', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT bp.note_id, bp.user_id, bp.slug, bp.published, bp.summary, bp.category_folder_id,
            bp.published_at, bp.updated_at, bp.created_at,
            n.title AS note_title, n.deleted_at
       FROM blog_posts bp
       JOIN notes n ON n.id = bp.note_id AND n.user_id = bp.user_id
      WHERE bp.user_id = ?1
      ORDER BY bp.published DESC, bp.published_at DESC, bp.updated_at DESC`,
  )
    .bind(c.get('userId'))
    .all<BlogPostRow & { note_title: string; deleted_at: number | null }>()
  const origin = new URL(c.req.url).origin
  const posts: BlogPostListItem[] = rows.results.map((row) => ({
    ...toBlogPostInfo(row, origin),
    noteTitle: row.note_title,
    deletedAt: row.deleted_at,
  }))
  return c.json({ posts })
})

blogManageRoutes.get('/posts/:noteId', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT * FROM blog_posts WHERE note_id = ?1 AND user_id = ?2`,
  )
    .bind(c.req.param('noteId'), c.get('userId'))
    .first<BlogPostRow>()
  if (!row) return c.json({ post: null })
  return c.json({ post: toBlogPostInfo(row, new URL(c.req.url).origin) })
})

blogManageRoutes.put('/posts/:noteId', async (c) => {
  const noteId = c.req.param('noteId')
  const userId = c.get('userId')
  const note = await c.env.DB.prepare(
    `SELECT id, folder_id FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  )
    .bind(noteId, userId)
    .first<{ id: string; folder_id: string | null }>()
  if (!note) throw ApiError.notFound('Note not found')

  const body = await readJson<BlogPostUpsertInput>(c, JSON_BODY_LIMITS.small)
  const slug = normalizeBlogSlug(body.slug)
  const published = Boolean(body.published)
  const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 400) : ''

  const config = await getBlogConfig(c.env.DB)
  const allowedSet = new Set(config.allowedFolderIds)
  let categoryFolderId: string | null = null
  if (typeof body.categoryFolderId === 'string' && body.categoryFolderId.trim()) {
    const requested = body.categoryFolderId.trim()
    if (!allowedSet.has(requested)) {
      throw ApiError.badRequest('Selected category folder is not enabled for the blog')
    }
    categoryFolderId = requested
  } else if (body.categoryFolderId === undefined && note.folder_id && allowedSet.has(note.folder_id)) {
    categoryFolderId = note.folder_id
  }

  const slugConflict = await c.env.DB.prepare(
    `SELECT note_id FROM blog_posts WHERE slug = ?1 AND note_id != ?2`,
  )
    .bind(slug, noteId)
    .first<{ note_id: string }>()
  if (slugConflict) throw ApiError.conflict('This blog slug is already in use')

  const existing = await c.env.DB.prepare(
    `SELECT * FROM blog_posts WHERE note_id = ?1 AND user_id = ?2`,
  )
    .bind(noteId, userId)
    .first<BlogPostRow>()

  const now = Date.now()
  const publishedAt = published
    ? (existing?.published_at ?? now)
    : (existing?.published_at ?? null)

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE blog_posts
          SET slug = ?1, published = ?2, summary = ?3, category_folder_id = ?4,
              published_at = ?5, updated_at = ?6
        WHERE note_id = ?7 AND user_id = ?8`,
    )
      .bind(slug, published ? 1 : 0, summary, categoryFolderId, publishedAt, now, noteId, userId)
      .run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO blog_posts (note_id, user_id, slug, published, summary, category_folder_id, published_at, updated_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
      .bind(noteId, userId, slug, published ? 1 : 0, summary, categoryFolderId, publishedAt, now, now)
      .run()
  }

  const saved = await c.env.DB.prepare(
    `SELECT * FROM blog_posts WHERE note_id = ?1 AND user_id = ?2`,
  )
    .bind(noteId, userId)
    .first<BlogPostRow>()
  if (!saved) throw new ApiError(500, 'internal', 'Failed to save blog post')
  return c.json({ post: toBlogPostInfo(saved, new URL(c.req.url).origin) })
})

blogManageRoutes.delete('/posts/:noteId', async (c) => {
  await c.env.DB.prepare(
    `DELETE FROM blog_posts WHERE note_id = ?1 AND user_id = ?2`,
  )
    .bind(c.req.param('noteId'), c.get('userId'))
    .run()
  return c.json({ ok: true })
})
