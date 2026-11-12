import mdx from '@astrojs/mdx'
import { defineConfig } from 'astro/config'
import slideNumbers from './scripts/vite-plugin-slide-numbers.ts'

// https://astro.build/config
export default defineConfig({
	// スライドの原稿（slides/<slug>/deck.mdx）を読む。
	// 既定の smartypants は -- を – に置き換え、原稿に書いた CSS のカスタムプロパティ（--true など）やコマンドの引数が変わるので、切る
	integrations: [mdx({ smartypants: false })],
	// Astro 7 の既定（'jsx'）は要素間の空白を消すため、HTML と同じ空白の扱いにする（taklog と同じ）
	compressHTML: true,
	build: {
		// 1 つのデッキを 1 つの HTML にするため、CSS を別のファイルにせず HTML に埋め込む。
		// 既定（'auto'）は 4KB を超える CSS を <link> で読み込み、HTML だけを持ち出すとスタイルが外れる。
		// Astro が埋め込むのは CSS だけで、スクリプトと欧文の書体（woff2）は _astro/ の別のファイルとして出力される。
		// この 2 つは、ビルドの後段の scripts/inline-decks.ts が埋め込み、dist/<slug>.html の 1 ファイルにする
		inlineStylesheets: 'always',
	},
	vite: {
		plugins: [slideNumbers()],
		build: {
			// CSS を圧縮する Lightning CSS の対象ブラウザを .browserslistrc にそろえる。既定（baseline-widely-available）のままだと、
			// light-dark() を --lightningcss-light / --lightningcss-dark を使う形に書き換える。この 2 つの変数は CSS に color-scheme を
			// 書いた場所にしか定義されず、このプロジェクトは <meta name="color-scheme"> で切り替えるので、明暗のトークンがすべて無効になる
			cssTarget: ['chrome140', 'edge140', 'firefox143', 'safari26', 'ios26'],
		},
	},
})
