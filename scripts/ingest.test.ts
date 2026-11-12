import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { ingest, ReservedSlugError, SlugExistsError, slugFromInput } from './ingest.ts'

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
