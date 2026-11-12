// 原稿の中身が、スライドの本文の領域と、図の箱の中に収まっているかを確かめる。
// DESIGN.md は、収まらないときは文字を小さくせず、スライドを分けるか文を削ると決めている。
// 文字の幅と折り返しはエンジンごとに違うので、playwright.config.ts の 3 つのエンジンで試す
import { expect, test, type Page } from '@playwright/test'

// 位置と大きさはサブピクセルで丸められるので、1px の誤差を許す
const TOLERANCE_PX = 1
const DECKS = ['/', '/demo/']
const VIEWPORTS = [
	{ width: 1280, height: 720 },
	{ width: 1920, height: 1080 },
]

type Overflow = { slide: number; element: string; reason: string }

// 横長の画面では今のスライドだけが見えるので、見えているスライドの中身を測る
const findOverflows = (page: Page) =>
	page.locator('main.deck > section.slide:not([hidden])').evaluate((slide, tolerance): Overflow[] => {
		const describe = (element: Element) =>
			`${element.tagName.toLowerCase()}.${[...element.classList].join('.')} "${(element.textContent ?? '').trim().slice(0, 20)}"`
		const slideNumber = Number(slide.querySelector('._page')?.textContent?.split('/')[0]?.trim())
		const body = slide.querySelector('._body')
		const results: Overflow[] = []
		if (!body) return results
		const area = body.getBoundingClientRect()
		for (const element of body.querySelectorAll('*')) {
			const rect = element.getBoundingClientRect()
			if (rect.width === 0 && rect.height === 0) continue
			if (
				rect.top < area.top - tolerance ||
				rect.bottom > area.bottom + tolerance ||
				rect.left < area.left - tolerance ||
				rect.right > area.right + tolerance
			) {
				results.push({
					slide: slideNumber,
					element: describe(element),
					reason: `outside-body ${Math.round(rect.bottom - area.bottom)}px below`,
				})
			}
			// 箱の中の文字の横のはみ出しを見る。SVG の子は scrollWidth を持たないので、HTML の要素だけを見る。
			// 縦の scrollHeight は、収まって見える図の箱（.flow、.compare など）でも clientHeight を超えたので使わない。
			// 縦のはみ出しは、上の本文の領域との位置の比較で見る
			if (
				element instanceof HTMLElement &&
				element.clientWidth > 0 &&
				element.scrollWidth > element.clientWidth + tolerance
			) {
				results.push({
					slide: slideNumber,
					element: describe(element),
					reason: `scroll-overflow ${element.scrollWidth} > ${element.clientWidth}`,
				})
			}
		}
		return results
	}, TOLERANCE_PX)

for (const viewport of VIEWPORTS) {
	test.describe(`横長の画面（${viewport.width}×${viewport.height}）`, () => {
		// スライドが替わったときの移動の動きで位置がずれないよう、動きを減らす設定で測る（不透明度の変化だけが残る）
		test.use({ viewport, reducedMotion: 'reduce' })

		for (const deck of DECKS) {
			test(`${deck} の各スライドの中身が本文の領域に収まる`, async ({ page }) => {
				await page.goto(deck)
				// Web フォントの読み込みの前後で文字の幅が変わるので、読み込みを待ってから測る
				await page.evaluate(() => document.fonts.ready)
				const total = await page.locator('main.deck > section.slide').count()
				const overflows: Overflow[] = []
				for (let index = 0; index < total; index += 1) {
					// 発表の表示では今のスライドだけが見えるので、1 枚ずつ測ってから次へ進める
					// oxlint-disable-next-line no-await-in-loop
					overflows.push(...(await findOverflows(page)))
					// oxlint-disable-next-line no-await-in-loop
					await page.keyboard.press('ArrowRight')
				}
				expect(overflows).toEqual([])
			})
		}
	})
}
