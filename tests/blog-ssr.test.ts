import { describe, expect, it } from 'vitest'
import { renderBlogMarkdown } from '../src/worker/lib/blog-markdown'
import { filterPublicTags } from '../src/worker/routes/blog-public'
import { DEFAULT_BLOG_CONFIG } from '../src/worker/lib/blog-config'

describe('renderBlogMarkdown', () => {
  it('strips front matter, obsidian comments, block ids, and rewrites file urls outside code', () => {
    const fileId = '01jabcdef0123456789abcdefg'
    const markdown = [
      '---',
      'title: Demo',
      '---',
      'Hello %%secret note%% world ^block-1',
      '',
      `![pic](/api/files/${fileId})`,
      '',
      '```md',
      `![code](/api/files/${fileId})`,
      '[[CodeLink]]',
      '```',
    ].join('\n')

    const html = renderBlogMarkdown(markdown, {
      postSlug: 'demo-post',
      publishedLinks: new Map(),
      unpublishedHint: 'Not published yet',
    })

    expect(html).not.toContain('title: Demo')
    expect(html).not.toContain('secret note')
    expect(html).not.toContain('^block-1')
    expect(html).toContain(`/blog-assets/${fileId}?post=demo-post`)
    expect(html).toContain(`![code](/api/files/${fileId})`)
    expect(html).toContain('[[CodeLink]]')
  })

  it('renders published wikilinks as anchors and unpublished wikilinks as toast buttons without leaking private titles', () => {
    const html = renderBlogMarkdown(
      'See [[Public Note#Section One|My Alias]] and [[Secret Draft|Upcoming Topic]].',
      {
        postSlug: 'main-post',
        publishedLinks: new Map([
          ['public note', { slug: 'public-note', title: 'Public Note' }],
        ]),
        unpublishedHint: 'Unpublished hint',
      },
    )

    expect(html).toContain('<a class="blog-wikilink" href="/p/public-note#sectionone">My Alias</a>')
    expect(html).toContain('class="blog-unpublished-link"')
    expect(html).toContain('data-unpublished-link="1"')
    expect(html).toContain('>Upcoming Topic</button>')
    expect(html).not.toContain('Secret Draft')
    expect(html).not.toContain('data-edit-url')
  })

  it('attaches data-edit-url for unpublished wikilinks only when ownerNoteIds is provided', () => {
    const html = renderBlogMarkdown('Next: [[Future Post]].', {
      postSlug: 'intro',
      publishedLinks: new Map(),
      ownerNoteIds: new Map([['future post', '01jabcdef0123456789abcdefg']]),
      unpublishedHint: 'Drafting',
    })

    expect(html).toContain('data-edit-url="/app/n/01jabcdef0123456789abcdefg"')
  })

  it('escapes raw html in markdown to prevent XSS', () => {
    const html = renderBlogMarkdown('<script>alert(1)</script>', {
      postSlug: 'xss-test',
      publishedLinks: new Map(),
      unpublishedHint: 'Draft',
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

describe('filterPublicTags', () => {
  it('filters tags according to allowlist and blocklist modes', () => {
    const tags = ['tech', 'draft', 'cloudflare', 'diary']
    expect(
      filterPublicTags(tags, {
        ...DEFAULT_BLOG_CONFIG,
        tagMode: 'blocklist',
        tagList: ['draft', 'diary'],
      }),
    ).toEqual(['tech', 'cloudflare'])

    expect(
      filterPublicTags(tags, {
        ...DEFAULT_BLOG_CONFIG,
        tagMode: 'allowlist',
        tagList: ['tech', 'cloudflare'],
      }),
    ).toEqual(['tech', 'cloudflare'])
  })
})
