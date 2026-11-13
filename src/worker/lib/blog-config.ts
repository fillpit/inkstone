import type { BlogConfig } from '@shared/types'
import { getMeta, setMeta } from '../db/metadata'

const KEY_BLOG_CONFIG = 'setting:blog_config'

export const DEFAULT_BLOG_CONFIG: BlogConfig = {
  title: 'Inkstone Blog',
  subtitle: '',
  authorName: '',
  pageSize: 10,
  allowedFolderIds: [],
  tagMode: 'blocklist',
  tagList: [],
}

function normalizeStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= limit) break
  }
  return result
}

export function normalizeBlogConfig(raw: unknown): BlogConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<BlogConfig>
  const pageSize = typeof input.pageSize === 'number' && Number.isFinite(input.pageSize) && input.pageSize > 0
    ? Math.min(50, Math.max(1, Math.round(input.pageSize)))
    : DEFAULT_BLOG_CONFIG.pageSize
  return {
    title: typeof input.title === 'string' && input.title.trim()
      ? input.title.trim().slice(0, 80)
      : DEFAULT_BLOG_CONFIG.title,
    subtitle: typeof input.subtitle === 'string' ? input.subtitle.trim().slice(0, 240) : '',
    authorName: typeof input.authorName === 'string' ? input.authorName.trim().slice(0, 60) : '',
    pageSize,
    allowedFolderIds: normalizeStringList(input.allowedFolderIds, 200),
    tagMode: input.tagMode === 'allowlist' ? 'allowlist' : 'blocklist',
    tagList: normalizeStringList(input.tagList, 200),
  }
}

export async function getBlogConfig(db: D1Database): Promise<BlogConfig> {
  const raw = await getMeta(db, KEY_BLOG_CONFIG)
  if (!raw) return { ...DEFAULT_BLOG_CONFIG }
  try {
    return normalizeBlogConfig(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_BLOG_CONFIG }
  }
}

export async function setBlogConfig(db: D1Database, config: BlogConfig): Promise<BlogConfig> {
  const normalized = normalizeBlogConfig(config)
  await setMeta(db, KEY_BLOG_CONFIG, JSON.stringify(normalized))
  return normalized
}
