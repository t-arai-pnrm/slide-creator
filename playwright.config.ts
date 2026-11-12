/**
 * ブラウザで動かすテスト（pnpm test:e2e）。テストは e2e/ に *.spec.ts で置く。
 * 配る HTML と同じものを試すため、ビルドした dist を astro preview で配信して開く。先に pnpm build を実行しておく。
 * 3 つのエンジンで動かすのは、文字の幅や行の折り返しがエンジンごとに違い、スライドのはみ出しの結果が変わりうるため。
 */
import { defineConfig, devices } from '@playwright/test'

// 手元の確認用のサーバー（.claude/launch.json の slide-creator-preview は 4360）とぶつからないよう、テスト専用のポートにする
const PORT = 4370
const ORIGIN = `http://127.0.0.1:${PORT}`
const isCI = Boolean(process.env.CI)

export default defineConfig({
	testDir: 'e2e',
	// 失敗したときの記録（trace）は、Git が無視する node_modules の中に置く
	outputDir: 'node_modules/.cache/playwright',
	forbidOnly: isCI,
	reporter: isCI ? 'github' : 'list',
	use: {
		baseURL: ORIGIN,
		trace: 'retain-on-failure',
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
	],
	// 動いているサーバーは使い回さない。別の時点のビルドを試さないよう、いまの dist を毎回配信する
	// - --ignore-lock: astro preview は、同じプロジェクトでサーバーが動いていると起動しない。AI のエージェントから
	//   実行されたと判断すると、バックグラウンドに回ってすぐ戻る。どちらも Playwright がサーバーの終了と見なすので、前面で別に起動する
	// - 127.0.0.1: localhost は IPv6 と IPv4 のどちらに解決されるかが環境で違うので固定する
	webServer: {
		command: `pnpm exec astro preview --host 127.0.0.1 --port ${PORT} --ignore-lock`,
		url: `${ORIGIN}/`,
		reuseExistingServer: false,
	},
})
