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

// サイトの中を指す URL（/ で始まり // で始まらない）
const ROOT_URL = String.raw`\/(?!\/)`
const CSS_ROOT_URL = new RegExp(String.raw`url\(\s*(?:["']|&quot;|&#34;|&#39;)?${ROOT_URL}`)
const TAG_ROOT_URL = new RegExp(
	// src は <img> と <source> のほかに、<video>、<audio>、<iframe>、<track>、<embed> にも書ける。poster は <video> の静止画
	// <a> の href はページの移動で、読み込みではないので対象外
	String.raw`\b(?:src|poster)="${ROOT_URL}[^"]*"|\bsrcset="(?:[^"]*,)?\s*${ROOT_URL}[^"]*"|^<link\b[^>]*\bhref="${ROOT_URL}[^"]*"`,
)

/**
 * 埋め込めずに残った、サイトの中への参照を返す（なければ null）。
 * 原稿の本文やコードに書いた <img src="/…"> や url(/…) は、文字として &lt; などに直されて出力されるので、
 * 実際のタグの属性と、<style> の中と style 属性の中だけを調べる
 */
export const findLeftover = (html: string): string | null => {
	const styles: string[] = []
	// <script> と <style> の中はタグではない。<style> の中だけは CSS として別に調べる。コメントの中は読み込まれない
	const markup = html
		.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replaceAll(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1')
		.replaceAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi, (_match, open: string, css: string) => {
			styles.push(css)
			return open
		})
	for (const css of styles) {
		const found = CSS_ROOT_URL.exec(css)
		if (found) return found[0]
	}
	for (const [tag] of markup.matchAll(/<[a-z][^\s/>]*(?:\s[^>]*)?>/gi)) {
		const found = TAG_ROOT_URL.exec(tag)
		if (found) return found[0]
		const style = /\bstyle="([^"]*)"/.exec(tag)?.[1]
		if (style && CSS_ROOT_URL.test(style)) return tag
	}
	return null
}

// dist/<slug>.html が、トップのページ（dist/index.html）や見つからないときのページ（dist/404.html）を上書きしないように
const RESERVED_SLUGS = new Set(['index', '404'])

export const assertSlug = (slug: string) => {
	// 大文字と小文字を区別しないファイルシステム（macOS の既定）では、Index.html も index.html を上書きする
	if (RESERVED_SLUGS.has(slug.toLowerCase()))
		throw new Error(
			`slides/${slug}: slug に ${[...RESERVED_SLUGS].join(' と ')} は使えない（dist の別のページを上書きする）`,
		)
}

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
	const leftover = findLeftover(html)
	if (leftover) throw new Error(`${slug}: 埋め込めなかった参照がある: ${leftover}`)

	const out = join(DIST, `${slug}.html`)
	writeFileSync(out, html)
	const size = statSync(out).size
	const sizeText = `${(size / 1024 / 1024).toFixed(2)} MB`
	if (size > WARN_BYTES)
		console.warn(`警告: ${out} が ${sizeText} あり、5 MB を超えている。画像を小さくするか、デッキを分ける`)
	else console.log(`${out}（${sizeText}）`)
}

// 単体のテストが判定の関数を import するので、直接実行したときだけ全デッキを処理する
if (import.meta.main) {
	const slugs = readdirSync(SLIDES, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(SLIDES, entry.name, 'deck.mdx')))
		.map((entry) => entry.name)

	// 1 つでも上書きするデッキがあれば、何も書き出す前に止める
	for (const slug of slugs) assertSlug(slug)
	for (const slug of slugs) inlineDeck(slug)
}
