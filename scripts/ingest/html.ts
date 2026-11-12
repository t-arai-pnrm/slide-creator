/**
 * 公開された記事の HTML から、本文をマークダウンにする。
 * 依存を足さずに書いた小さな解析器なので、ブラウザと同じ解析はしない。
 * 静的サイトのジェネレーターが出す、閉じタグのそろった HTML を前提にする
 */

export type HtmlElement = {
	type: 'element'
	tag: string
	attrs: Record<string, string>
	children: HtmlNode[]
}
export type HtmlText = { type: 'text'; value: string }
export type HtmlNode = HtmlElement | HtmlText

const VOID_TAGS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'source',
	'track',
	'wbr',
])
// 中身をタグとして読まない要素。script の JSON-LD から著者を読むので、中身は文字として残す
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title'])
// 開いている p を閉じる要素（HTML の仕様の、p の終了タグを省略できる条件から、記事に出るものを選んだ）
const CLOSES_P = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'details',
	'div',
	'dl',
	'figure',
	'footer',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hr',
	'main',
	'nav',
	'ol',
	'p',
	'pre',
	'section',
	'table',
	'ul',
])
// 終了タグを省略できる要素と、その要素を探すのを止める親（例: 新しい li は、同じ ul の中の開いている li を閉じる）
const IMPLIED_END: Record<string, { closes: string[]; scope: string[] }> = {
	li: { closes: ['li'], scope: ['ul', 'ol', 'menu'] },
	dt: { closes: ['dt', 'dd'], scope: ['dl'] },
	dd: { closes: ['dt', 'dd'], scope: ['dl'] },
	tr: { closes: ['tr', 'td', 'th'], scope: ['table', 'thead', 'tbody', 'tfoot'] },
	td: { closes: ['td', 'th'], scope: ['tr', 'table'] },
	th: { closes: ['td', 'th'], scope: ['tr', 'table'] },
	option: { closes: ['option'], scope: ['select', 'datalist'] },
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	copy: '©',
	reg: '®',
	trade: '™',
	hellip: '…',
	mdash: '—',
	ndash: '–',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
	laquo: '«',
	raquo: '»',
	middot: '·',
	bull: '•',
	times: '×',
	divide: '÷',
	larr: '←',
	rarr: '→',
	uarr: '↑',
	darr: '↓',
	yen: '¥',
	deg: '°',
	plusmn: '±',
	shy: '',
	zwj: '‍',
	zwnj: '‌',
}

export const decodeEntities = (text: string): string =>
	text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, name: string) => {
		if (name.startsWith('#')) {
			const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
			return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
		}
		return NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? match
	})

const element = (tag: string, attrs: Record<string, string> = {}): HtmlElement => ({
	type: 'element',
	tag,
	attrs,
	children: [],
})

const START_TAG = /<([a-zA-Z][\w:-]*)/y
const END_TAG = /<\/([a-zA-Z][\w:-]*)[^>]*>/y
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y

export const parseHtml = (html: string): HtmlElement => {
	const root = element('#root')
	const stack: HtmlElement[] = [root]
	const current = (): HtmlElement => stack.at(-1) ?? root
	const append = (node: HtmlNode) => current().children.push(node)
	const popTo = (index: number) => {
		// 根は閉じない
		stack.length = Math.max(index, 1)
	}
	const closeImplied = (tag: string) => {
		if (CLOSES_P.has(tag) && current().tag === 'p') stack.pop()
		const rule = IMPLIED_END[tag]
		if (rule === undefined) return
		for (let index = stack.length - 1; index > 0; index--) {
			const open = stack[index]
			if (open === undefined || rule.scope.includes(open.tag)) return
			if (rule.closes.includes(open.tag)) {
				popTo(index)
				return
			}
		}
	}

	let position = 0
	while (position < html.length) {
		const lt = html.indexOf('<', position)
		if (lt === -1) {
			append({ type: 'text', value: decodeEntities(html.slice(position)) })
			break
		}
		if (lt > position) append({ type: 'text', value: decodeEntities(html.slice(position, lt)) })
		position = lt

		if (html.startsWith('<!--', position)) {
			const end = html.indexOf('-->', position + 4)
			position = end === -1 ? html.length : end + 3
			continue
		}
		const next = html[position + 1]
		if (next === '!' || next === '?') {
			const end = html.indexOf('>', position)
			position = end === -1 ? html.length : end + 1
			continue
		}
		if (next === '/') {
			END_TAG.lastIndex = position
			const match = END_TAG.exec(html)
			if (match === null) {
				append({ type: 'text', value: '<' })
				position += 1
				continue
			}
			const tag = (match[1] ?? '').toLowerCase()
			const index = stack.findLastIndex((open) => open.tag === tag)
			if (index > 0) popTo(index)
			position = END_TAG.lastIndex
			continue
		}

		START_TAG.lastIndex = position
		const start = START_TAG.exec(html)
		if (start === null) {
			append({ type: 'text', value: '<' })
			position += 1
			continue
		}
		const tag = (start[1] ?? '').toLowerCase()
		const attrs: Record<string, string> = {}
		position = START_TAG.lastIndex
		let selfClosing = false
		while (position < html.length) {
			const char = html[position] ?? ''
			if (char === '>') {
				position += 1
				break
			}
			if (char === '/') {
				selfClosing = html[position + 1] === '>'
				position += 1
				continue
			}
			if (/\s/.test(char)) {
				position += 1
				continue
			}
			ATTRIBUTE.lastIndex = position
			const attribute = ATTRIBUTE.exec(html)
			if (attribute === null) {
				position += 1
				continue
			}
			const name = (attribute[1] ?? '').toLowerCase()
			attrs[name] = decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? '')
			position = ATTRIBUTE.lastIndex
		}

		closeImplied(tag)
		const node = element(tag, attrs)
		append(node)
		if (RAW_TEXT_TAGS.has(tag)) {
			const close = html.toLowerCase().indexOf(`</${tag}`, position)
			const end = close === -1 ? html.length : close
			const text = html.slice(position, end)
			node.children.push({ type: 'text', value: tag === 'script' || tag === 'style' ? text : decodeEntities(text) })
			const closeEnd = close === -1 ? html.length : html.indexOf('>', close)
			position = closeEnd === -1 ? html.length : closeEnd + 1
			continue
		}
		if (!VOID_TAGS.has(tag) && !selfClosing) stack.push(node)
	}
	return root
}

export const findAll = (root: HtmlElement, test: (element: HtmlElement) => boolean): HtmlElement[] => {
	const found: HtmlElement[] = []
	const visit = (node: HtmlElement) => {
		for (const child of node.children) {
			if (child.type !== 'element') continue
			if (test(child)) found.push(child)
			visit(child)
		}
	}
	visit(root)
	return found
}

export const find = (root: HtmlElement, test: (element: HtmlElement) => boolean): HtmlElement | undefined =>
	findAll(root, test)[0]

export const textContent = (node: HtmlNode): string =>
	node.type === 'text' ? node.value : node.children.map((child) => textContent(child)).join('')

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

// ---- 記事の情報 ----

export type ArticleMeta = { title?: string; author?: string; published?: string; siteName?: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

// JSON-LD の author は、文字列、{ name }、その配列のどれでも書ける
const authorName = (value: unknown): string | undefined => {
	if (typeof value === 'string') return value
	if (Array.isArray(value)) {
		const names = value.map((item) => authorName(item)).filter((name) => name !== undefined)
		return names.length > 0 ? names.join(', ') : undefined
	}
	if (isRecord(value) && typeof value['name'] === 'string') return value['name']
	return undefined
}

const readJsonLd = (doc: HtmlElement): ArticleMeta => {
	const meta: ArticleMeta = {}
	const visit = (value: unknown) => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item)
			return
		}
		if (!isRecord(value)) return
		const author = authorName(value['author'])
		if (author !== undefined) meta.author ??= author
		if (typeof value['headline'] === 'string') meta.title ??= value['headline']
		if (typeof value['datePublished'] === 'string') meta.published ??= value['datePublished']
		visit(value['@graph'])
	}
	for (const script of findAll(doc, (el) => el.tag === 'script' && el.attrs['type'] === 'application/ld+json')) {
		try {
			const data: unknown = JSON.parse(textContent(script))
			visit(data)
		} catch {
			// 壊れた JSON-LD は飛ばし、meta 要素の値を使う
		}
	}
	return meta
}

export const readMeta = (doc: HtmlElement): ArticleMeta => {
	const values = new Map<string, string>()
	for (const meta of findAll(doc, (el) => el.tag === 'meta')) {
		const key = meta.attrs['property'] ?? meta.attrs['name']
		const content = meta.attrs['content']
		if (key !== undefined && content !== undefined && !values.has(key.toLowerCase()))
			values.set(key.toLowerCase(), content.trim())
	}
	const jsonLd = readJsonLd(doc)
	// article:author は URL で書くサイトがあるので、名前として読めるものだけを使う
	const articleAuthor = values.get('article:author')
	const relAuthor = find(doc, (el) => el.tag === 'a' && (el.attrs['rel'] ?? '').split(/\s+/).includes('author'))
	const author =
		values.get('author') ??
		jsonLd.author ??
		(articleAuthor !== undefined && !/^https?:/.test(articleAuthor) ? articleAuthor : undefined) ??
		(relAuthor === undefined ? undefined : collapse(textContent(relAuthor)) || undefined)
	const titleElement = find(doc, (el) => el.tag === 'title')
	const meta: ArticleMeta = {}
	const title =
		values.get('og:title') ??
		jsonLd.title ??
		(titleElement === undefined ? undefined : collapse(textContent(titleElement)) || undefined)
	if (title !== undefined) meta.title = title
	if (author !== undefined) meta.author = author
	const published = values.get('article:published_time') ?? jsonLd.published
	if (published !== undefined) meta.published = published
	const siteName = values.get('og:site_name')
	if (siteName !== undefined) meta.siteName = siteName
	return meta
}

// ---- 本文の場所 ----

/**
 * 本文を包む要素を選ぶ。article のうち文字のいちばん多いものを選び、それが main の文字の 4 割に満たなければ main を選ぶ。
 * 関連記事やコメントのカードも article で書くサイトがあり、カードだけのときに本文を取り逃がさないため
 */
export const findContentRoot = (doc: HtmlElement): HtmlElement => {
	const length = (el: HtmlElement) => collapse(textContent(el)).length
	const body = find(doc, (el) => el.tag === 'body') ?? doc
	const main = find(body, (el) => el.tag === 'main' || el.attrs['role'] === 'main') ?? body
	const articles = findAll(main, (el) => el.tag === 'article')
	let best: HtmlElement | undefined
	for (const article of articles) if (best === undefined || length(article) > length(best)) best = article
	if (best !== undefined && length(best) >= length(main) * 0.4) return best
	return main
}

// ---- マークダウンへの変換 ----

export type ImageRef = { url: string; path: string; alt: string }

// 本文ではないので捨てる要素。footer は記事の中でも共有ボタンやタグの一覧に使われることが多いので捨てる
const DROPPED_TAGS = new Set([
	'script',
	'style',
	'noscript',
	'template',
	'nav',
	'form',
	'button',
	'dialog',
	'input',
	'select',
	'textarea',
	'footer',
	'link',
	'meta',
	'head',
])
const BLOCK_TAGS = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'body',
	'dd',
	'details',
	'div',
	'dl',
	'dt',
	'figcaption',
	'figure',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hgroup',
	'hr',
	'li',
	'main',
	'ol',
	'p',
	'pre',
	'section',
	'summary',
	'table',
	'ul',
])

const isDropped = (el: HtmlElement): boolean =>
	DROPPED_TAGS.has(el.tag) || 'hidden' in el.attrs || el.attrs['aria-hidden'] === 'true'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'])

// 拡張子の分からない URL（画像の変換の API など）は、png として仮に置く。取り込みの側で Content-Type を見て付け直す
export const guessImageExtension = (url: URL): string => {
	const match = /\.[a-z0-9]+$/i.exec(url.pathname)
	const fromPath = match?.[0].toLowerCase()
	if (fromPath !== undefined && IMAGE_EXTENSIONS.has(fromPath)) return fromPath === '.jpeg' ? '.jpg' : fromPath
	const format = url.searchParams.get('f') ?? url.searchParams.get('format') ?? url.searchParams.get('fm')
	if (format !== null && IMAGE_EXTENSIONS.has(`.${format.toLowerCase()}`)) return `.${format.toLowerCase()}`
	return '.png'
}

const imageBaseName = (url: URL): string => {
	const last = url.pathname.split('/').findLast((segment) => segment !== '') ?? 'image'
	const name = decodeURIComponent(last)
		.replace(/\.[a-z0-9]+$/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
	return name === '' ? 'image' : name
}

// srcset に幅の候補があれば、いちばん大きいものを選ぶ。スライドでは記事の本文より大きく映すため
const pickImageSource = (img: HtmlElement): string | undefined => {
	const srcset = img.attrs['srcset'] ?? img.attrs['data-srcset']
	if (srcset !== undefined) {
		let best: { url: string; size: number } | undefined
		for (const candidate of srcset.split(',')) {
			const [url, descriptor = '1x'] = candidate.trim().split(/\s+/)
			if (url === undefined || url === '') continue
			const size = Number.parseFloat(descriptor)
			if (best === undefined || size > best.size) best = { url, size: Number.isNaN(size) ? 0 : size }
		}
		if (best !== undefined) return best.url
	}
	return img.attrs['src'] ?? img.attrs['data-src']
}

const escapeLinkText = (text: string): string => text.replace(/([[\]])/g, '\\$1')

const codeFence = (code: string): string => {
	const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((match) => match[0].length))
	return '`'.repeat(Math.max(3, longest + 1))
}

const inlineCode = (code: string): string => {
	const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((match) => match[0].length))
	const ticks = '`'.repeat(longest + 1)
	const padding = code.startsWith('`') || code.endsWith('`') ? ' ' : ''
	return `${ticks}${padding}${code}${padding}${ticks}`
}

const codeLanguage = (pre: HtmlElement): string => {
	const code = pre.children.find((child): child is HtmlElement => child.type === 'element' && child.tag === 'code')
	for (const el of [pre, code]) {
		if (el === undefined) continue
		const data = el.attrs['data-language'] ?? el.attrs['data-lang']
		if (data !== undefined && data !== '') return data
		const match = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(el.attrs['class'] ?? '')
		if (match?.[1] !== undefined) return match[1]
	}
	return ''
}

// コードの強調の仕組みには、行を改行の文字でなく div で区切るものがある（Expressive Code など）。その div の後ろに改行を補う
const preText = (node: HtmlNode): string => {
	if (node.type === 'text') return node.value
	if (isDropped(node)) return ''
	if (node.tag === 'br') return '\n'
	const text = node.children.map((child) => preText(child)).join('')
	return (node.tag === 'div' || node.tag === 'p') && !text.endsWith('\n') ? `${text}\n` : text
}

const prefixLines = (text: string, first: string, rest: string): string =>
	text
		.split('\n')
		.map((line, index) => (line === '' ? line : `${index === 0 ? first : rest}${line}`))
		.join('\n')

export const htmlToMarkdown = (root: HtmlElement, baseUrl: string): { markdown: string; images: ImageRef[] } => {
	const images: ImageRef[] = []

	const resolve = (href: string): string => {
		try {
			return new URL(href, baseUrl).href
		} catch {
			return href
		}
	}

	const image = (img: HtmlElement): string => {
		const alt = collapse(img.attrs['alt'] ?? '')
		const source = pickImageSource(img)
		if (source === undefined || source.startsWith('data:')) return alt === '' ? '' : `（画像: ${alt}）`
		const url = resolve(source)
		let ref = images.find((existing) => existing.url === url)
		if (ref === undefined) {
			let parsed: URL
			try {
				parsed = new URL(url)
			} catch {
				return alt === '' ? '' : `（画像: ${alt}）`
			}
			const number = String(images.length + 1).padStart(2, '0')
			ref = { url, path: `./images/${number}-${imageBaseName(parsed)}${guessImageExtension(parsed)}`, alt }
			images.push(ref)
		}
		return `![${escapeLinkText(alt)}](${ref.path})`
	}

	const inline = (nodes: HtmlNode[]): string => nodes.map((node) => inlineNode(node)).join('')

	const wrap = (text: string, mark: string): string => {
		const trimmed = text.trim()
		if (trimmed === '') return text
		const leading = text.slice(0, text.length - text.trimStart().length)
		const trailing = text.slice(text.trimEnd().length)
		return `${leading}${mark}${trimmed}${mark}${trailing}`
	}

	const inlineNode = (node: HtmlNode): string => {
		if (node.type === 'text') return node.value.replace(/\s+/g, ' ')
		if (isDropped(node)) return ''
		switch (node.tag) {
			case 'br':
				return '\n'
			case 'img':
				return image(node)
			case 'svg':
				return ''
			case 'source':
				return ''
			case 'strong':
			case 'b':
				return wrap(inline(node.children), '**')
			case 'em':
			case 'i':
				return wrap(inline(node.children), '*')
			case 'del':
			case 's':
				return wrap(inline(node.children), '~~')
			case 'code':
			case 'kbd':
			case 'samp': {
				const code = textContent(node).replace(/\s+/g, ' ')
				return code === '' ? '' : inlineCode(code)
			}
			case 'a': {
				const text = inline(node.children)
				const href = node.attrs['href']
				// 見出しの横のアンカーのような、ページの中への移動は、リンクにしない
				if (href === undefined || href.startsWith('#') || href.startsWith('javascript:')) return text
				if (text.trim() === '') return ''
				return `[${text.trim()}](${resolve(href)})`
			}
			case 'iframe': {
				const src = node.attrs['src']
				const title = collapse(node.attrs['title'] ?? '')
				return src === undefined ? '' : `[埋め込み${title === '' ? '' : `: ${title}`}](${resolve(src)})`
			}
			case 'video':
			case 'audio': {
				const src =
					node.attrs['src'] ?? find(node, (el) => el.tag === 'source' && el.attrs['src'] !== undefined)?.attrs['src']
				return src === undefined ? '' : `[${node.tag === 'video' ? '動画' : '音声'}](${resolve(src)})`
			}
			default:
				// a の中の div（カード型のリンク）のように、文の中に入ったブロックは、前後に空白を置いて文として読む
				return BLOCK_TAGS.has(node.tag) ? ` ${inline(node.children)} ` : inline(node.children)
		}
	}

	const tidyInline = (text: string): string =>
		text
			.split('\n')
			.map((line) => line.replace(/[ \t]+/g, ' ').trim())
			.join('\n')
			.replace(/\n{2,}/g, '\n')
			.trim()

	const blocks = (nodes: HtmlNode[]): string[] => {
		const out: string[] = []
		let buffer = ''
		const flush = () => {
			const text = tidyInline(buffer)
			if (text !== '') out.push(text)
			buffer = ''
		}
		for (const node of nodes) {
			if (node.type === 'element' && isDropped(node)) continue
			if (node.type === 'element' && BLOCK_TAGS.has(node.tag)) {
				flush()
				out.push(...block(node))
			} else {
				buffer += inlineNode(node)
			}
		}
		flush()
		return out
	}

	const list = (el: HtmlElement): string => {
		const ordered = el.tag === 'ol'
		let number = Number.parseInt(el.attrs['start'] ?? '1', 10)
		if (Number.isNaN(number)) number = 1
		const items: string[] = []
		for (const child of el.children) {
			if (child.type !== 'element' || child.tag !== 'li') continue
			const marker = ordered ? `${number}. ` : '- '
			number += 1
			const content = blocks(child.children).join('\n')
			items.push(prefixLines(content === '' ? ' ' : content, marker, ' '.repeat(marker.length)).trimEnd())
		}
		return items.join('\n')
	}

	const table = (el: HtmlElement): string => {
		const rows = findAll(el, (row) => row.tag === 'tr').map((row) =>
			row.children
				.filter((cell): cell is HtmlElement => cell.type === 'element' && (cell.tag === 'td' || cell.tag === 'th'))
				.map((cell) => tidyInline(inline(cell.children)).replace(/\n/g, ' ').replace(/\|/g, '\\|')),
		)
		const width = Math.max(0, ...rows.map((row) => row.length))
		if (width === 0) return ''
		const line = (cells: string[]) =>
			`| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`
		const [head = [], ...body] = rows
		const caption = find(el, (child) => child.tag === 'caption')
		const lines = [line(head), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...body.map(line)]
		if (caption !== undefined) lines.unshift(`*${tidyInline(inline(caption.children))}*`, '')
		return lines.join('\n')
	}

	const block = (el: HtmlElement): string[] => {
		switch (el.tag) {
			case 'h1':
			case 'h2':
			case 'h3':
			case 'h4':
			case 'h5':
			case 'h6': {
				const text = tidyInline(inline(el.children)).replace(/\n/g, ' ')
				return text === '' ? [] : [`${'#'.repeat(Number(el.tag[1]))} ${text}`]
			}
			case 'pre': {
				const code = preText(el).replace(/\n+$/, '')
				const fence = codeFence(code)
				return [`${fence}${codeLanguage(el)}\n${code}\n${fence}`]
			}
			case 'ul':
			case 'ol': {
				const text = list(el)
				return text === '' ? [] : [text]
			}
			case 'blockquote':
			case 'aside': {
				const text = blocks(el.children).join('\n\n')
				return text === '' ? [] : [prefixLines(text, '> ', '> ').replace(/^$/gm, '>')]
			}
			case 'table': {
				const text = table(el)
				return text === '' ? [] : [text]
			}
			case 'hr':
				return ['---']
			case 'dt':
			case 'summary': {
				const text = tidyInline(inline(el.children))
				return text === '' ? [] : [`**${text}**`]
			}
			case 'figcaption': {
				const text = tidyInline(inline(el.children))
				return text === '' ? [] : [`*${text}*`]
			}
			default:
				return blocks(el.children)
		}
	}

	const markdown = blocks(root.children)
		.join('\n\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
	return { markdown, images }
}
