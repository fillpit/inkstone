import { describe, expect, it } from 'vitest'
import { DEFAULT_BLOG_CONFIG, normalizeBlogConfig } from '../src/worker/lib/blog-config'
import { normalizeBlogSlug } from '../src/worker/routes/blog-manage'

describe('blog config normalization', () => {
  it('falls back to defaults for invalid input', () => {
    expect(normalizeBlogConfig(null)).toEqual(DEFAULT_BLOG_CONFIG)
    expect(normalizeBlogConfig({ title: '  ', pageSize: -5, tagMode: 'other' })).toEqual(DEFAULT_BLOG_CONFIG)
  })

  it('normalizes title, bounds pageSize, and deduplicates folders and tags', () => {
    const config = normalizeBlogConfig({
      title: '  My Tech Notes  ',
      subtitle: '  Writing about systems  ',
      authorName: '  Fei  ',
      pageSize: 120,
      allowedFolderIds: ['f1', 'f2', 'f1', '  '],
      tagMode: 'allowlist',
      tagList: ['tech', 'rust', 'tech', ''],
    })

    expect(config).toEqual({
      title: 'My Tech Notes',
      subtitle: 'Writing about systems',
      authorName: 'Fei',
      pageSize: 50,
      allowedFolderIds: ['f1', 'f2'],
      tagMode: 'allowlist',
      tagList: ['tech', 'rust'],
    })
  })
})

describe('blog slug validation', () => {
  it('accepts lowercase hyphenated slugs and trims whitespace', () => {
    expect(normalizeBlogSlug('  My-First-Post-2026  ')).toBe('my-first-post-2026')
    expect(normalizeBlogSlug('hello')).toBe('hello')
  })

  it('rejects empty, malformed, or overlong slugs', () => {
    expect(() => normalizeBlogSlug('')).toThrow()
    expect(() => normalizeBlogSlug('hello_world')).toThrow()
    expect(() => normalizeBlogSlug('-leading-hyphen')).toThrow()
    expect(() => normalizeBlogSlug('a--b')).toThrow()
    expect(() => normalizeBlogSlug('a'.repeat(121))).toThrow()
  })
})

