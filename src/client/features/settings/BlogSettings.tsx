import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import type { BlogConfig, BlogPostListItem } from '@shared/types'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'
import { Badge, Button } from '../../components/primitives'
import { Field, Input, Segmented } from '../../components/form'
import { Empty, LoadingBlock } from '../../components/feedback'
import { confirm } from '../../components/overlay'

const DEFAULT_CONFIG: BlogConfig = {
  title: 'Inkstone Blog',
  subtitle: '',
  authorName: '',
  pageSize: 10,
  allowedFolderIds: [],
  tagMode: 'blocklist',
  tagList: [],
}

export function BlogSettings() {
  const toast = useUi((s) => s.toast)
  const folders = useNotes((s) => s.folders)
  const tags = useNotes((s) => s.tags)
  const openNote = useNotes((s) => s.openNote)
  const closePanel = useUi((s) => s.closePanel)

  const [config, setConfig] = useState<BlogConfig>(DEFAULT_CONFIG)
  const [posts, setPosts] = useState<BlogPostListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeFolders = folders

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const [configRes, postsRes] = await Promise.all([
        api.blog.getConfig(signal),
        api.blog.listPosts(signal),
      ])
      if (signal?.aborted) return
      setConfig(configRes.config)
      setPosts(postsRes.posts)
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const toggleFolder = (folderId: string) => {
    setConfig((prev) => ({
      ...prev,
      allowedFolderIds: prev.allowedFolderIds.includes(folderId)
        ? prev.allowedFolderIds.filter((id) => id !== folderId)
        : [...prev.allowedFolderIds, folderId],
    }))
  }

  const toggleTag = (tagName: string) => {
    setConfig((prev) => ({
      ...prev,
      tagList: prev.tagList.includes(tagName)
        ? prev.tagList.filter((item) => item !== tagName)
        : [...prev.tagList, tagName],
    }))
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const res = await api.blog.updateConfig(config)
      setConfig(res.config)
      toast({ title: t('blog.config_saved'), tone: 'success' })
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : t('blog.save_config'), tone: 'danger' })
    } finally {
      setSaving(false)
    }
  }

  const removePost = async (item: BlogPostListItem) => {
    const ok = await confirm({
      title: t('blog.delete_post'),
      description: t('blog.delete_post_confirm'),
      confirmLabel: t('blog.delete_post'),
      tone: 'danger',
    })
    if (!ok) return
    setRemovingId(item.noteId)
    try {
      await api.blog.removePost(item.noteId)
      setPosts((prev) => prev.filter((post) => post.noteId !== item.noteId))
      toast({ title: t('blog.post_removed'), tone: 'default' })
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : t('blog.delete_post'), tone: 'danger' })
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) return <LoadingBlock />
  if (error) {
    return (
      <div className="space-y-3 py-4 text-[12.5px] text-[var(--text-secondary)]">
        <p>{error}</p>
        <Button size="sm" onClick={() => void load()}>{t('common.retry')}</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] text-[var(--text-secondary)]">{t('blog.description')}</p>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-default)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        >
          <ExternalLink size={12} />
          {t('blog.open_blog')}
        </a>
      </div>

      <section className="space-y-3 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('blog.title')}>
            <Input
              value={config.title}
              onChange={(e) => setConfig((prev) => ({ ...prev, title: e.target.value }))}
            />
          </Field>
          <Field label={t('blog.author_name')}>
            <Input
              value={config.authorName}
              onChange={(e) => setConfig((prev) => ({ ...prev, authorName: e.target.value }))}
            />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_140px]">
          <Field label={t('blog.subtitle')}>
            <Input
              value={config.subtitle}
              onChange={(e) => setConfig((prev) => ({ ...prev, subtitle: e.target.value }))}
            />
          </Field>
          <Field label={t('blog.page_size')}>
            <Input
              type="number"
              min={1}
              max={50}
              value={String(config.pageSize)}
              onChange={(e) => {
                const parsed = Number(e.target.value)
                setConfig((prev) => ({
                  ...prev,
                  pageSize: Number.isFinite(parsed) ? parsed : prev.pageSize,
                }))
              }}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-2.5 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div>
          <h3 className="text-[13px] font-medium text-[var(--text-primary)]">{t('blog.categories_title')}</h3>
          <p className="text-[12px] text-[var(--text-tertiary)]">{t('blog.categories_description')}</p>
        </div>
        {activeFolders.length === 0 ? (
          <p className="text-[12px] text-[var(--text-tertiary)]">{t('blog.categories_empty')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activeFolders.map((folder) => {
              const selected = config.allowedFolderIds.includes(folder.id)
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => toggleFolder(folder.id)}
                  className={cn(
                    'rounded-[var(--r-md)] border px-2.5 py-1 text-[12px] transition-colors',
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                  )}
                >
                  {folder.name}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-medium text-[var(--text-primary)]">{t('blog.tags_title')}</h3>
            <p className="text-[12px] text-[var(--text-tertiary)]">{t('blog.tags_description')}</p>
          </div>
          <Segmented
            value={config.tagMode}
            onChange={(value) => setConfig((prev) => ({
              ...prev,
              tagMode: value === 'allowlist' ? 'allowlist' : 'blocklist',
            }))}
            options={[
              { value: 'blocklist', label: t('blog.tag_mode_block') },
              { value: 'allowlist', label: t('blog.tag_mode_allow') },
            ]}
          />
        </div>
        {tags.length === 0 ? (
          <p className="text-[12px] text-[var(--text-tertiary)]">{t('blog.tags_empty')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const selected = config.tagList.includes(tag.name)
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.name)}
                  className={cn(
                    'rounded-[var(--r-md)] border px-2.5 py-1 text-[12px] transition-colors',
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                  )}
                >
                  #{tag.name}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button variant="primary" size="sm" loading={saving} onClick={() => void saveConfig()}>
          {t('blog.save_config')}
        </Button>
      </div>

      <section className="space-y-2.5 border-t border-[var(--border-subtle)] pt-4">
        <h3 className="text-[13px] font-medium text-[var(--text-primary)]">{t('blog.posts_title')}</h3>
        {posts.length === 0 ? (
          <Empty art="notes" compact title={t('blog.posts_empty')} />
        ) : (
          <div className="divide-y divide-[var(--border-subtle)] rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            {posts.map((post) => (
              <div key={post.noteId} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        closePanel()
                        void openNote(post.noteId)
                      }}
                      className="truncate text-left text-[13px] font-medium text-[var(--text-primary)] hover:underline"
                    >
                      {post.noteTitle || t('common.untitled_note')}
                    </button>
                    <Badge tone={post.published ? 'accent' : 'neutral'}>
                      {post.published ? t('blog.status_published') : t('blog.status_draft')}
                    </Badge>
                  </div>
                  <p className="truncate text-[11.5px] text-[var(--text-tertiary)]">{`/p/${post.slug}`}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {post.published && (
                    <a
                      href={`/p/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center rounded-[var(--r-md)] px-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                      aria-label={t('blog.open_blog')}
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={removingId === post.noteId}
                    onClick={() => void removePost(post)}
                    aria-label={t('blog.delete_post')}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
