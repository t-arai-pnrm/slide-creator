// 1 つの HTML にまとめたデッキ（dist/<slug>.html、scripts/inline-decks.ts が作る）を、サーバーなしで file:// で開いて確かめる。
// 配った人はファイルを直に開くので、CSS と欧文のフォントがファイルの中から読み込まれることを確かめる
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'

const FILE_URL = pathToFileURL(join(import.meta.dirname, '..', 'dist', 'sample.html')).href

test('1 つの HTML を file:// で開くと、スライドが表示され、埋め込んだ CSS とフォントが効く', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 })
	// 埋め込みの漏れがあると、file:// のルートを指す URL の読み込みに失敗する
	const failed: string[] = []
	page.on('requestfailed', (request) => {
		if (request.url().startsWith('file:')) failed.push(request.url())
	})

	await page.goto(FILE_URL)
	const frames = page.locator('.slide ._frame')
	await expect(frames).toHaveCount(4)
	await expect(frames.first()).toBeVisible()

	// CSS が効いていないと、枠は 16:9 にならず、背景も透明になる
	const { width, height, background } = await frames.first().evaluate((element) => {
		const rect = element.getBoundingClientRect()
		return { width: rect.width, height: rect.height, background: getComputedStyle(element).backgroundColor }
	})
	expect(Math.abs(width - (height * 16) / 9)).toBeLessThanOrEqual(1)
	expect(['rgba(0, 0, 0, 0)', 'transparent']).not.toContain(background)

	// data: の URL で埋め込んだ欧文のフォントが読み込めることを確かめる
	const loaded = await page.evaluate(async () => {
		const fonts = await document.fonts.load('700 48px "Schibsted Grotesk Variable"', 'A')
		return fonts.length
	})
	expect(loaded).toBeGreaterThan(0)
	expect(failed).toEqual([])
})
