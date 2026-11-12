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
const SLIDE = /^<Slide(?=[\s>/]|$)/
// 字下げした <Slide は数えないので、番号のないスライドができる。数え漏れに気付けるよう失敗にする
const INDENTED_SLIDE = /^\s+<Slide(?=[\s>/]|$)/

// <Slide> の行の位置（0 から数える）を返す。e2e のテストも、ここで数えた枚数を期待する値に使う
const findSlideLines = (lines: readonly string[]): number[] => {
	let fence: string | null = null
	const slideLines: number[] = []
	lines.forEach((line, index) => {
		const marker = FENCE.exec(line)?.[1]
		if (marker && (fence === null || marker.startsWith(fence))) {
			fence = fence === null ? marker : null
			return
		}
		if (fence !== null) return
		if (INDENTED_SLIDE.test(line)) throw new Error(`${index + 1} 行目: <Slide は字下げせず、行の先頭に書く`)
		if (SLIDE.test(line)) slideLines.push(index)
	})
	return slideLines
}

// <Slide の開始タグ（属性を次の行に折り返した場合も含む）のうち、属性の名前の部分だけを返す。
// 引用符の中と {} の中は値なので外す。値に page= などを書いた原稿を誤って失敗にしないため
const openingTagNames = (lines: readonly string[], lineIndex: number): string => {
	const rest = lines.slice(lineIndex).join('\n')
	let names = ''
	let quote: string | null = null
	let depth = 0
	for (const char of rest) {
		if (quote !== null) {
			if (char === quote) quote = null
		} else if (char === '"' || char === "'" || (depth > 0 && char === '`')) {
			quote = char
		} else if (char === '{') {
			depth += 1
		} else if (char === '}') {
			depth = Math.max(0, depth - 1)
		} else if (depth === 0) {
			if (char === '>') return names
			names += char
		}
	}
	throw new Error(`${lineIndex + 1} 行目: <Slide の開始タグが > で閉じていない`)
}

export const countSlides = (source: string): number => findSlideLines(source.split('\n')).length

export const addSlideNumbers = (source: string): string => {
	const lines = source.split('\n')
	const slideLines = findSlideLines(lines)
	const total = slideLines.length
	slideLines.forEach((lineIndex, slideIndex) => {
		const line = lines[lineIndex] ?? ''
		// 手で書いた番号と数えた番号が食い違うと、どちらが正しいか分からなくなるので、手で書いた原稿は失敗にする
		if (/\s(?:page|total)(?=[\s=/]|$)/.test(openingTagNames(lines, lineIndex)))
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
