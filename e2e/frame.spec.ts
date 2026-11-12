// スライドの枠（16:9、画面に収まる、cqi で決まる文字の大きさ）と、ノートの出し分けと、見出しの構造と、明暗の色を確かめる。
// 横長の画面では発表の表示になり、今のスライド以外が hidden で隠れる（e2e/presentation.spec.ts で確かめる）。
// 枠の大きさと文字の大きさは、隠れたスライドでは 0 になって比べても意味がないので、見えているスライドだけで試す
import { expect, test, type Page } from '@playwright/test'

const RATIO = 16 / 9
// 幅と高さはサブピクセルで丸められるので、比と大きさの比較には 1px の誤差を許す
const TOLERANCE_PX = 1
// DESIGN.md の本文の下限（枠の幅の 2.5%）
const BODY_MIN_RATIO = 0.025

const frames = (page: Page) => page.locator('.slide ._frame')
const notes = (page: Page) => page.locator('.slide ._notes')
// src/pages/index.astro の見本のデッキは、最後の 1 枚にノートを書かない（ほかにもノートのないスライドがある）
const slideWithoutNotes = (page: Page) => page.locator('section.slide').last()

// 画面の幅と高さは、スクロールバーを除いた表示領域で測る。スクロールバーの下に枠が隠れると、収まっていないため
const getViewportSize = (page: Page) =>
	page.evaluate(() => ({
		width: document.documentElement.clientWidth,
		height: document.documentElement.clientHeight,
	}))

const getFrameSizes = (page: Page) =>
	frames(page).evaluateAll((elements) =>
		elements
			.filter((element) => element.checkVisibility())
			.map((element) => {
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
		elements
			.filter((frame) => frame.checkVisibility())
			.flatMap((frame) => {
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

// 発表の表示では、隠れたスライドが読み上げの対象から外れるので、すべてのスライドが並ぶ縦長の画面で試す
test('文書に h1 が 1 つあり、各スライドが h2 の題名で名前付けされている', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 })
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

// ノートを書かないスライドに、空の ._notes が出ないことを確かめる。マークアップは画面の向きで変わらないが、
// 縦長の画面では空の領域として見えてしまうので、両方の向きで試す
const NOTES_VIEWPORTS = [
	{ name: '横長の画面', viewport: { width: 1280, height: 720 } },
	{ name: '縦長の画面', viewport: { width: 375, height: 812 } },
]

for (const { name, viewport } of NOTES_VIEWPORTS) {
	test.describe(`${name}（${viewport.width}×${viewport.height}）`, () => {
		test.use({ viewport })

		test('ノートのないスライドには ._notes がなく、ほかのノートには中身がある', async ({ page }) => {
			await page.goto('/')
			await expect(slideWithoutNotes(page).locator('._notes')).toHaveCount(0)

			const texts = await notes(page).allTextContents()
			expect(texts.length).toBeGreaterThan(0)
			for (const text of texts) {
				expect(text.trim()).not.toBe('')
			}
		})
	})
}

test.describe('縦長の画面でのノートの名前', () => {
	// 横長の画面ではノートが display: none で、アクセシブルな名前が計算されないので、ノートが見える縦長の画面で試す
	test.use({ viewport: { width: 375, height: 812 } })

	test('ノートのランドマークの名前に、ページ番号が入る', async ({ page }) => {
		await page.goto('/')
		const slides = await page.locator('section.slide').all()
		const total = slides.length
		await Promise.all(
			slides.map(async (slide, index) => {
				const note = slide.locator('._notes')
				if ((await note.count()) === 0) return
				await expect(note).toHaveAccessibleName(`スピーカーノート（${index + 1} / ${total}）`)
			}),
		)
	})
})

// 明暗のトークン（light-dark()）が CSS の変換で無効になると、背景の色の計算値が透明になる（astro.config.mjs の cssTarget を参照）
const TRANSPARENT = ['rgba(0, 0, 0, 0)', 'transparent']

const getBackgroundColors = (page: Page) =>
	page.evaluate(() => {
		const frame = document.querySelector('.slide ._frame')
		if (!frame) throw new Error('._frame がない')
		return {
			root: getComputedStyle(document.documentElement).backgroundColor,
			frame: getComputedStyle(frame).backgroundColor,
		}
	})

test('明暗のトークンが効き、color-scheme の meta を dark only にすると背景の色が変わる', async ({ page }) => {
	await page.goto('/')
	const light = await getBackgroundColors(page)
	expect(TRANSPARENT).not.toContain(light.root)
	expect(TRANSPARENT).not.toContain(light.frame)

	await page.evaluate(() => {
		const meta = document.querySelector('meta[name="color-scheme"]')
		if (!meta) throw new Error('color-scheme の meta がない')
		meta.setAttribute('content', 'dark only')
	})
	const dark = await getBackgroundColors(page)
	expect(TRANSPARENT).not.toContain(dark.root)
	expect(TRANSPARENT).not.toContain(dark.frame)
	expect(dark.root).not.toBe(light.root)
	expect(dark.frame).not.toBe(light.frame)
})

test('文書の題名がデッキの題名になる', async ({ page }) => {
	await page.goto('/')
	await expect(page).toHaveTitle('slide-creator の紹介')
})
