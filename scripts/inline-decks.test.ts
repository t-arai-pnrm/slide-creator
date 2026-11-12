import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertSlug, findLeftover } from './inline-decks.ts'

await test('findLeftover: src の残りを、<img> 以外のタグでも見つける', () => {
	for (const tag of [
		'<video src="/a.mp4"></video>',
		'<audio src="/a.mp3"></audio>',
		'<iframe src="/a.html"></iframe>',
		'<track src="/a.vtt">',
		'<video poster="/a.png"></video>',
	])
		assert.notEqual(findLeftover(tag), null, tag)
})

await test('findLeftover: srcset の 2 つ目以降の候補の残りも見つける', () => {
	assert.notEqual(findLeftover('<img srcset="data:image/png;base64,AA 1x, /b.png 2x">'), null)
})

await test('findLeftover: <link> の href の残りを見つけ、<a> の href は対象にしない', () => {
	assert.notEqual(findLeftover('<link rel="icon" href="/favicon.svg">'), null)
	assert.equal(findLeftover('<a href="/other/">ほかのデッキ</a>'), null)
})

await test('findLeftover: <style> の中と style 属性の中の url(/…) を見つける', () => {
	assert.notEqual(findLeftover('<style>.a { background: url(/a.png) }</style>'), null)
	assert.notEqual(findLeftover('<div style="background: url(&quot;/a.png&quot;)"></div>'), null)
})

await test('findLeftover: 本文やコードに書いた参照は対象にしない', () => {
	assert.equal(findLeftover('<p>url(/foo) と書く</p>'), null)
	assert.equal(findLeftover('<pre><code>&lt;img src="/a.png"&gt;</code></pre>'), null)
	assert.equal(findLeftover('<script>const html = \'<img src="/a.png">\'</script>'), null)
	assert.equal(findLeftover('<!-- <img src="/a.png"> -->'), null)
})

await test('findLeftover: 外部の URL と data: と // は対象にしない', () => {
	assert.equal(
		findLeftover(
			'<img src="data:image/png;base64,AA"><link rel="stylesheet" href="https://fonts.googleapis.com/css2"><iframe src="//example.com/"></iframe><style>.a { background: url("https://example.com/a.png") }</style>',
		),
		null,
	)
})

await test('assertSlug: index と 404 は失敗にする（大文字と小文字を区別しない）', () => {
	for (const slug of ['index', '404', 'Index']) assert.throws(() => assertSlug(slug), slug)
})

await test('assertSlug: ほかの slug は通す', () => {
	assert.doesNotThrow(() => assertSlug('sample'))
	assert.doesNotThrow(() => assertSlug('index-2'))
})
