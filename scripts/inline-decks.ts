/**
 * astro build の後に、各デッキの HTML（dist/<slug>/index.html）が参照する CSS、JavaScript、フォント、画像を埋め込み、
 * dist/<slug>.html の 1 ファイルにする（pnpm build の最後に実行する）。
 * 1 ファイルにするのは、メールやチャットで渡し、サーバーなしで開いてもらえるようにするため。
 * 和文の Noto Sans JP だけは、DESIGN.md の決めごとで Google Fonts の <link> のまま残す（http(s) の URL は書き換えない）。
 * Astro の出力の形（属性の並びと引用符）が決まっているので、HTML のパーサーを足さずに正規表現で書き換える。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, posix } from 'node:path'

const DIST = 'dist'
const SLIDES = 'slides'
// 大きすぎると、メールの添付やチャットのアップロードで弾かれやすい
const WARN_BYTES = 5 * 1024 * 1024

const MIME: Record<string, string> = {
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.svg': 'image/svg+xml',
}

// サイトの中を指す URL（/_astro/x.css など）だけを dist のファイルに直す。外部の URL と data: は対象外
const isLocal = (url: string) => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)

const toDistPath = (url: string, from: string) => {
	const clean = url.split(/[?#]/)[0] ?? url
	const resolved = clean.startsWith('/') ? clean : posix.join(posix.dirname(from), clean)
	return join(DIST, resolved)
}

const readAsset = (url: string, from: string) => {
	const path = toDistPath(url, from)
	if (!existsSync(path)) throw new Error(`${from} が参照する ${url} が dist にない`)
	return { path, data: readFileSync(path) }
}

const toDataUri = (url: string, from: string) => {
	const { path, data } = readAsset(url, from)
	const mime = MIME[extname(path).toLowerCase()]
	if (!mime) throw new Error(`${url} の種類を埋め込めない（拡張子 ${extname(path)} の MIME を MIME に足す）`)
	return `data:${mime};base64,${data.toString('base64')}`
}

// CSS の url() のうち、サイトの中を指すものを data: にする。from は CSS ファイルの URL（相対の URL の起点）
const inlineCssUrls = (css: string, from: string) =>
	css.replaceAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, _quote: string, url: string) =>
		isLocal(url) ? `url("${toDataUri(url, from)}")` : match,
	)

// <style> の中で </style を書くと、そこで要素が閉じてしまう
const escapeEnd = (text: string, tag: string) => text.replaceAll(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)

const inlineDeck = (slug: string) => {
	const pageUrl = `/${slug}/index.html`
	let html = readFileSync(join(DIST, slug, 'index.html'), 'utf8')

	html = html.replaceAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) => {
		const href = /\bhref="([^"]+)"/.exec(tag)?.[1]
		if (!href || !isLocal(href)) return tag
		const css = readAsset(href, pageUrl).data.toString('utf8')
		return `<style>${escapeEnd(inlineCssUrls(css, href), 'style')}</style>`
	})

	html = html.replaceAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g, (_match, attributes: string, css: string) => {
		return `<style${attributes}>${inlineCssUrls(css, pageUrl)}</style>`
	})

	// 分割されたチャンクを読み込むスクリプトは、1 つの <script> にまとめられないので失敗にする
	html = html.replaceAll(
		/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/g,
		(tag, before: string, src: string, after: string) => {
			if (!isLocal(src)) return tag
			const js = readAsset(src, pageUrl).data.toString('utf8')
			if (/\bimport\s*\(|\bimport\s*[\w{*$][^;]*?\bfrom\s*["']|\bimport\s*["']/.test(js))
				throw new Error(`${src} がほかのファイルを import していて、埋め込めない`)
			return `<script${before}${after}>${escapeEnd(js, 'script')}</script>`
		},
	)

	// 読み込みを先に始めるための指定は、埋め込んだ後は要らない
	html = html.replaceAll(/<link\b[^>]*\brel="(?:modulepreload|preload)"[^>]*>/g, (tag) => {
		const href = /\bhref="([^"]+)"/.exec(tag)?.[1]
		return href && isLocal(href) ? '' : tag
	})

	html = html.replaceAll(/<(img|source)\b[^>]*>/g, (tag) =>
		tag.replaceAll(/\b(src|srcset)="([^"]+)"/g, (attribute, name: string, value: string) => {
			if (name === 'src') return isLocal(value) ? `src="${toDataUri(value, pageUrl)}"` : attribute
			const candidates = value.split(',').map((candidate) => {
				const [url = '', ...descriptor] = candidate.trim().split(/\s+/)
				return [isLocal(url) ? toDataUri(url, pageUrl) : url, ...descriptor].join(' ')
			})
			return `srcset="${candidates.join(', ')}"`
		}),
	)

	// 書き換えの漏れは、ファイル 1 つで開いたときに読み込めないものになるので、ビルドを失敗にする
	// <a> の href はページの移動で、読み込みではないので対象外
	const leftover = /\bsrcset?="\/(?!\/)[^"]*"|url\(\s*["']?\/(?!\/)|<link\b[^>]*\bhref="\/(?!\/)[^"]*"/.exec(html)
	if (leftover) throw new Error(`${slug}: 埋め込めなかった参照がある: ${leftover[0]}`)

	const out = join(DIST, `${slug}.html`)
	writeFileSync(out, html)
	const size = statSync(out).size
	const sizeText = `${(size / 1024 / 1024).toFixed(2)} MB`
	if (size > WARN_BYTES)
		console.warn(`警告: ${out} が ${sizeText} あり、5 MB を超えている。画像を小さくするか、デッキを分ける`)
	else console.log(`${out}（${sizeText}）`)
}

const slugs = readdirSync(SLIDES, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && existsSync(join(SLIDES, entry.name, 'deck.mdx')))
	.map((entry) => entry.name)

for (const slug of slugs) inlineDeck(slug)
