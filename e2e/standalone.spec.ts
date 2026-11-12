// 1 つの HTML にまとめたデッキ（dist/<slug>.html、scripts/inline-decks.ts が作る）を、サーバーなしで file:// で開いて確かめる。
// 配った人はファイルを直に開くので、CSS と欧文のフォントとスクリプトがファイルの中から読み込まれることを確かめる
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'

import { countSlides } from '../scripts/vite-plugin-slide-numbers.ts'

const ROOT = join(import.meta.dirname, '..')
const FILE_URL = pathToFileURL(join(ROOT, 'dist', 'sample.html')).href
const TOTAL = countSlides(readFileSync(join(ROOT, 'slides', 'sample', 'deck.mdx'), 'utf8'))

test('1 つの HTML を file:// で開くと、スライドが表示され、埋め込んだ CSS とフォントが効く', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 })
	// 埋め込みの漏れがあると、file:// のルートを指す URL の読み込みに失敗する
	const failed: string[] = []
	page.on('requestfailed', (request) => {
		if (request.url().startsWith('file:')) failed.push(request.url())
	})

	await page.goto(FILE_URL)
	const frames = page.locator('.slide ._frame')
	await expect(frames).toHaveCount(TOTAL)
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

test('file:// で開いても、埋め込んだスクリプトが動き、横長の画面で 1 枚ずつ表示する', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 })
	await page.goto(FILE_URL)
	const deck = page.locator('main.deck')
	await expect(deck).toHaveAttribute('data-view', 'present')
	await expect(page.locator('main.deck > section.slide:not([hidden])')).toHaveCount(1)
	await expect(page.locator('.deck-controls [data-deck-current]')).toHaveText('1')

	await page.keyboard.press('ArrowRight')
	await expect(page).toHaveURL(/#2$/)
	await expect(page.locator('main.deck > section.slide').nth(1)).toHaveAttribute('data-slide', 'current')
})
