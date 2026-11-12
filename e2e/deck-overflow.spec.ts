// 各デッキの各スライドで、中身が枠に収まっているかを確かめる（pnpm check:decks。pnpm test:e2e にも入る）。
// DESIGN.md の「書体」のとおり、Noto Sans JP が読み込めないと OS の書体で出て幅が変わるので、
// 枠の内側（枠線の内側）の 95% を超えたら失敗にして、5% の余裕を残す
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const LIMIT = 0.95
const RATIO = 16 / 9

const SLIDES = join(import.meta.dirname, '..', 'slides')
// scripts/inline-decks.ts と同じく、deck.mdx のあるディレクトリだけをデッキとする。
// 記事を取り込んだだけで原稿がまだないディレクトリは、ページにならない
const slugs = readdirSync(SLIDES, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && existsSync(join(SLIDES, entry.name, 'deck.mdx')))
	.map((entry) => entry.name)

test.use({ viewport: { width: 1920, height: 1080 } })

for (const slug of slugs) {
	test(`${slug}: 各スライドの中身が、枠の内側の ${LIMIT * 100}% に収まる`, async ({ page }) => {
		await page.goto(`/${slug}/`)
		await page.evaluate(() => document.fonts.ready)
		const results = await page.locator('.slide ._frame').evaluateAll(
			(frames, ratio) =>
				frames.map((frame, index) => {
					const inner = frame.querySelector('._frame-inner')
					const heading = frame.querySelector('._heading')
					const body = frame.querySelector('._body')
					const pageNumber = frame.querySelector('._page')
					if (!inner || !heading || !body || !pageNumber) throw new Error(`${index + 1} 枚目の枠の部品が足りない`)
					const style = getComputedStyle(inner)
					const px = (value: string) => Number.parseFloat(value) || 0
					// 中身があふれると枠が縦に伸びうるので、枠の高さは実際の値ではなく、幅と 16:9 から求める
					const frameWidth = frame.getBoundingClientRect().width
					const availableHeight = frameWidth / ratio - px(style.paddingBlockStart) - px(style.paddingBlockEnd)
					// 本文の行は 1fr に伸びるので、本文の高さは子の要素が占める範囲で測る
					const children = Array.from(body.children, (child) => child.getBoundingClientRect())
					const first = children[0]
					const last = children.at(-1)
					const bodyHeight = first && last ? last.bottom - first.top : 0
					const gap = px(style.rowGap)
					const usedHeight =
						heading.getBoundingClientRect().height + gap + bodyHeight + gap + pageNumber.getBoundingClientRect().height
					// 長い語やコードが折り返せないと、横にはみ出す。幅は枠線いっぱいに使ってよいので、95% ではなく枠線で判定する
					const overflowX = Math.max(heading.scrollWidth - heading.clientWidth, body.scrollWidth - body.clientWidth)
					return { slide: index + 1, height: usedHeight / availableHeight, overflowX }
				}),
			RATIO,
		)
		expect(results.length).toBeGreaterThan(0)
		// 幅はサブピクセルで丸められるので 1px の誤差を許す
		const over = results.filter(({ height, overflowX }) => height > LIMIT || overflowX > 1)
		expect(over, '収まらないスライド（height は枠の内側の高さに対する割合、overflowX は横にはみ出した px）').toEqual([])
	})
}
