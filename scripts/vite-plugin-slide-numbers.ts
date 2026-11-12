/**
 * スライドの原稿（slides/<slug>/deck.mdx）の <Slide> に、ページ番号（page）と全体の枚数（total）を足す Vite のプラグイン。
 * 原稿に番号を手で書くと、スライドを足したり並べ替えたりするたびに全部を書き直すことになるので、ビルドのときに数える。
 *
 * remark のプラグインにしないのは、@astrojs/mdx の既定の処理系（satteri）が remark のプラグインを実行せず、
 * 実行する処理系（unified）に替えるには依存を足す必要があるため。代わりに、MDX が読む前の原稿の文字列を書き換える。
 * 原稿では <Slide を行の先頭に書く決まりにし、コードブロック（``` か ~~~ で囲んだ部分）の中は数えない。
 */
// vite は直接の依存ではなく型を読めないので、このプラグインが使う形だけを書く
type Plugin = {
	name: string
	enforce: 'pre'
	transform: (code: string, id: string) => { code: string; map: null } | null
}

const DECK = /\/slides\/[^/]+\/deck\.mdx$/
const FENCE = /^\s*(`{3,}|~{3,})/
const SLIDE = /^<Slide(?=[\s>/])/

export const addSlideNumbers = (source: string): string => {
	const lines = source.split('\n')
	let fence: string | null = null
	const slideLines: number[] = []
	lines.forEach((line, index) => {
		const marker = FENCE.exec(line)?.[1]
		if (marker && (fence === null || marker.startsWith(fence))) {
			fence = fence === null ? marker : null
			return
		}
		if (fence === null && SLIDE.test(line)) slideLines.push(index)
	})

	const total = slideLines.length
	slideLines.forEach((lineIndex, slideIndex) => {
		const line = lines[lineIndex] ?? ''
		// 手で書いた番号と数えた番号が食い違うと、どちらが正しいか分からなくなるので、手で書いた原稿は失敗にする
		if (/\s(?:page|total)=/.test(line))
			throw new Error(`${lineIndex + 1} 行目: <Slide> に page と total を書かない（ビルドで足す）`)
		lines[lineIndex] = line.replace(SLIDE, `<Slide page={${slideIndex + 1}} total={${total}}`)
	})
	return lines.join('\n')
}

export default function slideNumbers(): Plugin {
	return {
		name: 'slide-numbers',
		// MDX の Vite のプラグインが原稿を読む前に書き換える
		enforce: 'pre',
		transform(code, id) {
			if (!DECK.test(id.split('?')[0] ?? id)) return null
			return { code: addSlideNumbers(code), map: null }
		},
	}
}
