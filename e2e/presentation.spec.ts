// 発表のための操作（src/scripts/deck.ts）を確かめる。
// 横長の画面で JavaScript が動くときだけ 1 枚ずつ表示し、縦長の画面と JavaScript が動かない環境では縦に並べた形のままにする。
// 見本のデッキ（src/pages/index.astro）は、最後の 1 枚にだけリンクがある
import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

// 枚数は、見本のデッキの `const total = …` から読む。テストの名前（#99 を寄せる先）にも使うので、ページを開く前に決める。
// 実際のスライドの数と食い違えば、縦に並べた形のテスト（expectScrollView）で落ちる
const readTotal = () => {
	const source = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8')
	const match = /^const total = (\d+)$/m.exec(source)
	if (!match?.[1]) throw new Error('src/pages/index.astro に `const total = <数>` が見つからない')
	return Number(match[1])
}
const TOTAL = readTotal()
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

test.describe('横長の画面', () => {
	test.use({ viewport: LANDSCAPE })

	test('発表の表示になり、1 枚目から始まり、操作の部分が出る', async ({ page }) => {
		await page.goto('/')
		await expect(deck(page)).toHaveAttribute('data-view', 'present')
		await expectCurrent(page, 1)
		await expect(controls(page)).toBeVisible()
		await expect(controls(page).locator('._position')).toHaveText(`スライド 1 / ${TOTAL}`)
		await expect(deck(page)).toHaveCSS('--deck-controls--progress', String(1 / TOTAL))
	})

	test('今のスライドだけが見える', async ({ page }) => {
		await page.goto('/')
		const all = await slides(page).all()
		await Promise.all(all.map((slide, i) => (i === 0 ? expect(slide).toBeVisible() : expect(slide).toBeHidden())))
	})

	test('矢印キー、スペース、Page Up / Page Down、Home / End で移り、ハッシュが変わる', async ({ page }) => {
		await page.goto('/')
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
		await page.goto('/')
		const length = await page.evaluate(() => history.length)
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await expectCurrent(page, 3)
		expect(await page.evaluate(() => history.length)).toBe(length)
	})

	test('修飾キーの付いたキーでは移らない', async ({ page }) => {
		await page.goto('/')
		await page.keyboard.press('Control+ArrowRight')
		await page.keyboard.press('Control+Space')
		await expectCurrent(page, 1)
	})

	test('前へ、次へのボタンで移り、端のボタンは aria-disabled になる', async ({ page }) => {
		await page.goto('/')
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
		await page.goto('/#3')
		await expectCurrent(page, 3)
	})

	for (const { hash, expected } of [
		{ hash: '#0', expected: 1 },
		{ hash: '#99', expected: TOTAL },
		{ hash: '#abc', expected: 1 },
	]) {
		test(`範囲の外や数でないハッシュ（${hash}）は、${expected} 枚目に寄せる`, async ({ page }) => {
			await page.goto(`/${hash}`)
			await expectCurrent(page, expected)
		})
	}

	test('アドレスバーでハッシュを変えると、そのスライドに移る', async ({ page }) => {
		await page.goto('/')
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
		await page.goto('/#2')
		const y = LANDSCAPE.height / 2
		await page.mouse.click(LANDSCAPE.width * 0.8, y)
		await expectCurrent(page, 3)
		await page.mouse.click(LANDSCAPE.width * 0.5, y)
		await expectCurrent(page, 4)
		await page.mouse.click(LANDSCAPE.width * 0.1, y)
		await expectCurrent(page, 3)
	})

	test('横にスワイプすると移り、続くクリックはタップに数えない', async ({ page }) => {
		await page.goto('/#2')
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

	test('N とボタンでノートの状態が切り替わり、aria-pressed が変わる', async ({ page }) => {
		await page.goto('/')
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
		await page.goto('/')
		await expect(slides(page).first().locator('._notes')).toBeHidden()
		await page.keyboard.press('n')
		await expect(slides(page).first().locator('._notes')).toBeVisible()
	})

	test('ボタンにフォーカスがあるときのスペースは、ボタンを押し、スライドを移さない', async ({ page }) => {
		await page.goto('/')
		await controlButton(page, 'ノート').focus()
		await page.keyboard.press('Space')
		await expect(deck(page)).toHaveAttribute('data-notes', 'shown')
		await expectCurrent(page, 1)
	})

	test('D でテーマが切り替わり、再読み込みしても残る', async ({ page }) => {
		await page.goto('/')
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

	test('localStorage が使えなくても、テーマを切り替えられる', async ({ page }) => {
		await page.addInitScript(() => {
			const fail = () => {
				throw new DOMException('denied', 'SecurityError')
			}
			Object.defineProperty(window, 'localStorage', { get: fail, configurable: true })
		})
		await page.goto('/')
		await expect(colorScheme(page)).toHaveAttribute('content', 'light only')
		await page.keyboard.press('d')
		await expect(colorScheme(page)).toHaveAttribute('content', 'dark only')
	})

	test('ボタンの名前は見えない文字で、キーは aria-keyshortcuts で伝え、名前とキーは読み上げないツールチップで見せる', async ({
		page,
	}) => {
		await page.goto('/')
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
		await page.goto('/')
		// ハイライトは飾りなので、マークアップに要素を置かず、帯の ::before で描く
		await expect(controls(page).locator('._highlight')).toHaveCount(0)
		// content が空の文字列で始まれば、擬似要素が描かれ、読み上げる文字もない（代替の文字を付けた形 `"" / ""` も含む）
		const content = await controls(page).evaluate((element) => getComputedStyle(element, '::before').content)
		expect(content).toMatch(/^""/)
		// 矢印キーはスライドの移動に使うので、帯をツールバーにしない
		await expect(controls(page).getByRole('toolbar')).toHaveCount(0)
	})

	test('全画面に対応していれば全画面のボタンを出し、対応していなければ出さない', async ({ page }) => {
		await page.goto('/')
		const enabled = await page.evaluate(() => document.fullscreenEnabled)
		await expect(controls(page).locator('[data-action="fullscreen"]')).toBeVisible({ visible: enabled })
	})

	test('見えないスライドにはフォーカスが移らない', async ({ page }) => {
		await page.goto('/')
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
		await page.goto(`/#${TOTAL}`)
		await lastSlideLink(page).focus()
		await page.keyboard.press('Shift+Space')
		await expectCurrent(page, TOTAL)
	})

	test('マウスを 2 秒動かさないと操作の部分に data-idle が付き、動かすと外れる', async ({ page }) => {
		await page.clock.install()
		await page.goto('/')
		await expect(controls(page)).not.toHaveAttribute('data-idle')
		await page.clock.runFor(IDLE_DELAY_MS + 100)
		await expect(controls(page)).toHaveAttribute('data-idle')
		await page.mouse.move(100, 100)
		await page.mouse.move(200, 200)
		await expect(controls(page)).not.toHaveAttribute('data-idle')
	})

	test('キーボードのフォーカスが操作の部分にある間は、data-idle を付けない', async ({ page }) => {
		await page.clock.install()
		await page.goto('/')
		// WebKit は既定で Tab がボタンに止まらないので、キーを押してから（キーボードの操作の直後として :focus-visible が付く）
		// スクリプトでフォーカスを移す
		await page.keyboard.press('Shift')
		await controlButton(page, '次へ').focus()
		expect(await controlButton(page, '次へ').evaluate((element) => element.matches(':focus-visible'))).toBe(true)
		await page.clock.runFor(IDLE_DELAY_MS + 100)
		await expect(controls(page)).not.toHaveAttribute('data-idle')
	})

	test('P で、?presenter を付けた発表者ビューを別のウィンドウで開く', async ({ page }) => {
		await page.goto('/#2')
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
		await page.goto('/#3')
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
		await page.goto('/#2')
		await expectScrollView(page)
	})

	test('キーでスライドを移さず、ハッシュも書き換えない', async ({ page }) => {
		await page.goto('/')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('n')
		await expect(page).toHaveURL(/\/$/)
		await expect(deck(page)).not.toHaveAttribute('data-notes')
	})
})

test.describe('JavaScript が動かない環境（横長の画面）', () => {
	test.use({ viewport: LANDSCAPE, javaScriptEnabled: false })

	test('縦に並べた形のままで、操作の部分が出ない', async ({ page }) => {
		await page.goto('/')
		await expectScrollView(page)
	})
})

test.describe('発表者ビュー', () => {
	test.use({ viewport: LANDSCAPE })

	test('今のスライドと次のスライドを属性で示し、次のスライドは操作できない', async ({ page }) => {
		await page.goto('/?presenter#2')
		await expect(deck(page)).toHaveAttribute('data-view', 'presenter')
		await expect(deck(page)).toHaveAttribute('data-notes', 'shown')
		await expect(slides(page).nth(1)).toHaveAttribute('data-slide', 'current')
		await expect(slides(page).nth(2)).toHaveAttribute('data-slide', 'next')
		await expect(slides(page).nth(2)).toHaveJSProperty('inert', true)
		await expect(slides(page).nth(1)).toHaveJSProperty('inert', false)
		await expect(page.locator('main.deck > section.slide:not([hidden])')).toHaveCount(2)
		// 発表者ビューでは、ノートを隠すボタンと、さらに発表者ビューを開くボタンを出さない
		await expect(controls(page).locator('[data-action="notes"]')).toBeHidden()
		await expect(controls(page).locator('[data-action="presenter"]')).toBeHidden()
	})

	test('最後のスライドでは、次のスライドがない', async ({ page }) => {
		await page.goto(`/?presenter#${TOTAL}`)
		await expect(slides(page).nth(TOTAL - 1)).toHaveAttribute('data-slide', 'current')
		await expect(page.locator('[data-slide="next"]')).toHaveCount(0)
	})

	test('縦長の画面でも発表者ビューになる', async ({ page }) => {
		await page.setViewportSize(PORTRAIT)
		await page.goto('/?presenter')
		await expect(deck(page)).toHaveAttribute('data-view', 'presenter')
	})

	test('経過時間を分と秒で出し、ボタンで 0 に戻す', async ({ page }) => {
		// Date.now() を固定し、時間はテストが進めた分だけ経つようにする。
		// install() のままでは時計が実時間でも進み、遅いブラウザ（Firefox）で 1 秒ずれて失敗することがあったため。
		// 1 秒ごとの描き直しは本物のタイマーで動くので、固定した時刻を進めたあとの表示を待てる
		await page.clock.setFixedTime(TIMER_START)
		await page.goto('/?presenter')
		const timer = page.locator('.presenter-timer')
		const elapsed = timer.getByRole('timer').locator('time')
		await expect(timer).toBeVisible()
		await expect(elapsed).toHaveText('0 分 0 秒')
		await expectTimerDigits(page, [0, 0, 0, 0])

		await page.clock.setFixedTime(TIMER_START + 65_000)
		await expect(elapsed).toHaveText('1 分 5 秒')
		await expect(elapsed).toHaveAttribute('datetime', 'PT1M5S')
		await expectTimerDigits(page, [0, 1, 0, 5])

		const reset = timer.getByRole('button', { name: '時間を 0に戻す', exact: true })
		// 見えるラベルが名前に含まれる（WCAG 2.5.3）。
		// 見えない「時間を」は position: fixed で block になるので、名前の計算で後ろに空白が入る
		await expect(reset).toContainText('0に戻す')
		await reset.click()
		await expect(elapsed).toHaveText('0 分 0 秒')
		await expectTimerDigits(page, [0, 0, 0, 0])
	})

	test('99 分を超えると、見える数字は 99:59 で止め、読み上げは実際の時間を伝える', async ({ page }) => {
		await page.clock.setFixedTime(TIMER_START)
		await page.goto('/?presenter')
		await page.clock.setFixedTime(TIMER_START + (100 * 60 + 5) * 1000)
		const elapsed = page.getByRole('timer').locator('time')
		await expect(elapsed).toHaveText('100 分 5 秒')
		await expect(elapsed).toHaveAttribute('datetime', 'PT100M5S')
		await expectTimerDigits(page, [9, 9, 5, 9])
	})

	test('経過時間の見える数字は読み上げない', async ({ page }) => {
		await page.goto('/?presenter')
		await expect(page.getByRole('timer').locator('._digits')).toHaveAttribute('aria-hidden', 'true')
	})

	test('2 つのウィンドウのどちらで移っても、両方が同じスライドに移る', async ({ context }) => {
		const audience = await context.newPage()
		await audience.setViewportSize(LANDSCAPE)
		await audience.goto('/')
		const presenter = await context.newPage()
		await presenter.setViewportSize(LANDSCAPE)
		await presenter.goto('/?presenter')

		await audience.keyboard.press('ArrowRight')
		await expectCurrent(audience, 2)
		await expect(slides(presenter).nth(1)).toHaveAttribute('data-slide', 'current')
		await expect(presenter).toHaveURL(/#2$/)

		await presenter.keyboard.press('End')
		await expect(slides(presenter).nth(TOTAL - 1)).toHaveAttribute('data-slide', 'current')
		await expectCurrent(audience, TOTAL)
	})
})
