import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import footnote from 'markdown-it-footnote'
import mark from 'markdown-it-mark'
import taskLists from 'markdown-it-task-lists'
import {
  normalizeLinkKey,
  slugifyHeading,
  splitFrontMatter,
  wikiNoteTarget,
} from '@shared/markdown-utils'

export interface PublishedWikiTarget {
  slug: string
  title: string
}

export interface RenderBlogMarkdownOptions {
  postSlug: string
  publishedLinks: ReadonlyMap<string, PublishedWikiTarget>
  ownerNoteIds?: ReadonlyMap<string, string>
  unpublishedHint: string
}

const WIKI_LINK_RE = /(!?)\[\[([^[\]|\n]{1,400})(?:\|([^[\]\n]{0,200}))?\]\]/g
const FILE_REF_RE = /(?:https?:\/\/[^/\s<>"']+)?\/api\/files\/([0-9a-hjkmnp-tv-z]{26})(?=$|[\s>)\]"'?#])/g
const BLOCK_ID_SUFFIX_RE = /[ \t]+\^[A-Za-z0-9-]{2,64}[ \t]*$/

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
  langPrefix: 'language-',
})

md.use(taskLists, { enabled: true, label: false })
  .use(footnote)
  .use(mark)
  .use(anchor, {
    slugify: slugifyHeading,
    permalink: false,
  })

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripObsidianCommentsPreservingLines(text: string): string {
  return text.replace(/%%[\s\S]*?%%/g, (match) => match.replace(/[^\n]/g, ''))
}

function splitTargetFragment(rawTarget: string): { noteName: string; heading: string | null } {
  const noteName = wikiNoteTarget(rawTarget)
  if (!noteName) return { noteName: '', heading: null }
  const rest = rawTarget.trim().slice(noteName.length)
  if (!rest.startsWith('#')) return { noteName, heading: null }
  const heading = rest.slice(1).trim()
  if (!heading || heading.startsWith('^')) return { noteName, heading: null }
  return { noteName, heading }
}

function transformOutsideInlineCode(
  line: string,
  transform: (segment: string) => string,
): string {
  let out = ''
  let cursor = 0
  let i = 0
  while (i < line.length) {
    if (line[i] === '`') {
      let tickEnd = i + 1
      while (line[tickEnd] === '`') tickEnd++
      const tickLen = tickEnd - i
      let search = tickEnd
      let closeStart = -1
      while (search < line.length) {
        const next = line.indexOf('`', search)
        if (next < 0) break
        let nextEnd = next + 1
        while (line[nextEnd] === '`') nextEnd++
        if (nextEnd - next === tickLen) {
          closeStart = nextEnd
          break
        }
        search = nextEnd
      }
      if (closeStart >= 0) {
        if (i > cursor) out += transform(line.slice(cursor, i))
        out += line.slice(i, closeStart)
        cursor = closeStart
        i = closeStart
        continue
      }
      i = tickEnd
      continue
    }
    i++
  }
  if (cursor < line.length) out += transform(line.slice(cursor))
  return out
}

export function renderBlogMarkdown(
  content: string,
  options: RenderBlogMarkdownOptions,
): string {
  const body = stripObsidianCommentsPreservingLines(splitFrontMatter(content).body)
  const tokenMap = new Map<string, string>()
  let tokenCounter = 0

  const renderWikiPlaceholder = (
    embed: string,
    rawTarget: string,
    rawAlias?: string,
  ): string => {
    const trimmedTarget = rawTarget.trim()
    const { noteName, heading } = splitTargetFragment(trimmedTarget)
    const displayText = rawAlias?.trim() || noteName || trimmedTarget
    if (!displayText) return ''

    const token = `INKSTONEWIKITOKEN${tokenCounter++}END`
    const key = noteName ? normalizeLinkKey(noteName) : ''
    const published = key ? options.publishedLinks.get(key) : undefined

    if (published && !embed) {
      const hash = heading ? `#${slugifyHeading(heading)}` : ''
      tokenMap.set(
        token,
        `<a class="blog-wikilink" href="/p/${encodeURIComponent(published.slug)}${hash}">${escapeHtml(displayText)}</a>`,
      )
      return token
    }

    const ownerNoteId = key ? options.ownerNoteIds?.get(key) : undefined
    const editAttr = ownerNoteId
      ? ` data-edit-url="/app/n/${encodeURIComponent(ownerNoteId)}"`
      : ''
    tokenMap.set(
      token,
      `<button type="button" class="blog-unpublished-link" data-unpublished-link="1"${editAttr} title="${escapeHtml(options.unpublishedHint)}">${escapeHtml(displayText)}</button>`,
    )
    return token
  }

  const lines = body.replace(/\r\n/g, '\n').split('\n')
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0
  const postParam = encodeURIComponent(options.postSlug)

  const processedLines = lines.map((line) => {
    const fence = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      const marker = fence[1]!
      const ch = marker[0]!
      if (!inFence && !(ch === '`' && fence[2]!.includes('`'))) {
        inFence = true
        fenceChar = ch
        fenceLen = marker.length
        return line
      }
      if (ch === fenceChar && marker.length >= fenceLen && !fence[2]!.trim()) {
        inFence = false
        fenceChar = ''
        fenceLen = 0
        return line
      }
    }
    if (inFence) return line

    const strippedBlockId = line.replace(BLOCK_ID_SUFFIX_RE, '')
    return transformOutsideInlineCode(strippedBlockId, (segment) =>
      segment
        .replace(FILE_REF_RE, (_m, id: string) => `/blog-assets/${id}?post=${postParam}`)
        .replace(WIKI_LINK_RE, (_m, embed: string, target: string, alias?: string) =>
          renderWikiPlaceholder(embed, target, alias),
        ),
    )
  })

  let html = md.render(processedLines.join('\n'))
  for (const [token, replacement] of tokenMap) {
    html = html.split(token).join(replacement)
  }
  return html
}

