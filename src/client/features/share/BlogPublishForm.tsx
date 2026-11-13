import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Globe, Trash2 } from 'lucide-react'
import type { BlogConfig, BlogPostInfo, NoteSummary } from '@shared/types'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'
import { Badge, Button } from '../../components/primitives'
import { Field, Input, Switch } from '../../components/form'
import { Empty, LoadingBlock } from '../../components/feedback'
import { Tooltip, confirm } from '../../components/overlay'

function suggestSlug(title: string, noteId: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return ascii || `post-${noteId.slice(-8).toLowerCase()}`
}

export function BlogPublishForm({
  note,
  onClose,
  onChanged,
}: {
  note: Pick<NoteSummary, 'id' | 'title'>
  onClose: () => void
  onChanged?: () => void
}) {
  const toast = useUi((s) => s.toast)
  const folders = useNotes((s) => s.folders)
  const [post, setPost] = useState<BlogPostInfo | null | undefined>(undefined)
  const [config, setConfig] = useState<BlogConfig | null>(null)
  const [slug, setSlug] = useState('')
  const [published, setPublished] = useState(false)
  const [summary, setSummary] = useState('')
  const [categoryFolderId, setCategoryFolderId] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    setPost(undefined)
    setLoadError(null)
    void Promise.all([
      api.blog.getPost(note.id, controller.signal),
      api.blog.getConfig(controller.signal),
    ])
      .then(([postRes, configRes]) => {
        if (controller.signal.aborted) return
        setConfig(configRes.config)
        setPost(postRes.post)
        if (postRes.post) {
          setSlug(postRes.post.slug)
          setPublished(postRes.post.published)
          setSummary(postRes.post.summary)
          setCategoryFolderId(postRes.post.categoryFolderId ?? '')
        } else {
          setSlug(suggestSlug(note.title, note.id))
          setPublished(true)
          setSummary('')
          setCategoryFolderId('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setLoadError(cause instanceof Error ? cause.message : String(cause))
        }
      })
    return () => controller.abort()
  }, [note.id, note.title])

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const allowedCategories = useMemo(() => {
    if (!config) return []
    const allowed = new Set(config.allowedFolderIds)
    return folders.filter((f) => allowed.has(f.id))
  }, [config, folders])

  const save = async () => {
    setBusy('save')
    try {
      const res = await api.blog.upsertPost(note.id, {
        slug,
        published,
        summary,
        categoryFolderId: categoryFolderId || null,
      })
      setPost(res.post)
      setSlug(res.post.slug)
      setPublished(res.post.published)
      setSummary(res.post.summary)
      setCategoryFolderId(res.post.categoryFolderId ?? '')
      toast({ title: t('blog.post_saved'), tone: 'success' })
      onChanged?.()
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : t('blog.save_post'), tone: 'danger' })
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: t('blog.delete_post'),
      description: t('blog.delete_post_confirm'),
      confirmLabel: t('blog.delete_post'),
      tone: 'danger',
    })
    if (!ok) return
    setBusy('remove')
    try {
      await api.blog.removePost(note.id)
      setPost(null)
      toast({ title: t('blog.post_removed'), tone: 'default' })
      onChanged?.()
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : t('blog.delete_post'), tone: 'danger' })
    } finally {
      setBusy(null)
    }
  }

  const copyUrl = async () => {
    if (!post) return
    try {
      await navigator.clipboard.writeText(post.url)
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1400)
    } catch {
      toast({ title: t('preview.could_not_copy'), tone: 'danger' })
    }
  }

  if (loadError) {
    return <Empty art="notes" compact title={t('blog.posts_title')} description={loadError} />
  }
  if (post === undefined) {
    return <LoadingBlock label={t('common.loading')} />
  }

  return (
    <div className="space-y-4">
      {post && (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3">
          <div className="flex items-center gap-2">
            <Globe size={13} className="shrink-0 text-[var(--accent)]" />
            <input
              aria-label={t('blog.copy_url')}
              readOnly
              value={post.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-[var(--text-secondary)] focus:outline-none"
            />
            <Badge tone={post.published ? 'accent' : 'neutral'}>
              {post.published ? t('blog.status_published') : t('blog.status_draft')}
            </Badge>
            <Button
              size="sm"
              variant={copied ? 'ghost' : 'secondary'}
              icon={copied ? <Check size={12} className="text-[var(--success)]" /> : <Copy size={12} />}
              onClick={() => void copyUrl()}
            >
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
            {post.published && (
              <Tooltip label={t('blog.open_blog')} side="left">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('blog.open_blog')}
                  className="inline-flex size-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <ExternalLink size={13} />
                </a>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 py-1">
        <div className="min-w-0">
          <div className="text-[13px] font-medium">{t('blog.published_switch')}</div>
          <p className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">{t('blog.published_switch_hint')}</p>
        </div>
        <Switch
          checked={published}
          disabled={busy !== null}
          onChange={setPublished}
          label={t('blog.published_switch')}
        />
      </div>

      <Field label={t('blog.slug')} hint={t('blog.slug_hint')}>
        <Input
          value={slug}
          disabled={busy !== null}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="my-first-post"
        />
      </Field>

      <Field label={t('blog.category')}>
        <select
          value={categoryFolderId}
          disabled={busy !== null}
          onChange={(e) => setCategoryFolderId(e.target.value)}
          className="h-9 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[13px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
        >
          <option value="">{t('blog.category_none')}</option>
          {allowedCategories.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
      </Field>

      <Field label={t('blog.summary')}>
        <textarea
          rows={3}
          value={summary}
          disabled={busy !== null}
          maxLength={400}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t('blog.summary_placeholder')}
          className="w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent)] focus:outline-none"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
        {post && (
          <Button
            variant="ghost"
            className="mr-auto text-[var(--danger)]"
            icon={<Trash2 size={13} />}
            loading={busy === 'remove'}
            disabled={busy === 'save'}
            onClick={() => void remove()}
          >
            {t('blog.delete_post')}
          </Button>
        )}
        <Button variant="secondary" disabled={busy !== null} onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          loading={busy === 'save'}
          disabled={busy === 'remove' || !slug.trim()}
          onClick={() => void save()}
        >
          {t('blog.save_post')}
        </Button>
      </div>
    </div>
  )
}
