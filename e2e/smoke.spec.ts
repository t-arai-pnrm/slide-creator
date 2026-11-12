// 仮のページで、ビルドした dist を preview で配信して開くまでの流れが通ることを確かめる。
// スライドの機能ができて仮のページを置き換えたら、このテストも置き換える
import { expect, test } from '@playwright/test'

test('仮のページが開き、タイトルと見出しが出る', async ({ page }) => {
	await page.goto('/')
	await expect(page).toHaveTitle('slide-creator')
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('slide-creator')
})
