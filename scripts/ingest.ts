/**
 * 記事を取り込み、slides/<slug>/source.md に全文のマークダウンで置く（/create-slide の最初の手順）。
 * 要約はしない。スライドの素材を選ぶのは、後の手順の読む係と人の仕事のため
 *
 * 使い方: node scripts/ingest.ts <URL かファイルのパス> [--slug <名前>] [--force]
 * 終了コード: 0 は成功、1 は失敗、2 は同じ slug のフォルダーがすでにある（--force で作り直すか、--slug で別の名前にする）
 */
// 画像は 1 枚ずつ順に取る。番号を記事の中の順に付けるのと、記事のサーバーに同時に何本も要求を送らないため
/* oxlint-disable no-await-in-loop */
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { findContentRoot, htmlToMarkdown, parseHtml, readMeta } from './ingest/html.ts'

export class SlugExistsError extends Error {}

export const sanitizeSlug = (text: string): string =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

// URL は最後のパスの部分、ファイルはファイル名から作る。index.html や index.mdx は、1 つ上のフォルダーの名前を使う
export const slugFromInput = (input: string): string => {
	const segments = /^https?:\/\//.test(input)
		? new URL(input).pathname.split('/').map((segment) => decodeURIComponent(segment))
		: resolve(input).split(/[\\/]/)
	const names = segments.filter((segment) => segment !== '').map((segment) => segment.replace(/\.[a-z0-9]+$/i, ''))
	const last = names.at(-1) === 'index' ? names.at(-2) : names.at(-1)
	return sanitizeSlug(last ?? '')
}

const IMAGE_IMPORT = /^(import\s+\w+\s+from\s+['"])([^'"]+\.(?:png|jpe?g|gif|webp|avif|svg))(['"])/gm
const IMAGE_LINK = /(!\[[^\]]*\]\()([^)\s]+)(\))/g

const quote = (value: string): string => JSON.stringify(value)

// 既存の frontmatter に、取り込みの情報（出典の URL など）を足す。すでにある鍵は上書きしない
const withFrontmatter = (markdown: string, fields: Record<string, string | undefined>): string => {
	const entries = Object.entries(fields).filter((entry): entry is [string, string] => entry[1] !== undefined)
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown)
	const existing = match?.[1] ?? ''
	const added = entries
		.filter(([key]) => !new RegExp(`^${key}:`, 'm').test(existing))
		.map(([key, value]) => `${key}: ${quote(value)}`)
	if (match === null) return `---\n${added.join('\n')}\n---\n\n${markdown}`
	return `---\n${[existing, ...added].filter((line) => line !== '').join('\n')}\n---\n${markdown.slice(match[0].length)}`
}

type Result = { dir: string; via: 'html' | 'taklog' | 'file'; images: number; failedImages: string[] }

type Options = {
	input: string
	slug?: string | undefined
	force?: boolean | undefined
	slidesDir: string
	taklogDir?: string | undefined
	fetch?: typeof fetch | undefined
}

/**
 * ローカルのマークダウンを写す。画像（MDX の import と ![](...) のうち、ローカルのもの）は images/ に写し、参照を書き換える。
 * `@/` は taklog の別名で、src/ を指す
 */
const ingestMarkdownFile = async (
	file: string,
	dir: string,
	fields: Record<string, string | undefined>,
	srcDir?: string,
): Promise<{ markdown: string; images: number; failed: string[] }> => {
	let markdown = await readFile(file, 'utf8')
	const specs = new Set<string>()
	for (const match of markdown.matchAll(IMAGE_IMPORT)) if (match[2] !== undefined) specs.add(match[2])
	for (const match of markdown.matchAll(IMAGE_LINK))
		if (match[2] !== undefined && !/^(?:https?:|data:)/.test(match[2])) specs.add(match[2])
	const failed: string[] = []
	let count = 0
	for (const spec of specs) {
		const path =
			spec.startsWith('@/') && srcDir !== undefined ? join(srcDir, spec.slice(2)) : resolve(dirname(file), spec)
		const target = `./images/${String(count + 1).padStart(2, '0')}-${basename(path)}`
		try {
			await mkdir(join(dir, 'images'), { recursive: true })
			await copyFile(path, join(dir, target))
			markdown = markdown.replaceAll(spec, target)
			count += 1
		} catch {
			failed.push(spec)
		}
	}
	return { markdown: withFrontmatter(markdown, fields), images: count, failed }
}

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/gif': '.gif',
	'image/webp': '.webp',
	'image/avif': '.avif',
	'image/svg+xml': '.svg',
}

export const ingest = async (options: Options): Promise<Result> => {
	const { input, slidesDir } = options
	const fetcher = options.fetch ?? fetch
	const isUrl = /^https?:\/\//.test(input)
	const slug = options.slug ?? slugFromInput(input)
	if (slug === '') throw new Error('slug を作れませんでした。--slug で名前を指定してください')
	const dir = join(slidesDir, slug)
	const exists = await stat(dir).then(
		() => true,
		() => false,
	)
	if (exists && options.force !== true)
		throw new SlugExistsError(`${dir} はすでにあります。--force で作り直すか、--slug で別の名前にしてください`)
	// 作り直すときは、取り込んだものだけを消す。原稿（deck.mdx）は残し、スキルの側で書き直す
	await rm(join(dir, 'source.md'), { force: true })
	await rm(join(dir, 'images'), { recursive: true, force: true })
	await mkdir(dir, { recursive: true })
	const ingested = new Date().toISOString().slice(0, 10)

	if (!isUrl) {
		if (!['.md', '.mdx'].includes(extname(input))) throw new Error('ファイルは .md か .mdx にしてください')
		const result = await ingestMarkdownFile(resolve(input), dir, { ingested, via: 'file' })
		await writeFile(join(dir, 'source.md'), result.markdown)
		return { dir, via: 'file', images: result.images, failedImages: result.failed }
	}

	const url = new URL(input)
	// ユーザーのブログの記事は、公開された HTML より情報の多い元の MDX（コードの言語、画像の元のファイル）を読む
	const taklogDir = options.taklogDir ?? process.env['TAKLOG_DIR'] ?? join(homedir(), 'dev', 'taklog')
	const taklogSlug = /^\/article\/([^/]+)\/?$/.exec(url.pathname)?.[1]
	if (/^(?:www\.)?tak-dcxi\.com$/.test(url.hostname) && taklogSlug !== undefined) {
		const file = join(taklogDir, 'src', 'content', 'article', `${taklogSlug}.mdx`)
		const found = await stat(file).then(
			() => true,
			() => false,
		)
		if (found) {
			// 著者名はサイトの設定の alias を使う（taklog は本名を About のページでだけ出す）
			const site = await readFile(join(taklogDir, 'src', 'lib', 'site.ts'), 'utf8').catch(() => '')
			const author = /alias:\s*'([^']+)'/.exec(site)?.[1]
			const result = await ingestMarkdownFile(
				file,
				dir,
				{ author, url: url.href, ingested, via: 'taklog' },
				join(taklogDir, 'src'),
			)
			await writeFile(join(dir, 'source.md'), result.markdown)
			return { dir, via: 'taklog', images: result.images, failedImages: result.failed }
		}
	}

	const response = await fetcher(url, { headers: { 'user-agent': 'slide-creator-ingest' } })
	if (!response.ok) throw new Error(`${url.href} を取得できませんでした（${response.status}）`)
	const doc = parseHtml(await response.text())
	const meta = readMeta(doc)
	const converted = htmlToMarkdown(findContentRoot(doc), response.url === '' ? url.href : response.url)
	let markdown = converted.markdown
	const failed: string[] = []
	let saved = 0
	for (const image of converted.images) {
		try {
			const imageResponse = await fetcher(image.url)
			if (!imageResponse.ok) throw new Error(String(imageResponse.status))
			let path = image.path
			// 拡張子を URL から推した画像は、Content-Type に合わせて付け直す
			const type = (imageResponse.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
			const extension = CONTENT_TYPE_EXTENSIONS[type]
			if (extension !== undefined && extname(path) !== extension) {
				path = path.replace(/\.[a-z0-9]+$/i, extension)
				markdown = markdown.replaceAll(`](${image.path})`, `](${path})`)
			}
			await mkdir(join(dir, 'images'), { recursive: true })
			await writeFile(join(dir, path), new Uint8Array(await imageResponse.arrayBuffer()))
			saved += 1
		} catch {
			// 取れなかった画像は元の URL に戻し、記事の中の位置を残す
			markdown = markdown.replaceAll(`](${image.path})`, `](${image.url})`)
			failed.push(image.url)
		}
	}
	const fields = {
		title: meta.title,
		author: meta.author,
		url: url.href,
		published: meta.published,
		ingested,
		via: 'html',
	}
	await writeFile(join(dir, 'source.md'), withFrontmatter(`${markdown}\n`, fields))
	return { dir, via: 'html', images: saved, failedImages: failed }
}

if (import.meta.main) {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { slug: { type: 'string' }, force: { type: 'boolean' } },
	})
	const input = positionals[0]
	if (input === undefined) {
		console.error('使い方: node scripts/ingest.ts <URL かファイルのパス> [--slug <名前>] [--force]')
		process.exit(1)
	}
	const slidesDir = fileURLToPath(new URL('../slides', import.meta.url))
	try {
		const result = await ingest({ input, slug: values.slug, force: values.force, slidesDir })
		console.log(`取り込み: ${join(result.dir, 'source.md')}（${result.via}）`)
		console.log(`画像: ${result.images} 枚を保存`)
		for (const failed of result.failedImages) console.warn(`画像を取れませんでした: ${failed}`)
	} catch (error) {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = error instanceof SlugExistsError ? 2 : 1
	}
}
