// スライドの枠（16:9、画面に収まる、cqi で決まる文字の大きさ）と、ノートの出し分けと、見出しの構造を確かめる。
// 1 枚ずつ表示する操作はまだないので、すべてのスライドを縦に並べた状態で試す
import { expect, test, type Page } from '@playwright/test'

const RATIO = 16 / 9
// 幅と高さはサブピクセルで丸められるので、比と大きさの比較には 1px の誤差を許す
const TOLERANCE_PX = 1
// DESIGN.md の本文の下限（枠の幅の 2.5%）
const BODY_MIN_RATIO = 0.025

const frames = (page: Page) => page.locator('.slide ._frame')
const notes = (page: Page) => page.locator('.slide ._notes')

// 画面の幅と高さは、スクロールバーを除いた表示領域で測る。スクロールバーの下に枠が隠れると、収まっていないため
const getViewportSize = (page: Page) =>
	page.evaluate(() => ({
		width: document.documentElement.clientWidth,
		height: document.documentElement.clientHeight,
	}))

const getFrameSizes = (page: Page) =>
	frames(page).evaluateAll((elements) =>
		elements.map((element) => {
			const { width, height } = element.getBoundingClientRect()
			return { width, height }
		}),
	)

const LANDSCAPE_VIEWPORTS = [
	{ width: 1280, height: 720 },
	{ width: 1440, height: 900 },
	{ width: 1920, height: 1080 },
]

for (const viewport of LANDSCAPE_VIEWPORTS) {
	test.describe(`横長の画面（${viewport.width}×${viewport.height}）`, () => {
		test.use({ viewport })

		test('各スライドの枠が 16:9 で、画面に収まる', async ({ page }) => {
			await page.goto('/')
			const screen = await getViewportSize(page)
			const sizes = await getFrameSizes(page)
			expect(sizes.length).toBeGreaterThan(0)
			for (const { width, height } of sizes) {
				expect(Math.abs(width - height * RATIO)).toBeLessThanOrEqual(TOLERANCE_PX)
				expect(width).toBeLessThanOrEqual(screen.width + TOLERANCE_PX)
				expect(height).toBeLessThanOrEqual(screen.height + TOLERANCE_PX)
			}
		})

		test('スピーカーノートが見えていない', async ({ page }) => {
			await page.goto('/')
			const all = await notes(page).all()
			expect(all.length).toBeGreaterThan(0)
			await Promise.all(all.map((note) => expect(note).toBeHidden()))
		})
	})
}

test.describe('縦長の画面（375×812）', () => {
	test.use({ viewport: { width: 375, height: 812 } })

	test('枠の幅が画面の幅と同じで、16:9 になる', async ({ page }) => {
		await page.goto('/')
		const screen = await getViewportSize(page)
		const sizes = await getFrameSizes(page)
		expect(sizes.length).toBeGreaterThan(0)
		for (const { width, height } of sizes) {
			expect(Math.abs(width - screen.width)).toBeLessThanOrEqual(TOLERANCE_PX)
			expect(Math.abs(width - height * RATIO)).toBeLessThanOrEqual(TOLERANCE_PX)
		}
	})

	test('スピーカーノートが見えている', async ({ page }) => {
		await page.goto('/')
		const all = await notes(page).all()
		expect(all.length).toBeGreaterThan(0)
		await Promise.all(all.map((note) => expect(note).toBeVisible()))
	})
})

test('本文の段落の文字が、枠の幅の 2.5% 以上の大きさになる', async ({ page }) => {
	await page.goto('/')
	const results = await frames(page).evaluateAll((elements) =>
		elements.flatMap((frame) => {
			const frameWidth = frame.getBoundingClientRect().width
			return Array.from(frame.querySelectorAll('._body p'), (paragraph) => ({
				frameWidth,
				fontSize: Number.parseFloat(getComputedStyle(paragraph).fontSize),
			}))
		}),
	)
	expect(results.length).toBeGreaterThan(0)
	for (const { frameWidth, fontSize } of results) {
		// 文字の大きさは丸められることがあるので、0.5px の誤差を許す
		expect(fontSize).toBeGreaterThanOrEqual(frameWidth * BODY_MIN_RATIO - 0.5)
	}
})

test('文書に h1 が 1 つあり、各スライドが h2 の題名で名前付けされている', async ({ page }) => {
	await page.goto('/')
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

	const slides = await page.locator('section.slide').all()
	expect(slides.length).toBeGreaterThan(0)
	await Promise.all(
		slides.map(async (slide) => {
			const title = slide.getByRole('heading', { level: 2 })
			await expect(title).toHaveCount(1)
			const titleText = (await title.textContent())?.trim() ?? ''
			expect(titleText).not.toBe('')
			await expect(slide).toHaveRole('region')
			await expect(slide).toHaveAccessibleName(titleText)
		}),
	)
})
