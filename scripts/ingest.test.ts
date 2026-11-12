import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { ingest, InvalidSlugError, ReservedSlugError, SlugExistsError, slugFromInput } from './ingest.ts'
import { decodeEntities } from './ingest/html.ts'

const PAGE = `<!doctype html>
<html><head><title>例 | サイト</title><meta property="og:title" content="記事の題名"><meta name="author" content="著者"></head>
<body><nav>メニュー</nav><main><article>
<h1>記事の題名</h1>
<p>本文の<strong>段落</strong>と<a href="/other/">リンク</a>。</p>
<ul><li>一つ目<ul><li>入れ子</li></ul></li><li>二つ目</li></ul>
<pre data-language="css"><code>a {
  color: red;
}</code></pre>
<figure><img src="/img/a.png" alt="図の説明"><figcaption>図 1</figcaption></figure>
<footer>共有する</footer>
</article></main><script>alert(1)</script></body></html>`

await test('slug は URL の最後の部分から作る', () => {
	assert.equal(slugFromInput('https://infixer.net/blog/2026/blog-to-slides/'), 'blog-to-slides')
	assert.equal(slugFromInput('/tmp/posts/My Post/index.mdx'), 'my-post')
})

await test('URL の記事を全文のマークダウンにし、画像を保存する。同じ slug は上書きしない', async () => {
	const slidesDir = await mkdtemp(join(tmpdir(), 'ingest-'))
	const fakeFetch: typeof fetch = async (input) => {
		const url = String(input instanceof Request ? input.url : input)
		if (url.endsWith('.png'))
			return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
		return new Response(PAGE, { headers: { 'content-type': 'text/html' } })
	}
	const input = 'https://example.com/blog/sample-post/'
	await ingest({ input, slidesDir, fetch: fakeFetch, taklogDir: slidesDir })
	const source = await readFile(join(slidesDir, 'sample-post', 'source.md'), 'utf8')

	assert.match(source, /^---\ntitle: "記事の題名"\nauthor: "著者"\nurl: "https:\/\/example.com\/blog\/sample-post\/"/)
	assert.match(source, /# 記事の題名/)
	assert.match(source, /本文の\*\*段落\*\*と\[リンク\]\(https:\/\/example.com\/other\/\)。/)
	assert.match(source, /- 一つ目\n {2}- 入れ子\n- 二つ目/)
	assert.match(source, /```css\na \{\n {2}color: red;\n\}\n```/)
	assert.match(source, /!\[図の説明\]\(\.\/images\/01-a\.png\)/)
	assert.doesNotMatch(source, /メニュー|共有する|alert/)
	await stat(join(slidesDir, 'sample-post', 'images', '01-a.png'))

	await assert.rejects(ingest({ input, slidesDir, fetch: fakeFetch }), SlugExistsError)
})

await test('slug が index か 404 になる記事は、何も書かずに止め、--slug を案内する', async () => {
	const slidesDir = await mkdtemp(join(tmpdir(), 'ingest-'))
	const fakeFetch: typeof fetch = async () => {
		throw new Error('使えない slug では記事を取得しない')
	}
	const cases: { input: string; slug?: string }[] = [
		// index.html の 1 つ上のフォルダーも index
		{ input: 'https://example.com/index/index.html' },
		// index かどうかの判定より後で小文字にするので、Index は index になる
		{ input: 'https://example.com/blog/Index.html' },
		{ input: 'https://example.com/404' },
		{ input: '/tmp/posts/index/index.mdx' },
		{ input: 'https://example.com/blog/sample-post/', slug: 'Index' },
		{ input: 'https://example.com/blog/sample-post/', slug: '404' },
	]
	await Promise.all(
		cases.map(({ input, slug }) =>
			assert.rejects(ingest({ input, slug, slidesDir, fetch: fakeFetch, taklogDir: slidesDir }), (error) => {
				assert.ok(error instanceof ReservedSlugError, input)
				assert.match(error.message, /--slug/)
				return true
			}),
		),
	)
	assert.deepEqual(await readdir(slidesDir), [])
	// 最後の部分が index でも、1 つ上のフォルダーの名前を使うので止めない
	assert.equal(slugFromInput('https://example.com/blog/index/'), 'blog')
})

const refuseFetch: typeof fetch = async () => {
	throw new Error('記事を取得しない')
}

const notFoundFetch: typeof fetch = async () => new Response('', { status: 404 })

await test('--slug の値が a-z0-9- の形でなければ、記事を取りに行かず、何も書かずに止め、使える文字を案内する', async () => {
	const slidesDir = await mkdtemp(join(tmpdir(), 'ingest-'))
	const input = 'https://example.com/blog/sample-post/'
	await Promise.all(
		['../src', 'a/b', 'My Talk', '-a', 'a--b', 'a-', ''].map((slug) =>
			assert.rejects(ingest({ input, slug, slidesDir, fetch: refuseFetch, taklogDir: slidesDir }), (error) => {
				assert.ok(error instanceof InvalidSlugError, slug)
				assert.match(error.message, /a-z/)
				return true
			}),
		),
	)
	assert.deepEqual(await readdir(slidesDir), [])
})

await test('記事の取得やファイルの読み込みに失敗したら、新しい slug のフォルダーを残さない', async () => {
	const slidesDir = await mkdtemp(join(tmpdir(), 'ingest-'))
	await assert.rejects(
		ingest({ input: 'https://example.com/blog/missing/', slidesDir, fetch: notFoundFetch, taklogDir: slidesDir }),
		/404/,
	)
	await assert.rejects(
		ingest({ input: 'https://example.com/blog/offline/', slidesDir, fetch: refuseFetch, taklogDir: slidesDir }),
	)
	await assert.rejects(ingest({ input: join(slidesDir, 'missing.md'), slidesDir }))
	await assert.rejects(ingest({ input: join(slidesDir, 'notes.txt'), slidesDir }), /\.md/)
	assert.deepEqual(await readdir(slidesDir), [])
})

const writeDeck = async (slidesDir: string, slug: string): Promise<string> => {
	const dir = join(slidesDir, slug)
	await mkdir(join(dir, 'images'), { recursive: true })
	await writeFile(join(dir, 'source.md'), '前回の本文')
	await writeFile(join(dir, 'images', 'old.png'), 'old')
	await writeFile(join(dir, 'deck.mdx'), '原稿')
	return dir
}

await test('--force で取得に失敗したら、前回の source.md と images/ を残す', async () => {
	const slidesDir = await mkdtemp(join(tmpdir(), 'ingest-'))
	const dir = await writeDeck(slidesDir, 'sample-post')
	const input = 'https://example.com/blog/sample-post/'
	await assert.rejects(ingest({ input, force: true, slidesDir, fetch: notFoundFetch, taklogDir: slidesDir }), /404/)
	assert.equal(await readFile(join(dir, 'source.md'), 'utf8'), '前回の本文')
	assert.deepEqual(await readdir(join(dir, 'images')), ['old.png'])
	assert.equal(await readFile(join(dir, 'deck.mdx'), 'utf8'), '原稿')
})

await test('--force では、source.md と images/ だけを作り直し、deck.mdx を残す', async () => {
	const slidesDir = await mkdtemp(join(tmpdir(), 'ingest-'))
	const dir = await writeDeck(slidesDir, 'sample-post')
	const fakeFetch: typeof fetch = async (input) => {
		const url = String(input instanceof Request ? input.url : input)
		if (url.endsWith('.png'))
			return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
		return new Response(PAGE, { headers: { 'content-type': 'text/html' } })
	}
	const input = 'https://example.com/blog/sample-post/'
	await ingest({ input, force: true, slidesDir, fetch: fakeFetch, taklogDir: slidesDir })
	assert.match(await readFile(join(dir, 'source.md'), 'utf8'), /# 記事の題名/)
	assert.deepEqual(await readdir(join(dir, 'images')), ['01-a.png'])
	assert.equal(await readFile(join(dir, 'deck.mdx'), 'utf8'), '原稿')
})

await test('ローカルの .md を取り込み、画像を写して、画像の構文の中の参照だけを書き換える', async () => {
	const root = await mkdtemp(join(tmpdir(), 'ingest-'))
	const slidesDir = join(root, 'slides')
	const postDir = join(root, 'posts', 'my-post')
	await mkdir(postDir, { recursive: true })
	await writeFile(join(postDir, 'a.png'), 'inner')
	await writeFile(join(root, 'posts', 'a.png'), 'outer')
	const file = join(postDir, 'my-post.md')
	await writeFile(
		file,
		[
			'---',
			'title: "元の題名"',
			'via: "manual"',
			'---',
			'',
			'![内側](./a.png)',
			'',
			'![外側](../a.png)',
			'',
			'本文に書いた ./a.png の文字は画像の参照ではない',
			'',
			'![ない](./missing.png)',
			'',
		].join('\n'),
	)
	const result = await ingest({ input: file, slidesDir })
	const source = await readFile(join(slidesDir, 'my-post', 'source.md'), 'utf8')

	assert.equal(result.via, 'file')
	assert.equal(result.images, 2)
	assert.deepEqual(result.failedImages, ['./missing.png'])
	// 既存の鍵は上書きせず、ない鍵だけを足す
	assert.match(source, /^---\ntitle: "元の題名"\nvia: "manual"\ningested: "\d{4}-\d{2}-\d{2}"\n---\n/)
	assert.match(source, /!\[内側\]\(\.\/images\/01-a\.png\)/)
	assert.match(source, /!\[外側\]\(\.\/images\/02-a\.png\)/)
	assert.match(source, /本文に書いた \.\/a\.png の文字/)
	assert.match(source, /!\[ない\]\(\.\/missing\.png\)/)
	assert.equal(await readFile(join(slidesDir, 'my-post', 'images', '01-a.png'), 'utf8'), 'inner')
	assert.equal(await readFile(join(slidesDir, 'my-post', 'images', '02-a.png'), 'utf8'), 'outer')
})

await test('HTML から作った本文が --- で始まっても、frontmatter として読まない', async () => {
	const slidesDir = await mkdtemp(join(tmpdir(), 'ingest-'))
	const page = `<!doctype html><html><head><title>区切り</title></head><body><main><article>
<hr><p>一つ目の段落です。本文は記事の中身として残す必要があります。</p><hr><p>二つ目の段落です。</p>
</article></main></body></html>`
	const fakeFetch: typeof fetch = async () => new Response(page, { headers: { 'content-type': 'text/html' } })
	await ingest({ input: 'https://example.com/blog/rules/', slidesDir, fetch: fakeFetch, taklogDir: slidesDir })
	const source = await readFile(join(slidesDir, 'rules', 'source.md'), 'utf8')

	assert.match(source, /^---\n(?:\w+: ".*"\n)+---\n\n---\n\n一つ目の段落です。/)
	assert.match(source, /url: "https:\/\/example.com\/blog\/rules\/"/)
})

await test('文字参照の名前が Object.prototype のプロパティでも、関数の文字列にしない', () => {
	assert.equal(decodeEntities('&constructor; &toString; &hasOwnProperty;'), '&constructor; &toString; &hasOwnProperty;')
	assert.equal(decodeEntities('&amp; &LT; &#x41;'), '& < A')
})
