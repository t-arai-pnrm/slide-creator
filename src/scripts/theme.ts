/**
 * 明暗の切り替え。DESIGN.md の「明暗の切り替え」のとおり、<meta name="color-scheme"> の content を書き換え、
 * 選んだ値を localStorage に残す。ページを開いたときに残した値を当てる処理は、描画の前に動かすため、
 * src/layouts/Deck.astro の <head> のインラインの script にある。キーと値は、そこへこのファイルから渡す。
 */

/** 同じオリジンのデッキで同じ値を使うよう、デッキごとに分けない */
export const COLOR_SCHEME_STORAGE_KEY = 'slide-creator:color-scheme'
export const COLOR_SCHEMES = ['light only', 'dark only'] as const

export type ColorScheme = (typeof COLOR_SCHEMES)[number]

const isColorScheme = (value: unknown): value is ColorScheme => COLOR_SCHEMES.some((scheme) => scheme === value)

const getMeta = () => document.querySelector('meta[name="color-scheme"]')

export const getColorScheme = (): ColorScheme => {
	const content = getMeta()?.getAttribute('content')
	return isColorScheme(content) ? content : 'light only'
}

/** content を書き換えるだけで、値は残さない。ほかのウィンドウで変えた値を写すときに使う */
export const applyColorScheme = (scheme: ColorScheme): void => {
	getMeta()?.setAttribute('content', scheme)
}

export const toggleColorScheme = (): ColorScheme => {
	const next: ColorScheme = getColorScheme() === 'dark only' ? 'light only' : 'dark only'
	applyColorScheme(next)
	// プライベートブラウズや、保存を禁じた設定では例外になる。そのときは残さず、切り替えだけを行う
	try {
		localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next)
	} catch {
		// 残せなくても、今のページの切り替えは済んでいる
	}
	return next
}

/** ほかのウィンドウ（発表者ビューと発表の画面）で値を変えたときに、このウィンドウにも写す */
export const onStoredColorSchemeChange = (callback: (scheme: ColorScheme) => void): void => {
	window.addEventListener('storage', (event) => {
		if (event.key !== COLOR_SCHEME_STORAGE_KEY || !isColorScheme(event.newValue)) return
		applyColorScheme(event.newValue)
		callback(event.newValue)
	})
}
