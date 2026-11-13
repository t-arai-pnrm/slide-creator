// 発表のための操作（src/scripts/deck.ts）を確かめる。
// 横長の画面で JavaScript が動くときだけ 1 枚ずつ表示し、縦長の画面と JavaScript が動かない環境では縦に並べた形のままにする。
// 見本のデッキ（slides/sample/deck.mdx）は、最後の 1 枚にだけリンクがある
import { readFileSync } from 'node:fs'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { countSlides } from '../scripts/vite-plugin-slide-numbers.ts'

const DECK_PATH = '/sample/'
// 枚数は、ビルドでページ番号を足すときと同じ数え方で、見本のデッキの原稿から数える。
// テストの名前（#99 を寄せる先）にも使うので、ページを開く前に決める。
// 実際のスライドの数と食い違えば、縦に並べた形のテスト（expectScrollView）で落ちる
const TOTAL = countSlides(readFileSync(new URL('../slides/sample/deck.mdx', import.meta.url), 'utf8'))
const LANDSCAPE = { width: 1280, height: 720 }
const PORTRAIT = { width: 375, height: 812 }
// DESIGN.md の「操作の部分」の、マウスを止めてから隠すまでの時間
const IDLE_DELAY_MS = 2000

const deck = (page: Page) => page.locator('main.deck')
const slides = (page: Page) => page.locator('main.deck > section.slide')
const controls = (page: Page) => page.locator('.deck-controls')
const controlButton = (page: Page, name: string) => controls(page).getByRole('button', { name, exact: true })
const colorScheme = (page: Page) => page.locator('meta[name="color-scheme"]')
// 隠したスライドは読み上げの対象から外れ、getByRole では見つからないので、要素で探す
const lastSlideLink = (page: Page) => slides(page).last().locator('a[href]')

/** 今のスライドが page 枚目（1 から数える）で、ほかのスライドが隠れていることを確かめる */
const expectCurrent = async (page: Page, pageNumber: number) => {
	await expect(page).toHaveURL(new RegExp(`#${pageNumber}$`))
	await expect(slides(page).nth(pageNumber - 1)).toHaveAttribute('data-slide', 'current')
	await expect(page.locator('main.deck > section.slide:not([hidden])')).toHaveCount(1)
	await expect(controls(page).locator('[data-deck-current]')).toHaveText(String(pageNumber))
}

const timerButton = (page: Page, name: string) =>
	page.locator('.presenter-timer').getByRole('button', { name, exact: true })

/** 経過時間のテストで固定する時刻。値に意味はなく、ずらした分だけが経過時間になる */
const TIMER_START = Date.UTC(2026, 0, 1)

/** 経過時間の見える 4 桁（分 2 桁、秒 2 桁）の --_value が、values のとおりであることを確かめる */
const expectTimerDigits = async (page: Page, values: readonly number[]) => {
	await expect
		.poll(() =>
			page
				.locator('.presenter-timer [data-timer-digit]')
				.evaluateAll((digits) =>
					digits.map((digit) => (digit instanceof HTMLElement ? digit.style.getPropertyValue('--_value') : '')),
				),
		)
		.toEqual(values.map(String))
}

/**
 * ページの左右の余白（DESIGN.md の「画面の端」の gutter--page）の、画面の幅 width での値（px）。
 * 375px 以下で 16px、1280px 以上で 64px、その間は幅に比例する。
 * CSS の式（progress()）が無効になると padding が 0 に落ちても気付けないので、CSS から読まずにここで計算する
 */
const expectedPageGutter = (width: number) => 16 + 48 * Math.min(Math.max((width - 375) / (1280 - 375), 0), 1)

/** 要素の左右の padding の計算値（px） */
const paddingInline = (target: Locator) =>
	target.evaluate((element) => {
		const style = getComputedStyle(element)
		return { start: Number.parseFloat(style.paddingLeft), end: Number.parseFloat(style.paddingRight) }
	})

/**
 * :root のトークン（色）を background-color に入れたときの計算値。
 * 色の値をテストに書くと、トークンを変えるたびにテストも直すことになるので、ページの中で解決する
 */
const resolveBackgroundToken = (page: Page, token: string) =>
	page.evaluate((name) => {
		const probe = document.createElement('div')
		probe.style.backgroundColor = `var(${name})`
		document.body.append(probe)
		const value = getComputedStyle(probe).backgroundColor
		probe.remove()
		return value
	}, token)

type BandPoint = { label: string; x: number; y: number }

/**
 * ボタンの帯（band）の中で、ボタンの押せる範囲が覆うはずの点を、ボタンの位置から求める。
 * - 組の中の隣り合うボタンの間の隙間の中央
 * - 組の間の区切り線の上と、線とその両側のボタンの間の中央
 * 高さは、どれもボタンの上下の中央にする。隠したボタン（発表者ビューのノートなど）は並びから外れるので数えない。
 * 区切り線は前の組の最後の項目の ::after で、項目の行末側の padding の手前に置かれる（DeckControls.astro）。
 * 擬似要素の位置は取れないので、項目の右端から padding と線の太さの半分を引いて、線の中央を求める
 */
const bandGapPoints = (band: Locator) =>
	band.evaluate((root) => {
		const nameOf = (button: HTMLButtonElement) => button.querySelector('.-visually-hidden')?.textContent ?? '?'
		const visibleButtons = (menu: Element) =>
			[...menu.querySelectorAll('button')].filter((button) => button.getClientRects().length > 0)
		const centerY = (rect: DOMRect) => rect.top + rect.height / 2
		const menus = [...root.querySelectorAll('menu')]
		const points: { label: string; x: number; y: number }[] = []
		for (const [index, menu] of menus.entries()) {
			const buttons = visibleButtons(menu)
			for (const [i, before] of buttons.entries()) {
				const after = buttons[i + 1]
				if (!after) continue
				const a = before.getBoundingClientRect()
				const b = after.getBoundingClientRect()
				points.push({ label: `${nameOf(before)}と${nameOf(after)}の間`, x: (a.right + b.left) / 2, y: centerY(a) })
			}
			const nextMenu = menus[index + 1]
			const last = buttons.at(-1)
			const first = nextMenu ? visibleButtons(nextMenu)[0] : undefined
			const item = last?.closest('li')
			if (!last || !first || !item) continue
			const a = last.getBoundingClientRect()
			const b = first.getBoundingClientRect()
			const separatorWidth = Number.parseFloat(getComputedStyle(item, '::after').borderLeftWidth)
			const separatorX =
				item.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(item).paddingRight) - separatorWidth / 2
			const y = centerY(a)
			points.push(
				{ label: `${nameOf(last)}と区切り線の間`, x: (a.right + separatorX) / 2, y },
				{ label: '区切り線の上', x: separatorX, y },
				{ label: `区切り線と${nameOf(first)}の間`, x: (separatorX + b.left) / 2, y },
			)
		}
		return points
	})

/**
 * 点 point にポインターを動かし、その点が帯（band）の中のボタンの押せる範囲に当たることを確かめる。
 * 当たったボタンのツールチップが出て、押せるボタンなら帯のハイライト（::before）も出ていることを確かめる。
 * 押せないボタン（aria-disabled）にはハイライトを置かないので、ツールチップだけを確かめる
 */
const expectHoverOnBandPoint = async (page: Page, band: Locator, point: BandPoint) => {
	await page.mouse.move(point.x, point.y)
	// 操作の部分は、隠れている間（data-idle）はポインターを下のスライドに通すので、現れてから当たりを調べる
	await expect(controls(page)).not.toHaveAttribute('data-idle')
	const hit = await band.evaluate((root, { x, y }) => {
		const element = document.elementFromPoint(x, y)
		// 押せる範囲の ::after の上では、ボタン自身が返る
		const button = element?.closest('button')
		const buttons = [...root.querySelectorAll('button')]
		return {
			index: button ? buttons.indexOf(button) : -1,
			isDisabled: button?.getAttribute('aria-disabled') === 'true',
			found: element ? `${element.tagName.toLowerCase()}.${element.className}` : 'なし',
		}
	}, point)
	expect(hit.index, `${point.label}（${point.x}, ${point.y}）で当たった要素: ${hit.found}`).toBeGreaterThanOrEqual(0)
	await expect(band.locator('button').nth(hit.index).locator('._tooltip'), point.label).toHaveCSS('opacity', '1')
	if (!hit.isDisabled) {
		await expect
			.poll(() => band.evaluate((element) => getComputedStyle(element, '::before').opacity), { message: point.label })
			.toBe('1')
	}
}

/** 帯（band）の、ボタンの間の隙間と区切り線のまわりのすべての点で、ハイライトとツールチップが消えないことを確かめる */
const expectHoverAcrossBandGaps = async (page: Page, band: Locator) => {
	const points = await bandGapPoints(band)
	expect(points.length).toBeGreaterThan(0)
	for (const point of points) {
		// 前の点のホバーが移るのを待ってから、次の点に動かす
		// oxlint-disable-next-line no-await-in-loop
		await expectHoverOnBandPoint(page, band, point)
	}
	return points
}

test.describe('横長の画面', () => {
	test.use({ viewport: LANDSCAPE })

	test('発表の表示になり、1 枚目から始まり、操作の部分が出る', async ({ page }) => {
		await page.goto(DECK_PATH)
		await expect(deck(page)).toHaveAttribute('data-view', 'present')
		await expectCurrent(page, 1)
		await expect(controls(page)).toBeVisible()
		await expect(controls(page).locator('._position')).toHaveText(`スライド 1 / ${TOTAL}`)
		await expect(deck(page)).toHaveCSS('--deck-controls--progress', String(1 / TOTAL))
	})

	test('今のスライドだけが見える', async ({ page }) => {
		await page.goto(DECK_PATH)
		const all = await slides(page).all()
		await Promise.all(all.map((slide, i) => (i === 0 ? expect(slide).toBeVisible() : expect(slide).toBeHidden())))
	})

	test('矢印キー、スペース、Page Up / Page Down、Home / End で移り、ハッシュが変わる', async ({ page }) => {
		await page.goto(DECK_PATH)
		await page.keyboard.press('ArrowRight')
		await expectCurrent(page, 2)
		await page.keyboard.press('ArrowLeft')
		await expectCurrent(page, 1)
		// 1 枚目より前には戻らない
		await page.keyboard.press('ArrowLeft')
		await expectCurrent(page, 1)
		await page.keyboard.press('Space')
		await expectCurrent(page, 2)
		await page.keyboard.press('Shift+Space')
		await expectCurrent(page, 1)
		await page.keyboard.press('PageDown')
		await expectCurrent(page, 2)
		await page.keyboard.press('PageUp')
		await expectCurrent(page, 1)
		await page.keyboard.press('End')
		await expectCurrent(page, TOTAL)
		// 最後より先には進まない
		await page.keyboard.press('ArrowRight')
		await expectCurrent(page, TOTAL)
		await page.keyboard.press('Home')
		await expectCurrent(page, 1)
		await expect(deck(page)).toHaveCSS('--deck-controls--progress', String(1 / TOTAL))
	})

	test('移っても履歴を積まない', async ({ page }) => {
		await page.goto(DECK_PATH)
		const length = await page.evaluate(() => history.length)
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await expectCurrent(page, 3)
		expect(await page.evaluate(() => history.length)).toBe(length)
	})

	test('修飾キーの付いたキーでは移らない', async ({ page }) => {
		await page.goto(DECK_PATH)
		await page.keyboard.press('Control+ArrowRight')
		await page.keyboard.press('Control+Space')
		await expectCurrent(page, 1)
	})

	test('前へ、次へのボタンで移り、端のボタンは aria-disabled になる', async ({ page }) => {
		await page.goto(DECK_PATH)
		await expect(controlButton(page, '前へ')).toHaveAttribute('aria-disabled', 'true')
		await controlButton(page, '次へ').click()
		await expectCurrent(page, 2)
		await expect(controlButton(page, '前へ')).toHaveAttribute('aria-disabled', 'false')
		await controlButton(page, '前へ').click()
		await expectCurrent(page, 1)
		await page.keyboard.press('End')
		await expect(controlButton(page, '次へ')).toHaveAttribute('aria-disabled', 'true')
	})

	test('#3 で開くと 3 枚目から始まる', async ({ page }) => {
		await page.goto(`${DECK_PATH}#3`)
		await expectCurrent(page, 3)
	})

	for (const { hash, expected } of [
		{ hash: '#0', expected: 1 },
		{ hash: '#99', expected: TOTAL },
		{ hash: '#abc', expected: 1 },
	]) {
		test(`範囲の外や数でないハッシュ（${hash}）は、${expected} 枚目に寄せる`, async ({ page }) => {
			await page.goto(`${DECK_PATH}${hash}`)
			await expectCurrent(page, expected)
		})
	}

	test('アドレスバーでハッシュを変えると、そのスライドに移る', async ({ page }) => {
		await page.goto(DECK_PATH)
		await page.evaluate(() => {
			location.hash = '#2'
		})
		await expectCurrent(page, 2)
		await page.keyboard.press('End')
		await page.evaluate(() => {
			location.hash = '#99'
		})
		await expect(page).toHaveURL(new RegExp(`#${TOTAL}$`))
	})

	test('画面の左の 3 分の 1 をクリックすると前へ、それ以外では次へ移る', async ({ page }) => {
		await page.goto(`${DECK_PATH}#2`)
		const y = LANDSCAPE.height / 2
		await page.mouse.click(LANDSCAPE.width * 0.8, y)
		await expectCurrent(page, 3)
		await page.mouse.click(LANDSCAPE.width * 0.5, y)
		await expectCurrent(page, 4)
		await page.mouse.click(LANDSCAPE.width * 0.1, y)
		await expectCurrent(page, 3)
	})

	test('横にスワイプすると移り、続くクリックはタップに数えない', async ({ page }) => {
		await page.goto(`${DECK_PATH}#2`)
		// Playwright にはスワイプの操作がないので、タッチのポインターイベントを送る
		const swipe = (fromX: number, toX: number) =>
			deck(page).evaluate(
				(element, points) => {
					const init = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientY: 300 }
					element.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: points.fromX }))
					element.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: points.toX }))
					element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: points.toX, clientY: 300 }))
				},
				{ fromX, toX },
			)
		await swipe(900, 600)
		await expectCurrent(page, 3)
		await swipe(300, 600)
		await expectCurrent(page, 2)
	})

	test('ノートの領域をクリックしても、スライドを移さない', async ({ page }) => {
		await page.goto(`${DECK_PATH}#2`)
		await page.keyboard.press('n')
		const notes = slides(page).nth(1).locator(':scope > aside')
		await expect(notes).toBeVisible()
		// 次へ進む側（左の 3 分の 1 の外）をクリックする
		const box = await notes.boundingBox()
		if (!box) throw new Error('ノートの領域の位置が取れない')
		await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2)
		await expectCurrent(page, 2)
	})

	test('今のスライドのノートだけがキーボードでフォーカスでき、名前が付いている', async ({ page }) => {
		await page.goto(DECK_PATH)
		await page.keyboard.press('n')
		const notes = slides(page).first().locator(':scope > aside')
		await expect(notes).toHaveAttribute('tabindex', '0')
		await expect(notes).toHaveAccessibleName(`スピーカーノート（1 / ${TOTAL}）`)
		// 今のスライドのほかは、Tab の止まる場所にしない
		await expect(page.locator('main.deck > section.slide > aside[tabindex]')).toHaveCount(1)
		await notes.focus()
		await expect(notes).toBeFocused()
		// フォーカスしたノートの上のスペースは、ノートのスクロールに残し、スライドを移さない
		await page.keyboard.press('Space')
		await expectCurrent(page, 1)

		// 移ると、移った先のスライドのノートに付け替える
		await page.keyboard.press('ArrowRight')
		await expectCurrent(page, 2)
		await expect(slides(page).nth(1).locator(':scope > aside')).toHaveAttribute('tabindex', '0')
		await expect(notes).not.toHaveAttribute('tabindex')
		await expect(page.locator('main.deck > section.slide > aside[tabindex]')).toHaveCount(1)
	})

	test('ノートにフォーカスがあるときの Page Up / Page Down と Home / End は、スライドを移さない', async ({ page }) => {
		await page.goto(`${DECK_PATH}#2`)
		await page.keyboard.press('n')
		const notes = slides(page).nth(1).locator(':scope > aside')
		await notes.focus()
		await page.keyboard.press('PageDown')
		await page.keyboard.press('End')
		await page.keyboard.press('PageUp')
		await page.keyboard.press('Home')
		await expectCurrent(page, 2)
		// 左右の矢印は、ノートの中でもスライドを移す
		await notes.focus()
		await page.keyboard.press('ArrowRight')
		await expectCurrent(page, 3)
	})

	test('印刷の前に縦に並べた形にしてすべてのスライドを出し、印刷の後に発表の表示に戻す', async ({ page }) => {
		await page.goto(`${DECK_PATH}#3`)
		await expectCurrent(page, 3)

		await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
		await page.emulateMedia({ media: 'print' })
		await expect(deck(page)).not.toHaveAttribute('data-view')
		await expect(page.locator('main.deck > section.slide:is([hidden], [inert], [data-slide])')).toHaveCount(0)
		const all = await slides(page).all()
		await Promise.all(all.map((slide) => expect(slide).toBeVisible()))

		await page.emulateMedia({ media: 'screen' })
		await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
		await expect(deck(page)).toHaveAttribute('data-view', 'present')
		await expectCurrent(page, 3)
	})

	test('印刷のメディアに替わったときも、すべてのスライドを出す', async ({ page }) => {
		await page.goto(`${DECK_PATH}#3`)
		await expectCurrent(page, 3)
		// beforeprint が起きない場合の備えとして、matchMedia('print') の change だけでも切り替わることを確かめる
		await page.emulateMedia({ media: 'print' })
		await expect(page.locator('main.deck > section.slide[hidden]')).toHaveCount(0)
		await page.emulateMedia({ media: 'screen' })
		await expectCurrent(page, 3)
	})

	test('N とボタンでノートの状態が切り替わり、aria-pressed が変わる', async ({ page }) => {
		await page.goto(DECK_PATH)
		const button = controlButton(page, 'ノート')
		await expect(deck(page)).toHaveAttribute('data-notes', 'hidden')
		await expect(button).toHaveAttribute('aria-pressed', 'false')

		await page.keyboard.press('n')
		await expect(deck(page)).toHaveAttribute('data-notes', 'shown')
		await expect(button).toHaveAttribute('aria-pressed', 'true')

		await button.click()
		await expect(deck(page)).toHaveAttribute('data-notes', 'hidden')
		await expect(button).toHaveAttribute('aria-pressed', 'false')
	})

	test('ノートを出すと、今のスライドのノートが見える', async ({ page }) => {
		await page.goto(DECK_PATH)
		await expect(slides(page).first().locator(':scope > aside')).toBeHidden()
		await page.keyboard.press('n')
		await expect(slides(page).first().locator(':scope > aside')).toBeVisible()
	})

	test('ボタンにフォーカスがあるときのスペースは、ボタンを押し、スライドを移さない', async ({ page }) => {
		await page.goto(DECK_PATH)
		await controlButton(page, 'ノート').focus()
		await page.keyboard.press('Space')
		await expect(deck(page)).toHaveAttribute('data-notes', 'shown')
		await expectCurrent(page, 1)
	})

	test('D でテーマが切り替わり、再読み込みしても残る', async ({ page }) => {
		await page.goto(DECK_PATH)
		const button = controlButton(page, 'ダーク')
		await expect(colorScheme(page)).toHaveAttribute('content', 'light only')
		await expect(button).toHaveAttribute('aria-pressed', 'false')

		await page.keyboard.press('d')
		await expect(colorScheme(page)).toHaveAttribute('content', 'dark only')
		await expect(button).toHaveAttribute('aria-pressed', 'true')

		await page.reload()
		await expect(colorScheme(page)).toHaveAttribute('content', 'dark only')
		await expect(button).toHaveAttribute('aria-pressed', 'true')

		await button.click()
		await expect(colorScheme(page)).toHaveAttribute('content', 'light only')
		await page.reload()
		await expect(colorScheme(page)).toHaveAttribute('content', 'light only')
	})

	test('ほかのウィンドウでテーマを切り替えると、このウィンドウにも写る', async ({ context }) => {
		const first = await context.newPage()
		await first.setViewportSize(LANDSCAPE)
		await first.goto(DECK_PATH)
		const second = await context.newPage()
		await second.setViewportSize(LANDSCAPE)
		await second.goto(DECK_PATH)
		await expect(colorScheme(second)).toHaveAttribute('content', 'light only')

		await first.keyboard.press('d')
		await expect(colorScheme(first)).toHaveAttribute('content', 'dark only')
		await expect(colorScheme(second)).toHaveAttribute('content', 'dark only')
		await expect(controlButton(second, 'ダーク')).toHaveAttribute('aria-pressed', 'true')

		await first.keyboard.press('d')
		await expect(colorScheme(second)).toHaveAttribute('content', 'light only')
	})

	test('localStorage が使えなくても、テーマを切り替えられる', async ({ page }) => {
		await page.addInitScript(() => {
			const fail = () => {
				throw new DOMException('denied', 'SecurityError')
			}
			Object.defineProperty(window, 'localStorage', { get: fail, configurable: true })
		})
		await page.goto(DECK_PATH)
		await expect(colorScheme(page)).toHaveAttribute('content', 'light only')
		await page.keyboard.press('d')
		await expect(colorScheme(page)).toHaveAttribute('content', 'dark only')
	})

	test('ボタンの名前は見えない文字で、キーは aria-keyshortcuts で伝え、名前とキーは読み上げないツールチップで見せる', async ({
		page,
	}) => {
		await page.goto(DECK_PATH)
		const expected = [
			{ name: '前へ', shortcuts: 'ArrowLeft PageUp Shift+Space', key: '←' },
			{ name: '次へ', shortcuts: 'ArrowRight PageDown Space', key: '→' },
			{ name: 'ノート', shortcuts: 'N', key: 'N' },
			{ name: '全画面', shortcuts: 'F', key: 'F' },
			{ name: '発表者ビュー', shortcuts: 'P', key: 'P' },
			{ name: 'ダーク', shortcuts: 'D', key: 'D' },
		]
		await Promise.all(
			expected.map(async ({ name, shortcuts, key }) => {
				// 中身の文字で探し、名前がその文字だけになる（キーやツールチップの文字が名前に混ざらない）ことを確かめる
				const button = controls(page).locator('button', { hasText: name })
				await expect(button).toHaveAccessibleName(name)
				await expect(button).toHaveAttribute('aria-keyshortcuts', shortcuts)
				// ブラウザのツールチップは使わない
				await expect(button).not.toHaveAttribute('title')
				const tooltip = button.locator('._tooltip')
				await expect(tooltip).toHaveAttribute('aria-hidden', 'true')
				await expect(tooltip).toHaveText(`${name}${key}`)
				await expect(tooltip.locator('kbd')).toHaveText(key)
				// アイコンは飾りなので、読み上げから隠す
				await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true')
			}),
		)
	})

	test('ハイライトは帯の擬似要素で 1 つだけ描き、読み上げない', async ({ page }) => {
		await page.goto(DECK_PATH)
		// ハイライトは飾りなので、マークアップに要素を置かず、帯の ::before で描く
		await expect(controls(page).locator('._highlight')).toHaveCount(0)
		// content が空の文字列で始まれば、擬似要素が描かれ、読み上げる文字もない（代替の文字を付けた形 `"" / ""` も含む）
		const content = await controls(page).evaluate((element) => getComputedStyle(element, '::before').content)
		expect(content).toMatch(/^""/)
		// 矢印キーはスライドの移動に使うので、帯をツールバーにしない
		await expect(controls(page).getByRole('toolbar')).toHaveCount(0)
	})

	test('ボタンの間の隙間と組の間の区切り線の上でも、どれかのボタンに当たり、ハイライトとツールチップが消えない', async ({
		page,
	}) => {
		// 1 枚目では前へが押せず、ハイライトを置かないので、両端のボタンがどちらも押せる 2 枚目で試す
		await page.goto(`${DECK_PATH}#2`)
		// 操作の部分は、ポインターが動かないと隠れて押せなくなるので、先に動かして出しておく
		await page.mouse.move(LANDSCAPE.width / 2, LANDSCAPE.height / 2)
		await expect(controls(page)).not.toHaveAttribute('data-idle')
		const points = await expectHoverAcrossBandGaps(page, controls(page))
		expect(points.map(({ label }) => label)).toContain('区切り線の上')
	})

	test('全画面に対応していれば全画面のボタンを出し、対応していなければ出さない', async ({ page }) => {
		await page.goto(DECK_PATH)
		const enabled = await page.evaluate(() => document.fullscreenEnabled)
		await expect(controls(page).locator('[data-action="fullscreen"]')).toBeVisible({ visible: enabled })
	})

	test('見えないスライドにはフォーカスが移らない', async ({ page }) => {
		await page.goto(DECK_PATH)
		// 最後のスライドにだけリンクがある。1 枚目を表示している間は、Tab で一周してもそのリンクに止まらない
		await expect(lastSlideLink(page)).toHaveCount(1)
		for (let i = 0; i < 12; i++) {
			// Tab は前の Tab の位置から進むので、順に押す
			// oxlint-disable-next-line no-await-in-loop
			await page.keyboard.press('Tab')
			// oxlint-disable-next-line no-await-in-loop
			const isInHiddenSlide = await page.evaluate(
				() => document.activeElement?.closest('section.slide:not([data-slide="current"])') != null,
			)
			expect(isInHiddenSlide).toBe(false)
		}
		// 最後のスライドに移ると、そのリンクにフォーカスできる
		await page.keyboard.press('End')
		await lastSlideLink(page).focus()
		await expect(lastSlideLink(page)).toBeFocused()
	})

	test('リンクにフォーカスがあるときのスペースでは、スライドを移さない', async ({ page }) => {
		await page.goto(`${DECK_PATH}#${TOTAL}`)
		await lastSlideLink(page).focus()
		await page.keyboard.press('Shift+Space')
		await expectCurrent(page, TOTAL)
	})

	test('マウスを 2 秒動かさないと操作の部分に data-idle が付き、動かすと外れる', async ({ page }) => {
		await page.clock.install()
		await page.goto(DECK_PATH)
		await expect(controls(page)).not.toHaveAttribute('data-idle')
		await page.clock.runFor(IDLE_DELAY_MS + 100)
		await expect(controls(page)).toHaveAttribute('data-idle')
		await page.mouse.move(100, 100)
		await page.mouse.move(200, 200)
		await expect(controls(page)).not.toHaveAttribute('data-idle')
	})

	test('キーボードのフォーカスが操作の部分にある間は、data-idle を付けない', async ({ page }) => {
		await page.clock.install()
		await page.goto(DECK_PATH)
		// WebKit は既定で Tab がボタンに止まらないので、キーを押してから（キーボードの操作の直後として :focus-visible が付く）
		// スクリプトでフォーカスを移す
		await page.keyboard.press('Shift')
		await controlButton(page, '次へ').focus()
		expect(await controlButton(page, '次へ').evaluate((element) => element.matches(':focus-visible'))).toBe(true)
		await page.clock.runFor(IDLE_DELAY_MS + 100)
		await expect(controls(page)).not.toHaveAttribute('data-idle')
	})

	test('P で、?presenter を付けた発表者ビューを別のウィンドウで開く', async ({ page }) => {
		await page.goto(`${DECK_PATH}#2`)
		const [popup] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
		await popup.waitForLoadState()
		expect(new URL(popup.url()).search).toBe('?presenter')
		await expect(popup).toHaveURL(/#2$/)
		await expect(popup.locator('main.deck')).toHaveAttribute('data-view', 'presenter')
	})
})

test.describe('画面の向きが変わったとき', () => {
	test.use({ viewport: LANDSCAPE })

	test('縦長にすると縦に並べた形に戻り、横長に戻すと発表の表示になる', async ({ page }) => {
		await page.goto(`${DECK_PATH}#3`)
		await expectCurrent(page, 3)

		await page.setViewportSize(PORTRAIT)
		await expect(deck(page)).not.toHaveAttribute('data-view')
		await expect(controls(page)).toBeHidden()
		await expect(page.locator('main.deck > section.slide[hidden]')).toHaveCount(0)

		await page.setViewportSize(LANDSCAPE)
		await expect(deck(page)).toHaveAttribute('data-view', 'present')
		await expectCurrent(page, 3)
	})
})

/** 縦に並べた形のままで、操作の部分が出ていないことを確かめる */
const expectScrollView = async (page: Page) => {
	await expect(deck(page)).not.toHaveAttribute('data-view')
	await expect(controls(page)).toBeHidden()
	await expect(page.locator('.presenter-timer')).toBeHidden()
	await expect(slides(page)).toHaveCount(TOTAL)
	await expect(page.locator('main.deck > section.slide:is([hidden], [inert], [data-slide])')).toHaveCount(0)
	await expect(slides(page).last()).toBeVisible()
}

test.describe('縦長の画面', () => {
	test.use({ viewport: PORTRAIT })

	test('縦に並べた形のままで、操作の部分が出ない', async ({ page }) => {
		await page.goto(`${DECK_PATH}#2`)
		await expectScrollView(page)
	})

	test('ノートは Tab の止まる場所にしない', async ({ page }) => {
		await page.goto(DECK_PATH)
		await expect(page.locator('main.deck > section.slide > aside').first()).toBeVisible()
		await expect(page.locator('main.deck > section.slide > aside[tabindex]')).toHaveCount(0)
	})

	// 縦に並べる形のノートは縦長の画面でだけ出るので、幅の広い場合も高さを幅より大きくする。
	// セーフエリア（env(safe-area-inset-*)）は Playwright では 0 なので、ページの余白のほうが選ばれる
	for (const width of [375, 828, 1280, 1920]) {
		test(`幅 ${width}px で、ノートの左右の余白がページの余白になる`, async ({ page }) => {
			await page.setViewportSize({ width, height: width + 400 })
			await page.goto(DECK_PATH)
			const notes = page.locator('.slide > aside').first()
			await expect(notes).toBeVisible()
			const { start, end } = await paddingInline(notes)
			expect(start).toBeCloseTo(expectedPageGutter(width), 0)
			expect(end).toBe(start)
		})
	}

	test('ノートに面の色と上の辺の線が付く', async ({ page }) => {
		await page.goto(DECK_PATH)
		const notes = page.locator('.slide > aside').first()
		await expect(notes).toBeVisible()
		const surface = await resolveBackgroundToken(page, '--background--surface')
		const base = await resolveBackgroundToken(page, '--background--base')
		const documentBackground = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
		// 面の色が枠の外の色と同じだと、色が付いたかどうかを見分けられない
		expect(surface).not.toBe(base)
		await expect(notes).toHaveCSS('background-color', surface)
		expect(surface).not.toBe(documentBackground)
		await expect(notes).toHaveCSS('border-top-width', '1px')
		await expect(notes).toHaveCSS('border-top-style', 'solid')
	})

	test('#3 で開くと 3 枚目までスクロールし、ハッシュを変えるとそのスライドまでスクロールする', async ({ page }) => {
		await page.goto(`${DECK_PATH}#3`)
		await expect(slides(page).nth(2)).toBeInViewport()
		await expect(slides(page).first()).not.toBeInViewport()
		await page.evaluate(() => {
			location.hash = '#5'
		})
		await expect(slides(page).nth(4)).toBeInViewport()
		await expect(slides(page).nth(2)).not.toBeInViewport()
	})

	test('キーでスライドを移さず、ハッシュも書き換えない', async ({ page }) => {
		await page.goto(DECK_PATH)
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('n')
		await expect(page).toHaveURL(/\/$/)
		await expect(deck(page)).not.toHaveAttribute('data-notes')
	})
})

test.describe('JavaScript が動かない環境（横長の画面）', () => {
	test.use({ viewport: LANDSCAPE, javaScriptEnabled: false })

	test('縦に並べた形のままで、操作の部分が出ない', async ({ page }) => {
		await page.goto(DECK_PATH)
		await expectScrollView(page)
	})
})

test.describe('発表者ビュー', () => {
	test.use({ viewport: LANDSCAPE })

	test('今のスライドと前と次のスライドを属性で示し、前と次のスライドは操作できない', async ({ page }) => {
		await page.goto(`${DECK_PATH}?presenter#2`)
		await expect(deck(page)).toHaveAttribute('data-view', 'presenter')
		await expect(deck(page)).toHaveAttribute('data-notes', 'shown')
		await expect(slides(page).nth(0)).toHaveAttribute('data-slide', 'prev')
		await expect(slides(page).nth(1)).toHaveAttribute('data-slide', 'current')
		await expect(slides(page).nth(2)).toHaveAttribute('data-slide', 'next')
		await expect(slides(page).nth(0)).toHaveJSProperty('inert', true)
		await expect(slides(page).nth(2)).toHaveJSProperty('inert', true)
		await expect(slides(page).nth(1)).toHaveJSProperty('inert', false)
		await expect(page.locator('main.deck > section.slide:not([hidden])')).toHaveCount(3)
		// ノートを読むのは今のスライドだけなので、前と次のスライドのノートは Tab の止まる場所にしない
		await expect(slides(page).nth(1).locator(':scope > aside')).toHaveAttribute('tabindex', '0')
		await expect(page.locator('main.deck > section.slide > aside[tabindex]')).toHaveCount(1)
		// 発表者ビューでは、ノートを隠すボタンと、さらに発表者ビューを開くボタンを出さない
		await expect(controls(page).locator('[data-action="notes"]')).toBeHidden()
		await expect(controls(page).locator('[data-action="presenter"]')).toBeHidden()
	})

	test('最初のスライドでは、前のスライドがない', async ({ page }) => {
		await page.goto(`${DECK_PATH}?presenter#1`)
		await expect(slides(page).nth(0)).toHaveAttribute('data-slide', 'current')
		await expect(slides(page).nth(1)).toHaveAttribute('data-slide', 'next')
		await expect(page.locator('[data-slide="prev"]')).toHaveCount(0)
	})

	test('最後のスライドでは、次のスライドがない', async ({ page }) => {
		await page.goto(`${DECK_PATH}?presenter#${TOTAL}`)
		await expect(slides(page).nth(TOTAL - 1)).toHaveAttribute('data-slide', 'current')
		await expect(page.locator('[data-slide="next"]')).toHaveCount(0)
	})

	// 16:10 と 16:9 の画面で、経過時間、デッキ、操作の部分が画面の高さに収まり、ノートが操作の部分のすぐ上まで届く（DESIGN.md の「発表者ビュー」）
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 1280, height: 800 },
		{ width: 1280, height: 720 },
		{ width: 1920, height: 1080 },
	]) {
		test(`${viewport.width}×${viewport.height} で、枠が画面に収まり、ノートが下の端まで届く`, async ({ page }) => {
			await page.setViewportSize(viewport)
			await page.goto(`${DECK_PATH}?presenter#2`)
			await expect(deck(page)).toHaveAttribute('data-view', 'presenter')
			const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
			const box = async (selector: string) => {
				const found = await page.locator(selector).boundingBox()
				if (!found) throw new Error(`${selector} の位置が取れない`)
				return found
			}
			const notes = await box('.slide[data-slide="current"] > aside')
			const band = await box('.deck-controls')
			const frames = await Promise.all(
				['current', 'prev', 'next'].map((name) => box(`.slide[data-slide="${name}"] > ._frame`)),
			)
			// 操作の部分は画面の下の端から 1rem、ノートはその 1rem 上で終わる
			expect(band.y + band.height).toBeCloseTo(viewport.height - rem, 0)
			expect(notes.y + notes.height).toBeCloseTo(band.y - rem, 0)
			for (const frame of frames) {
				// 枠は 16:9 のまま、ノートの下端より上に収まり、ノートの左に 1rem 以上離れる
				expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1)
				expect(frame.y + frame.height).toBeLessThanOrEqual(notes.y + notes.height + 1)
				expect(frame.x + frame.width).toBeLessThanOrEqual(notes.x - rem + 1)
			}
			const [current, prev, next] = frames
			if (!current || !prev || !next) throw new Error('枠が 3 つ取れない')
			// 前と次は今のスライドの下に、間を 1rem 以上空けて並ぶ
			expect(prev.y).toBeGreaterThanOrEqual(current.y + current.height + rem - 1)
			expect(next.x).toBeGreaterThanOrEqual(prev.x + prev.width + rem - 1)
		})
	}

	// 発表者ビューでは、画面の端の余白とセーフエリアを body の余白で取るので、ノートはページの余白だけにする
	for (const viewport of [
		{ width: 375, height: 812 },
		{ width: 828, height: 1200 },
		{ width: 1280, height: 800 },
		{ width: 1920, height: 1080 },
	]) {
		test(`${viewport.width}×${viewport.height} で、ノートの左右の余白がページの余白になる`, async ({ page }) => {
			await page.setViewportSize(viewport)
			await page.goto(`${DECK_PATH}?presenter#2`)
			await expect(deck(page)).toHaveAttribute('data-view', 'presenter')
			const notes = page.locator('.slide[data-slide="current"] > aside')
			await expect(notes).toBeVisible()
			const { start, end } = await paddingInline(notes)
			expect(start).toBeCloseTo(expectedPageGutter(viewport.width), 0)
			expect(end).toBe(start)
		})
	}

	test('操作の部分は画面の左下に中身の幅で置き、ツールチップをボタンの上に出す', async ({ page }) => {
		const viewport = { width: 1440, height: 900 }
		await page.setViewportSize(viewport)
		await page.goto(`${DECK_PATH}?presenter#2`)
		await expect(deck(page)).toHaveAttribute('data-view', 'presenter')
		const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
		const band = await controls(page).boundingBox()
		if (!band) throw new Error('操作の部分の位置が取れない')
		expect(band.x).toBeCloseTo(rem, 0)
		expect(band.y + band.height).toBeCloseTo(viewport.height - rem, 0)
		expect(band.width).toBeLessThan(viewport.width / 2)
		const button = controlButton(page, '次へ')
		const buttonBox = await button.boundingBox()
		const tooltipBox = await button.locator('._tooltip').boundingBox()
		if (!buttonBox || !tooltipBox) throw new Error('ボタンとツールチップの位置が取れない')
		// 位置はボタンの枠線の内側から測るので、ボタンの枠線（1px）の分だけずれてよい
		expect(Math.abs(tooltipBox.y + tooltipBox.height - (buttonBox.y - 0.375 * rem))).toBeLessThanOrEqual(1.5)
		// ツールチップを上に出すので、画面が縦にスクロールしない
		expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height)
	})

	test('縦長の画面でも発表者ビューになる', async ({ page }) => {
		await page.setViewportSize(PORTRAIT)
		await page.goto(`${DECK_PATH}?presenter`)
		await expect(deck(page)).toHaveAttribute('data-view', 'presenter')
	})

	test('開いたときは止まっていて、再生で数え、一時停止は値を残し、停止で 0 に戻す', async ({ page }) => {
		// Date.now() を固定し、時間はテストが進めた分だけ経つようにする。
		// install() のままでは時計が実時間でも進み、遅いブラウザ（Firefox）で 1 秒ずれて失敗することがあったため。
		// 1 秒ごとの描き直しは本物のタイマーで動くので、固定した時刻を進めたあとの表示を待てる
		await page.clock.setFixedTime(TIMER_START)
		await page.goto(`${DECK_PATH}?presenter`)
		const timer = page.locator('.presenter-timer')
		const elapsed = timer.getByRole('timer').locator('time')
		const play = timerButton(page, '再生')
		const pause = timerButton(page, '一時停止')
		const stop = timerButton(page, '停止')
		const expectDisabled = async (expected: { play: boolean; pause: boolean; stop: boolean }) => {
			await expect(play).toHaveAttribute('aria-disabled', String(expected.play))
			await expect(pause).toHaveAttribute('aria-disabled', String(expected.pause))
			await expect(stop).toHaveAttribute('aria-disabled', String(expected.stop))
		}

		await expect(timer).toBeVisible()
		await expect(elapsed).toHaveText('0 分 0 秒')
		await expectTimerDigits(page, [0, 0, 0, 0])
		await expectDisabled({ play: false, pause: true, stop: true })
		// 再生する前の時間は数えない（下の 1 分 5 秒は、再生を押した時刻から数えた値）
		await page.clock.setFixedTime(TIMER_START + 10_000)
		// aria-disabled のボタンを押しても何もしない。
		// Playwright の click() は aria-disabled のボタンを押せるようになるまで待つので、click のイベントを直接送る
		await stop.dispatchEvent('click')
		await pause.dispatchEvent('click')
		await expectDisabled({ play: false, pause: true, stop: true })

		await play.click()
		await expectDisabled({ play: true, pause: false, stop: false })
		await page.clock.setFixedTime(TIMER_START + 10_000 + 65_000)
		await expect(elapsed).toHaveText('1 分 5 秒')
		await expect(elapsed).toHaveAttribute('datetime', 'PT1M5S')
		await expectTimerDigits(page, [0, 1, 0, 5])

		await pause.click()
		await expectDisabled({ play: false, pause: true, stop: false })
		// 一時停止の間は数えず、再生すると続きから数える
		await page.clock.setFixedTime(TIMER_START + 200_000)
		await play.click()
		await page.clock.setFixedTime(TIMER_START + 210_000)
		await expect(elapsed).toHaveText('1 分 15 秒')
		await expectTimerDigits(page, [0, 1, 1, 5])

		await stop.click()
		await expect(elapsed).toHaveText('0 分 0 秒')
		await expectTimerDigits(page, [0, 0, 0, 0])
		await expectDisabled({ play: false, pause: true, stop: true })
		// 停止の後に再生すると、0 から数える
		await page.clock.setFixedTime(TIMER_START + 300_000)
		await play.click()
		await page.clock.setFixedTime(TIMER_START + 305_000)
		await expect(elapsed).toHaveText('0 分 5 秒')
	})

	test('タイマーのボタンの名前は見えない文字で、名前は読み上げないツールチップで見せ、キーは割り当てない', async ({
		page,
	}) => {
		await page.goto(`${DECK_PATH}?presenter`)
		await Promise.all(
			['再生', '一時停止', '停止'].map(async (name) => {
				const button = timerButton(page, name)
				await expect(button).toHaveCount(1)
				await expect(button).not.toHaveAttribute('aria-keyshortcuts')
				await expect(button).not.toHaveAttribute('title')
				const tooltip = button.locator('._tooltip')
				await expect(tooltip).toHaveAttribute('aria-hidden', 'true')
				await expect(tooltip).toHaveText(name)
				await expect(tooltip.locator('kbd')).toHaveCount(0)
				await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true')
			}),
		)
	})

	test('操作の部分とタイマーのボタンの間の隙間と区切り線の上でも、どれかのボタンに当たり、ハイライトとツールチップが消えない', async ({
		page,
	}) => {
		await page.goto(`${DECK_PATH}?presenter#2`)
		await expect(deck(page)).toHaveAttribute('data-view', 'presenter')
		await page.mouse.move(LANDSCAPE.width / 2, LANDSCAPE.height / 2)
		await expect(controls(page)).not.toHaveAttribute('data-idle')
		const points = await expectHoverAcrossBandGaps(page, controls(page))
		expect(points.map(({ label }) => label)).toContain('区切り線の上')

		// 止まっている間は一時停止と停止が押せず、ハイライトを確かめられないので、再生して 2 つを押せる状態にする
		await timerButton(page, '再生').click()
		await expect(timerButton(page, '停止')).toHaveAttribute('aria-disabled', 'false')
		await expectHoverAcrossBandGaps(page, page.locator('.presenter-timer ._controls'))
	})

	test('99 分を超えると、見える数字は 99:59 で止め、読み上げは実際の時間を伝える', async ({ page }) => {
		await page.clock.setFixedTime(TIMER_START)
		await page.goto(`${DECK_PATH}?presenter`)
		await timerButton(page, '再生').click()
		await page.clock.setFixedTime(TIMER_START + (100 * 60 + 5) * 1000)
		const elapsed = page.getByRole('timer').locator('time')
		await expect(elapsed).toHaveText('100 分 5 秒')
		await expect(elapsed).toHaveAttribute('datetime', 'PT100M5S')
		await expectTimerDigits(page, [9, 9, 5, 9])
	})

	test('経過時間の見える数字は読み上げない', async ({ page }) => {
		await page.goto(`${DECK_PATH}?presenter`)
		await expect(page.getByRole('timer').locator('._digits')).toHaveAttribute('aria-hidden', 'true')
	})

	test('2 つのウィンドウのどちらで移っても、両方が同じスライドに移る', async ({ context }) => {
		const audience = await context.newPage()
		await audience.setViewportSize(LANDSCAPE)
		await audience.goto(DECK_PATH)
		const presenter = await context.newPage()
		await presenter.setViewportSize(LANDSCAPE)
		await presenter.goto(`${DECK_PATH}?presenter`)

		await audience.keyboard.press('ArrowRight')
		await expectCurrent(audience, 2)
		await expect(slides(presenter).nth(1)).toHaveAttribute('data-slide', 'current')
		await expect(presenter).toHaveURL(/#2$/)

		await presenter.keyboard.press('End')
		await expect(slides(presenter).nth(TOTAL - 1)).toHaveAttribute('data-slide', 'current')
		await expectCurrent(audience, TOTAL)
	})
})
