import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addSlideNumbers, countSlides } from './vite-plugin-slide-numbers.ts'

await test('addSlideNumbers: 行の先頭の <Slide に page と total を足す', () => {
	assert.equal(
		addSlideNumbers('<Slide layout="title">\n</Slide>\n<Slide>\n</Slide>'),
		'<Slide page={1} total={2} layout="title">\n</Slide>\n<Slide page={2} total={2}>\n</Slide>',
	)
})

await test('addSlideNumbers: 属性を次の行に折り返した <Slide も数える', () => {
	assert.equal(
		addSlideNumbers('<Slide\n\tlayout="title"\n>\n</Slide>'),
		'<Slide page={1} total={1}\n\tlayout="title"\n>\n</Slide>',
	)
})

await test('addSlideNumbers: コードブロックの中の <Slide は数えない（字下げしていても失敗にしない）', () => {
	assert.equal(countSlides('<Slide>\n</Slide>\n```mdx\n<Slide>\n  <Slide>\n```'), 1)
})

await test('addSlideNumbers: コードブロックの外の字下げした <Slide は失敗にする', () => {
	assert.throws(() => countSlides('<Slide>\n</Slide>\n  <Slide>\n  </Slide>'), /3 行目/)
	assert.throws(() => countSlides('\t<Slide />'), /1 行目/)
})

await test('addSlideNumbers: page と total を手で書いた原稿は、属性を折り返していても失敗にする', () => {
	assert.throws(() => addSlideNumbers('<Slide page={1}>\n</Slide>'))
	assert.throws(() => addSlideNumbers('<Slide\n\tlayout="title"\n\ttotal={3}\n>\n</Slide>'))
	assert.throws(() => addSlideNumbers('<Slide\n\tpage\n/>'))
})

await test('addSlideNumbers: 開始タグの外や値の中の page= は失敗にしない', () => {
	assert.doesNotThrow(() => addSlideNumbers('<Slide>\n<p>page=1 と total=2</p>\n</Slide>'))
	assert.doesNotThrow(() => addSlideNumbers('<Slide title="page=1" note={"a > total=2"}>\n</Slide>'))
})
