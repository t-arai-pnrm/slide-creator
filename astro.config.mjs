import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
	// Astro 7 の既定（'jsx'）は要素間の空白を消すため、HTML と同じ空白の扱いにする（taklog と同じ）
	compressHTML: true,
	build: {
		// 1 つのデッキを 1 つの HTML にするため、CSS を別のファイルにせず HTML に埋め込む。
		// 既定（'auto'）は 4KB を超える CSS を <link> で読み込み、HTML だけを持ち出すとスタイルが外れる。
		// 埋め込むのは CSS だけで、スクリプトと欧文の書体（woff2）は、まだ _astro/ の別のファイルとして出力され、
		// HTML だけを持ち出すと、発表の表示が動かず、欧文は代わりの書体で出る。この 2 つは、ビルドの後段で
		// デッキを 1 つの HTML にまとめる処理（別の作業で作る）で埋め込む予定で、Astro の設定では埋め込まない
		inlineStylesheets: 'always',
	},
	vite: {
		build: {
			// CSS を圧縮する Lightning CSS の対象ブラウザを .browserslistrc にそろえる。既定（baseline-widely-available）のままだと、
			// light-dark() を --lightningcss-light / --lightningcss-dark を使う形に書き換える。この 2 つの変数は CSS に color-scheme を
			// 書いた場所にしか定義されず、このプロジェクトは <meta name="color-scheme"> で切り替えるので、明暗のトークンがすべて無効になる
			cssTarget: ['chrome140', 'edge140', 'firefox143', 'safari26', 'ios26'],
		},
	},
})
