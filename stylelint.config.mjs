/**
 * RECSSガイドライン（v0.84.0）の Stylelint 設定を、このプロジェクトに合わせたもの。
 * 出典: RECSSガイドラインのリポジトリの stylelint.config.mjs。独自ルールは ./stylelint/ に写している。
 * 本書から変えたのは次の点だけ。ほかのルールはガイドラインを変えたら合わせて変える（lint-config-matches-guideline）。
 * - ignoreFiles をこのプロジェクトの出力先に合わせた
 * - layer-name-pattern から、ガイドラインのサイトだけが使う `starlight` を外した
 * - custom-property-pattern から、ガイドラインのサイトだけが参照する Starlight の `--sl-*` を外した
 * - selector-pseudo-class-no-unknown の例外に、Astro の `:global` を足した
 * - .astro では custom-property-empty-line-before を外した（style 属性まで検査してしまうため。.css では検査する）
 *
 * 次の段落からは、本書の設定の説明を写したもの。
 *
 * 本書の Stylelint 設定。astro-template の設定をもとに、次の点を変えている。
 * - ネストの規約（ネストしたセレクタは `&` で始め、`&__title` のように文字をつなげない）を追加
 * - ベンダープレフィックスの例外をなくした（例外の指定が効いていなかったため）
 * - `@media` と `@container` をセレクタの中に書くことを求める独自ルールを追加
 * - z-index の数値の禁止パターンを、1 と -1 も含むすべての整数に広げた（10〜19 などを通していた問題も解消）
 * - レイヤー名を、宣言した名前だけに限定（第4章 4-3）
 * - 起点のない `:has()` を禁止する独自ルールを追加（第5章 5-3）
 * - 見た目の順番を変えうる配置に `reading-flow` を求める独自ルールを追加（第11章 11-8）
 * - `order` と `reading-order` の値を 1 と -1 に限定（第11章 11-8）
 * - 本書のルールのうち、値、プロパティ、セレクタの形だけで判定できるものを、禁止リストに加えた（下の4つの表）
 * - カスタムプロパティとクラスの名前のパターン、無効化のコメントの検査を追加
 *
 * 禁止リストの重大度は、書き換える先が1つに決まるものを `error`、人が選ぶものを `warning` にしている（第19章 19-1）。
 * 表の各行の `rules` は、対応する本書のルールの ID で、メッセージの末尾に出る。
 */

/** 文字列なら完全一致、正規表現なら `test()` で比べる */
const matches = (pattern, input) => (pattern instanceof RegExp ? pattern.test(input) : pattern === input)

/** Stylelint の禁止リストのキーにする（正規表現は `/…/` の文字列で渡す） */
const toKey = (pattern) => (pattern instanceof RegExp ? String(pattern) : pattern)

/** メッセージの末尾に、対応する本書のルールの ID を付ける。ルールの本文は付録A「ルール一覧」で引ける */
const withRules = (text, rules) => `${text}（本書のルール: ${rules.map((id) => `\`${id}\``).join('、')}）`

/**
 * 値の禁止（`declaration-property-value-disallowed-list`）。
 * 1つの宣言が複数の行に当たるときは、上の行のメッセージと重大度を使う。
 */
const VALUE_CHECKS = [
	{
		// 1 と -1 を含むすべての整数を禁止する（相対的な値も --z--forwards と --z--backwards で書く）
		rules: ['z-index-tokens-only'],
		prop: 'z-index',
		value: /^[+-]?\d+$/,
		severity: 'warning',
		message: (name, value) =>
			`数値\`${value}\`は\`${name}\`プロパティで使用しないでください。z-index のトークンを使用してください。1 と -1 も\`--z--forwards\`と\`--z--backwards\`で指定します。`,
	},
	{
		// 改行したときに行が詰まりすぎるため（第14章 14-3）
		rules: ['no-line-height-one'],
		prop: 'line-height',
		value: /^1$/,
		severity: 'warning',
		message: () =>
			'`line-height: 1`は使用しないでください。ハーフレディングを取り除くなら`text-box-trim`を使用してください。',
	},
	{
		rules: ['no-all-unset'],
		prop: 'all',
		value: 'unset',
		severity: 'warning',
		message: () =>
			'`all: unset`は使用しないでください。`display`などの必要なデフォルトまで初期値に戻ります。レイヤーを使うなら`all: revert-layer`、使わないなら`all: revert`を指定してください。',
	},
	{
		rules: ['no-outline-none'],
		prop: /^outline(-style|-width)?$/,
		value: /^(none|0(px)?)$/,
		severity: 'warning',
		message: (name, value) =>
			`\`${name}: ${value}\`でフォーカスリングを消さないでください。見た目を変えるときは、消さずに\`outline\`を定義し直してください。`,
	},
	{
		rules: ['list-style-type-empty-string'],
		prop: /^list-style(-type)?$/,
		value: 'none',
		severity: 'error',
		message: (name) =>
			`\`${name}: none\`は使用しないでください。Safari の VoiceOver がリストとして読み上げないことがあります。マーカーは\`list-style-type: ""\`で消してください。`,
	},
	{
		// 文字列だけの content（`"→" / ""` と `""` は通す）
		rules: ['empty-alt-for-decorative-content'],
		prop: 'content',
		value: /^(["'])(?:(?!\1).)+\1$/,
		severity: 'warning',
		message: (name, value) =>
			`装飾の文字や記号は、\`content: ${value} / ""\`のように代替テキストを空にしてください。読み上げる必要のある文字なら、理由を添えてこのルールを無効にしてください。`,
	},
	{
		// max() や calc() に入っていない env(safe-area-inset-*)
		rules: ['safe-area-combine-with-max'],
		prop: /^(?!--)/,
		value: /(^|[^,+\-*/(]\s)env\(\s*safe-area-inset-/,
		severity: 'warning',
		message: () =>
			'セーフエリアの値は単独で使用しないでください。余白は`max(16px, env(safe-area-inset-left))`のように通常の余白と比べ、端から浮かせる位置は`calc(16px + env(safe-area-inset-bottom))`のように足してください。',
	},
	{
		rules: ['absolute-centering-with-margin-auto'],
		prop: 'translate',
		value: /^-50% -50%$/,
		severity: 'warning',
		message: () =>
			'絶対配置の要素を中央に置くなら、`translate: -50% -50%`ではなく`inset: 0`と`margin: auto`を使用してください。',
	},
	{
		// 関数が1つだけの transform。複数の関数を重ねたものは、適用の順番が要る例外があるので対象にしない
		rules: ['individual-transform-properties'],
		prop: 'transform',
		value: /^(translate|scale|rotate)(X|Y|Z|3d)?\((?:[^()]|\([^()]*\))*\)$/,
		severity: 'error',
		message: () =>
			'移動、回転、拡大・縮小は、`transform`の関数ではなく`translate`、`rotate`、`scale`の個別のプロパティで書いてください。',
	},
	{
		// 列だけを対象にする（行の最小の高さは、ベーススタイルでは 0 にならない）
		rules: ['fr-without-minmax-zero'],
		prop: /^grid-(template|auto)-columns$/,
		value: /minmax\(\s*0(px)?\s*,\s*1fr\s*\)/,
		severity: 'warning',
		message: () =>
			'`minmax(0, 1fr)`ではなく`1fr`と書いてください。ベーススタイルの`min-inline-size: 0`があるので、`1fr`の列は中身に押し広げられません。',
	},
	{
		// auto-fit と auto-fill の minmax() だけを対象にする
		rules: ['minmax-min-capped-at-100-percent'],
		prop: /^(grid|--)/,
		value: /repeat\(\s*auto-(fit|fill)\s*,\s*minmax\(\s*(calc\(\s*)?[\d.]/,
		severity: 'error',
		message: () =>
			'`minmax()`の最小値に固定の長さを書くときは、`minmax(min(100%, …), 1fr)`のように`min(100%, …)`で親の幅を上限にしてください。',
	},
	{
		// 入力欄の max(16px, 1rem) は通す（第17章 17-7）
		rules: ['font-size-in-rem', 'clamp-rem-bounds'],
		prop: 'font-size',
		value: /^(?!max\(16px,\s).*(?<![\w.-])\d*\.?\d+px\b/,
		severity: 'error',
		message: () =>
			'`font-size`に px は使用しないでください。`calc(24 / 16 * 1rem)`のように rem で指定してください。入力欄の`max(16px, 1rem)`だけは使用できます。',
	},
	{
		// rem も var() も含まず、ビューポート単位を含む値
		rules: ['no-viewport-only-font-size'],
		prop: 'font-size',
		value: /^(?!.*(?:\d|\s|\()r?em\b)(?!.*var\()(?=.*\d[sdl]?v(?:i|b|w|h|min|max)\b)/,
		severity: 'warning',
		message: () => '文字サイズをビューポート単位だけで決めないでください。`clamp()`で rem と組み合わせてください。',
	},
	{
		// `margin: auto` 単独は、絶対配置の中央寄せで使うので通す
		rules: ['margin-inline-auto-centering'],
		prop: 'margin',
		value: /^0(px)? auto( 0(px)?)?$/,
		severity: 'error',
		message: (name, value) =>
			`\`${name}: ${value}\`は上下のマージンまで上書きします。左右の中央寄せには\`margin-inline: auto\`を使用してください。`,
	},
	{
		rules: ['aspect-ratio-for-ratios'],
		prop: /^padding-(top|bottom|block-start|block-end)$/,
		value: /%/,
		severity: 'warning',
		message: () => '要素の縦横比を`padding`の割合で作らないでください。`aspect-ratio`を使用してください。',
	},
	{
		rules: ['position-area-logical-keywords'],
		prop: 'position-area',
		value: /(^|[\s-])(top|bottom|left|right|x-start|x-end|y-start|y-end)(\s|$)/,
		severity: 'warning',
		message: () => '`position-area`の値は、`block-end inline-end`のような論理キーワードで指定してください。',
	},
	{
		rules: ['typed-arithmetic-to-unitless'],
		prop: /^/,
		value: /tan\(\s*atan2\(/,
		severity: 'warning',
		message: () =>
			'`tan(atan2())`で単位を外さないでください。`calc(100svi / 1px)`のように、単位のついた値で割ってください。',
	},
	{
		// 色相を補間する in oklch は通す
		rules: ['color-mix-for-two-colors'],
		prop: /^/,
		value: /color-mix\((?!\s*in okl(ab|ch)\b)/,
		severity: 'warning',
		message: () =>
			'`color-mix()`には補間の色空間を指定してください。2つの色の間の色は`color-mix(in oklab, …)`で作ります。',
	},
	{
		rules: ['no-transition-all'],
		prop: 'transition-property',
		value: /(^|[\s,])all(?![\w-])/,
		severity: 'warning',
		message: () => '`transition-property: all`は使用しないでください。動かすプロパティだけを並べてください。',
	},
	{
		rules: ['no-container-type-size'],
		prop: 'container',
		value: /\/\s*size\b/,
		severity: 'warning',
		message: () =>
			'コンテナの種類に`size`は使用しないでください。コンテナの高さが確定していないと働きません。`inline-size`を指定してください。',
	},
	{
		// 間隔のカスタムプロパティの値
		rules: ['switcher-gap-default-with-unit', 'grid-gap-with-unit'],
		prop: /^--[\w-]*gap[\w-]*$/,
		value: '0',
		severity: 'warning',
		message: (name) =>
			`\`${name}\`には、\`0\`ではなく\`0px\`を指定してください。\`calc()\`で長さと足し合わせると、単位のない\`0\`は宣言を無効にします。`,
	},
	{
		// gap 以外のプロパティで使う間隔のデフォルト値
		rules: ['switcher-gap-default-with-unit', 'grid-gap-with-unit'],
		prop: /^(?!(row-|column-)?gap$)/,
		value: /var\(--[\w-]*gap[\w-]*,\s*0\s*\)/,
		severity: 'warning',
		message: () =>
			'間隔のデフォルト値には、`0`ではなく`0px`を指定してください。`calc()`で長さと足し合わせると、単位のない`0`は宣言を無効にします。',
	},
	{
		// リセットの目的のキーワードは通す
		rules: ['no-font-shorthand'],
		prop: 'font',
		value: /^(?!(inherit|unset|revert|revert-layer|initial)$)/,
		severity: 'error',
		message: () =>
			'`font`ショートハンドは、リセットの目的以外で使用しないでください。`line-height`や`font-kerning`まで初期値に戻ります。`font-size`などのロングハンドで指定してください。',
	},
	{
		rules: ['overflow-clip-over-hidden'],
		prop: /^overflow(-x|-y|-inline|-block)?$/,
		value: /(^|\s)hidden(\s|$)/,
		severity: 'warning',
		message: () =>
			'`hidden`は要素をスクロールコンテナにします。はみ出しを切り取るだけなら`clip`を使用してください。スクロールコンテナが要るときは、理由を添えてこのルールを無効にしてください。',
	},
	{
		rules: ['overflow-auto-over-scroll'],
		prop: /^overflow(-x|-y|-inline|-block)?$/,
		value: /(^|\s)scroll(\s|$)/,
		severity: 'warning',
		message: () =>
			'`scroll`はスクロールバーを常に表示します。はみ出したときだけスクロールさせるなら`auto`を使用してください。',
	},
	{
		rules: ['box-sizing-border-box-base'],
		prop: 'box-sizing',
		value: /^(border-box|content-box)$/,
		severity: 'warning',
		message: (name, value) =>
			value === 'border-box'
				? '`box-sizing: border-box`はベーススタイルの全称セレクタで指定するので、コンポーネントに書き足さないでください。'
				: '`content-box`に戻すときは、`box-sizing: unset`と書いてください。',
	},
	{
		rules: ['flow-tolerance-no-infinite'],
		prop: 'flow-tolerance',
		value: 'infinite',
		severity: 'warning',
		message: () =>
			'`flow-tolerance: infinite`は使用しないでください。並び順を優先するなら、`3em`のように初期値より大きい長さを指定してください。',
	},
	{
		rules: ['no-text-wrap-pretty-for-japanese'],
		prop: /^text-wrap(-style)?$/,
		value: 'pretty',
		severity: 'warning',
		message: () =>
			'和文には`text-wrap: pretty`を指定しないでください。Safari で`balance`に似た折り返しになります。英文の段落には kiso.css が指定しています。',
	},
	{
		rules: ['no-text-align-justify'],
		prop: 'text-align',
		value: 'justify',
		severity: 'warning',
		message: () =>
			'段落に`text-align: justify`を指定しないでください。英単語や URL が混ざると、行の中に大きなすき間ができます。',
	},
	{
		rules: ['overflow-wrap-over-word-break'],
		prop: 'word-break',
		value: /^(break-all|break-word)$/,
		severity: 'warning',
		message: () =>
			'`word-break`は初期値のままにし、長い単語や URL のはみ出しは`overflow-wrap: anywhere`で防いでください。',
	},
	{
		rules: ['no-system-ui-for-japanese'],
		prop: 'font-family',
		value: /(^|[\s,])system-ui(?![\w-])/,
		severity: 'warning',
		message: () =>
			'日本語のサイトでは`system-ui`を使用しないでください。Windows で游ゴシックの画面表示用の書体になります。`sans-serif`を指定してください。',
	},
	{
		rules: ['no-ease-in-for-ui'],
		prop: /^(transition|animation)-timing-function$/,
		value: /(^|[\s,])ease-in(?![\w-])/,
		severity: 'warning',
		message: () =>
			'UI の動きに`ease-in`は使用しないでください。現れる動きと消える動きには`out`系、移動には`in-out`系のイージングを使用してください。',
	},
	{
		// 色だけを書いた background
		rules: ['longhand-for-partial-change'],
		prop: 'background',
		value:
			/^(?!(none|inherit|initial|unset|revert|revert-layer)$)(#[0-9a-f]{3,8}|[a-z]+|var\(--[\w-]+\)|(oklch|oklab|rgb|rgba|hsl|hsla|color-mix|light-dark|color)\((?:[^()]|\([^()]*\))*\))$/i,
		severity: 'warning',
		message: () =>
			'色だけを変えるなら、`background`ではなく`background-color`で指定してください。ショートハンドは、ほかのサブプロパティも初期値に戻します。',
	},
]

/** プロパティの禁止（`property-disallowed-list`） */
const PROPERTY_CHECKS = [
	{
		rules: ['transition-longhand-with-tokens'],
		prop: 'transition',
		severity: 'error',
		message:
			'トランジションは、略記の`transition`ではなく、`transition-property`、`transition-duration`、`transition-timing-function`のロングハンドで書いてください。',
	},
	{
		rules: ['animation-longhand-fill-mode'],
		prop: 'animation',
		severity: 'error',
		message:
			'アニメーションは、略記の`animation`ではなく、`animation-name`などのロングハンドで書いてください。略記は`animation-timeline`と`animation-range`もリセットします。',
	},
	{
		rules: ['container-shorthand'],
		prop: 'container-type',
		severity: 'error',
		message:
			'`container-type`を単体で書かず、`container: --scoped / inline-size`のように、ショートハンドで名前と種類を指定してください。',
	},
	{
		rules: ['will-change-temporarily'],
		prop: 'will-change',
		severity: 'warning',
		message:
			'`will-change`を CSS に書いたままにしないでください。必要なときだけ、動きの直前に JavaScript で付けて、終わったら外してください。',
	},
	{
		rules: ['overscroll-contain-in-overlay'],
		prop: 'overscroll-behavior',
		severity: 'warning',
		message:
			'軸のない`overscroll-behavior`は、横のスワイプで前のページに戻る操作まで止めます。`overscroll-behavior-block: contain`のように、スクロールする方向の軸だけに指定してください。',
	},
]

/** セレクタの禁止（`selector-disallowed-list`）。セレクタリストは1つずつ調べる。すべて `warning` */
const SELECTOR_CHECKS = [
	{
		rules: ['not-has-for-absence'],
		selector: /:has\(\s*:not\(/,
		message:
			'`:has(:not(X))`は「X 以外の子孫を持つ要素」を選びます。「X を持たない要素」は`:not(:has(X))`と書いてください。',
	},
	{
		rules: ['nth-child-of-over-nth-of-type'],
		selector: /[.\]][\w-]*["']?\]?:nth-(last-)?of-type\(/,
		message:
			'`:nth-of-type()`はタグ名ごとにしか数えません。クラスや状態で絞った中での順番は、`:nth-child(2 of ._post)`のように書いてください。',
	},
	{
		rules: ['is-for-state-selectors'],
		selector: /:where\((?:[^()]|\([^()]*\))*(:hover|:focus|:active|:checked|:disabled|\[aria-|\[open\])/,
		message:
			'状態のセレクタは`:where()`で包まず、まとめるときは`:is()`を使用してください。詳細度が 0 になると、既定のスタイルに負けることがあります。',
	},
	{
		// WordPress の .is-style-* や .has-text-align-* は通す
		rules: ['state-by-pseudo-class-or-aria'],
		selector:
			/\.(is|has)-(active|open|opened|closed|current|selected|disabled|hidden|visible|expanded|collapsed|checked|loading|error|invalid|show|shown|fixed|scrolled|focused|pressed)(?![\w-])|(?<![\w-])\.(active|current|selected|disabled)(?![\w-])/,
		message:
			'状態をクラスで表さないでください。擬似クラス（`:disabled`など）、HTML の属性、ARIA 属性（`aria-expanded`など）、`data-*`属性の順に、当てはまるものでセレクタを書いてください。',
	},
	{
		rules: ['inner-outer-names'],
		selector: /\._(inner|outer|container)(?![\w-])/,
		message: '`inner`、`outer`、`container`には、`._section-inner`や`._card-outer`のように「何の」を併記してください。',
	},
	{
		rules: ['no-container-utility-class'],
		selector: /\.container(?![\w-])/,
		message:
			'`.container`のような汎用のクラスは作らないでください。`container`プロパティを持つ要素にだけ、`.sidebar-container`のように何のコンテナかが分かる名前を付けてください。',
	},
	{
		// block は、ブロックボックスを説明するデモが ._block を使うので対象にしない
		rules: ['no-vague-names'],
		selector: /\.[_-]?(wrapper|module|widget)(?![\w-])|\._[\w-]*-wrapper(?![\w-])/,
		message:
			'`wrapper`、`module`、`widget`のような総称は名前に使用しないでください。`._section-inner`のように、責務を表す名前を付けてください。',
	},
	{
		rules: ['no-device-names'],
		selector: /\.[\w-]*(?<![a-z0-9])(sp|pc|tablet|smartphone|mobile|desktop)(?![a-z0-9])/,
		message:
			'`sp`、`tablet`、`pc`のようにデバイスを連想させる名前は使用しないでください。画面の幅とデバイスの種類は一致しません。',
	},
	{
		rules: ['no-numbers-in-class-names'],
		selector: /\.[\w-]*-\d+(?![\w-])/,
		message:
			'クラス名に番号を使用しないでください。役割の名前、`data-variant`のような属性、`:nth-child()`で区別してください。',
	},
]

/**
 * セレクタとプロパティの組（`rule-selector-property-disallowed-list`）。すべて `warning`。
 * Stylelint は最初に一致したセレクタの行だけを使うので、1つのルールが複数の行に当たらないようにする。
 */
const SELECTOR_PROPERTY_CHECKS = [
	{
		selector: /::marker/,
		props: [
			{
				rules: ['marker-color-and-font-size-only'],
				prop: /^(?!color$|font-size$)/,
				message:
					'`::marker`に指定するのは`color`と`font-size`だけにしてください。Safari はほかのプロパティを反映しません。記号や太さを変えるなら、`list-style-type: ""`でマーカーを空にして`::before`で描いてください。',
			},
		],
	},
	{
		selector: /::placeholder/,
		props: [
			{
				rules: ['placeholder-color-contrast'],
				prop: 'opacity',
				message:
					'`::placeholder`を`opacity`で薄くしないでください。`color`で、背景とのコントラスト比が 4.5:1 以上になる色を指定してください。',
			},
		],
	},
	{
		selector: /^(html|:root)$/,
		props: [
			{
				rules: ['no-container-on-page-root'],
				prop: /^container/,
				message:
					'`html`と`body`をコンテナにしないでください。ページ全体の切り替えにはメディアクエリを使用してください。',
			},
			{
				rules: ['root-scroller-no-fixed-root-height'],
				prop: /^(block-size|height)$/,
				message:
					'`html`と`body`の高さを固定しないでください。画面の高さが必要なら、ページのレイアウトの要素に`min-block-size: 100svb`を指定してください。',
			},
			{
				rules: ['no-root-font-size-change'],
				prop: 'font-size',
				message:
					'ルートの文字サイズを変えないでください。16px を前提に rem で書かれた CSS が崩れます。px からの変換は`calc(24 / 16 * 1rem)`の式で書いてください。',
			},
			{
				rules: ['no-global-smooth-scroll'],
				prop: 'scroll-behavior',
				message:
					'ルート要素に`scroll-behavior: smooth`を無条件に指定しないでください。キーボードのフォーカス移動までなめらかになります。ページ内リンクで移動したときだけに絞ってください（第8章 8-2）。',
			},
		],
	},
	{
		selector: /^body$/,
		props: [
			{
				rules: ['no-container-on-page-root'],
				prop: /^container/,
				message:
					'`html`と`body`をコンテナにしないでください。ページ全体の切り替えにはメディアクエリを使用してください。',
			},
			{
				rules: ['root-scroller-no-fixed-root-height'],
				prop: /^(block-size|height)$/,
				message:
					'`html`と`body`の高さを固定しないでください。画面の高さが必要なら、ページのレイアウトの要素に`min-block-size: 100svb`を指定してください。',
			},
			{
				rules: ['no-global-smooth-scroll'],
				prop: 'scroll-behavior',
				message:
					'ルート要素に`scroll-behavior: smooth`を無条件に指定しないでください。キーボードのフォーカス移動までなめらかになります。ページ内リンクで移動したときだけに絞ってください（第8章 8-2）。',
			},
		],
	},
	{
		selector: /^\*$/,
		props: [
			{
				rules: ['reset-no-destructive-reset'],
				prop: /^(margin|padding)/,
				message:
					'全称セレクタで`margin`と`padding`を一律に消さないでください。ボタンの余白のように、毎回指定し直すものが増えます。',
			},
		],
	},
	{
		selector: /(^|[\s>+~,(])input(?![\w-])/,
		props: [
			{
				rules: ['no-aspect-ratio-on-input'],
				prop: 'aspect-ratio',
				message:
					'`input`の大きさを`aspect-ratio`で決めないでください。Safari で比率が保たれないことがあります。`inline-size`と`block-size`の両方を指定してください。',
			},
		],
	},
	{
		selector: /\[hidden=["']?until-found/,
		props: [
			{
				rules: ['no-box-style-on-until-found'],
				prop: /^(padding|margin|border|background)/,
				message:
					'`hidden="until-found"`の要素自体に、余白、枠線、背景を指定しないでください。閉じていても表示されます。内側の要素に指定してください。',
			},
		],
	},
	{
		selector: /:hover(:[\w-]+(\([^)]*\))?)*$/,
		props: [
			{
				rules: ['no-opacity-for-hover'],
				prop: 'opacity',
				message:
					'ホバーの変化を`opacity`で表さないでください。文字まで透けてコントラストが下がります。背景色や文字色を、トークンや相対カラー構文で作った別の色に変えてください。',
			},
			{
				rules: ['hover-target-stays-still'],
				prop: /^(translate|scale|rotate|transform)$/,
				message:
					'ホバーを受ける要素自身を動かさないでください。カーソルが外れてちらつきます。`--_hocus`を立て、子要素か擬似要素を`@container style(--_hocus: --true)`の中で動かしてください。',
			},
		],
	},
	{
		selector: /:active(:[\w-]+(\([^)]*\))?)*$/,
		props: [
			{
				rules: ['no-opacity-for-hover'],
				prop: 'opacity',
				message:
					'押下の変化を`opacity`で表さないでください。文字まで透けてコントラストが下がります。背景色や文字色を、トークンや相対カラー構文で作った別の色に変えてください。',
			},
		],
	},
]

const findValueCheck = (prop, value) =>
	VALUE_CHECKS.find((check) => matches(check.prop, prop) && matches(check.value, value))
const findPropertyCheck = (prop) => PROPERTY_CHECKS.find((check) => check.prop === prop)
const findSelectorCheck = (selector) => SELECTOR_CHECKS.find((check) => check.selector.test(selector))
const findSelectorPropertyCheck = (selector, prop) =>
	SELECTOR_PROPERTY_CHECKS.find((check) => check.selector.test(selector))?.props.find((item) =>
		matches(item.prop, prop),
	)

/** @type {import('stylelint').Config} */
export default {
	ignoreFiles: ['dist/**', 'node_modules/**', '.astro/**'],
	// 無効化のコメントは、ルール名を付け、報告される宣言にだけ書く（第9章 9-10）
	reportNeedlessDisables: true,
	reportUnscopedDisables: true,
	reportInvalidScopeDisables: true,
	overrides: [
		{
			files: ['**/*.astro'],
			customSyntax: 'postcss-html',
			rules: {
				// postcss-html は HTML の style 属性も CSS として読むので、コンポジションに値を渡す
				// style="--stack--gap: …" に空行を求めてしまう（--fix で属性の中に改行が入る）。.astro では外す
				'custom-property-empty-line-before': null,
			},
		},
	],
	extends: ['stylelint-config-standard', 'taks-stylelint-order'],
	plugins: [
		'stylelint-plugin-logical-css',
		'stylelint-order',
		'stylelint-plugin-display-multi-keyword-syntax',
		'./stylelint/conditions-inside-rules.mjs',
		'./stylelint/no-unanchored-has.mjs',
		'./stylelint/reading-flow-when-reordered.mjs',
	],
	rules: {
		'at-rule-empty-line-before': [
			'always',
			{
				except: ['blockless-after-same-name-blockless', 'first-nested'],
				ignore: ['after-comment'],
				ignoreAtRules: ['import'],
			},
		],
		'at-rule-property-required-list': [
			{
				'font-face': ['font-family', 'src'],
				// `syntax` が `"*"` のときも `initial-value` を書く（第10章 10-5）
				property: ['syntax', 'inherits', 'initial-value'],
			},
			{
				message: (atRule, property) =>
					atRule === '@property'
						? `\`@property\`には\`syntax\`、\`inherits\`、\`initial-value\`の3つの記述子を書いてください。\`${property}\`がありません。`
						: `\`${atRule}\`には\`${property}\`を書いてください。`,
			},
		],
		'book/conditions-inside-rules': true,
		'book/no-unanchored-has': true,
		'book/reading-flow-when-reordered': true,
		'container-name-pattern': [
			'^--[a-z][a-z0-9]*(-[a-z0-9]+)*$',
			{
				message: (name) => `コンテナ名「${name}」は、\`--\`で始まる kebab-case の名前にしてください。`,
			},
		],
		'custom-property-empty-line-before': [
			'always',
			{
				except: ['after-custom-property', 'first-nested'],
				ignore: ['after-comment'],
			},
		],
		'block-no-empty': null,
		'no-empty-source': null,
		'color-hex-alpha': 'never',
		'color-named': 'never',
		// TODO・FIXME・HACK はコメントの先頭に大文字で書き、コロンを続ける（第9章 9-10）
		// 無効化は `stylelint-disable-next-line` で1行に絞る（範囲と `-line` は使わない）
		'comment-word-disallowed-list': [
			[
				/^(?!\s*(TODO|FIXME|HACK): )[\s\S]*\b(TODO|FIXME|HACK)\b/,
				/^\s*(?!(?:TODO|FIXME|HACK): )(?:[Tt][Oo][Dd][Oo]|[Ff][Ii][Xx][Mm][Ee]|[Hh][Aa][Cc][Kk])\b/,
				/^\s*stylelint-(disable|enable)(?!-next-line)/,
			],
			{
				message: (pattern) =>
					String(pattern).includes('stylelint')
						? '無効化は`stylelint-disable-next-line`とルール名で1行・1つのルールに絞り、直前のコメントに理由を書いてください。'
						: 'TODO、FIXME、HACK は、`/* TODO: … */`のように、コメントの先頭に大文字で書き、コロンを続けてください。',
			},
		],
		// 内部用は `--_名前`、トークンと公開プロパティは `--分類--名前`。状態は `--` で続ける（第10章 10-4、10-5）。
		'custom-property-pattern': [
			'^(_[a-z0-9]+(-[a-z0-9]+)*|[a-z][a-z0-9]*(-[a-z0-9]+)*--[a-z0-9]+(-[a-z0-9]+)*)(--[a-z0-9]+(-[a-z0-9]+)*)*$',
			{
				message: (name) =>
					`カスタムプロパティ「${name}」は、内部用なら\`--_名前\`、トークンと公開プロパティなら\`--分類--名前\`（\`--spacing--md\`、\`--card--radius\`）の形にしてください。`,
			},
		],
		'declaration-block-no-redundant-longhand-properties': [
			true,
			{
				// `transition` と `animation` は、ロングハンドで書く規約なので、略記を求めない（第18章）
				ignoreShorthands: ['/^grid.+/', '/overflow/', 'transition', 'animation'],
			},
		],
		'declaration-property-unit-allowed-list': {
			'line-height': [],
		},
		'unit-disallowed-list': [
			['vw', 'vh', 'vi', 'vb', 'vmin', 'vmax', 'dvb', 'dvh', 'cqb', 'cqh', 'cqmin', 'cqmax'],
			{
				message: (unit) => {
					// 要素の大きさを `dvb` で決めると、ブラウザの UI が出入りするたびにレイアウトシフトが起きる（第6章 6-2）
					if (unit === 'dvb' || unit === 'dvh') {
						return `\`${unit}\`は要素の大きさに使用しないでください。ブラウザの UI が出入りするたびに値が変わります。代わりに\`svb\`か\`lvb\`を検討してください。`
					}
					// `container-type: size` を前提にした単位（第13章 13-4）
					if (unit.startsWith('cq')) {
						return `\`${unit}\`は使用しないでください。コンテナの高さが確定していないと働きません。代わりに\`cqi\`を検討してください。`
					}
					// 物理方向の svw・svh を勧めると論理単位の警告に掛かるので、論理方向の単位を勧める
					const recommendationMap = {
						vw: 'svi, dvi, lvi',
						vh: 'svb, dvb, lvb',
						vi: 'svi, dvi, lvi',
						vb: 'svb, dvb, lvb',
						vmin: 'svmin, dvmin, lvmin',
						vmax: 'svmax, dvmax, lvmax',
					}
					return `\`${unit}\`は使用しないでください。代わりに\`${recommendationMap[unit]}\`を検討してください。`
				},
				severity: 'warning',
			},
		],
		'declaration-property-value-allowed-list': [
			{
				// z-index の相対的な値と同じく、1 と -1 だけを使う（第11章 11-8）
				order: ['/^-?1$/', '/^(initial|inherit|unset|revert|revert-layer)$/'],
				'reading-order': ['/^-?1$/', '/^(initial|inherit|unset|revert|revert-layer)$/'],
			},
			{
				message: (name, value) =>
					`\`${name}: ${value}\`は使用しないでください。\`${name}\`の値は 1 か -1 だけを使用します。`,
			},
		],
		// 行ごとの値、重大度、メッセージは、上の VALUE_CHECKS にある
		'declaration-property-value-disallowed-list': [
			VALUE_CHECKS.reduce((list, check) => {
				;(list[toKey(check.prop)] ??= []).push(check.value)
				return list
			}, {}),
			{
				message: (name, value) => {
					const check = findValueCheck(name, value)
					return check
						? withRules(check.message(name, value), check.rules)
						: `\`${name}: ${value}\`は使用しないでください。`
				},
				severity: (name, value) => findValueCheck(name, value)?.severity ?? 'warning',
			},
		],
		// 詳細度や読み込み順の競争には使わない。`[hidden]` を確実に隠す場合などは、理由を添えて無効にする（第4章 4-1）
		'declaration-no-important': [
			true,
			{
				message:
					'`!important`は、詳細度や読み込み順の競争に勝つ目的で使用しないでください。`[hidden]`を確実に隠す場合のように、ほかの手段で実現できないときは、理由を添えてこのルールを無効にしてください。',
				severity: 'warning',
			},
		],
		'declaration-property-value-no-unknown': [
			true,
			{
				ignoreProperties: {
					'word-break': 'auto-phrase',
					display: '/grid-lanes$/',
					'inline-size': ['/^round\\(/', '/^calc-size\\(/', '-webkit-fill-available', '/^anchor-size\\(/'],
					'/^(min-|max-)?(inline|block)-size$/': '/^anchor-size\\(/',
				},
			},
		],
		'function-no-unknown': [
			true,
			{
				ignoreFunctions: ['anchor', 'anchor-size', 'alpha'],
			},
		],
		'font-weight-notation': [
			'numeric',
			{
				// `bolder` と `lighter` は、kiso.css がブラウザのデフォルトに合わせて使う
				ignore: ['relative'],
				message: '`font-weight`は、`bold`のようなキーワードではなく数値（トークン）で指定してください。',
			},
		],
		'function-url-no-scheme-relative': true,
		// セレクタのネストは 2 層までだが、深さは検査しない。`max-nesting-depth` は @ルールも層に数え、
		// `ignoreAtRules` に `@scope` や `@layer` を指定すると、その中を検査しなくなる（第9章 9-5）。
		'media-feature-name-disallowed-list': [
			['/^(min-|max-)?device-(width|height|aspect-ratio)$/', 'hover'],
			{
				message: (name) =>
					name === 'hover'
						? 'ホバーできるかは`(hover)`ではなく`(any-hover)`で判定してください。マウスをつないだタブレットでもホバーを有効にできます。'
						: `\`${name}\`は端末の画面の大きさを調べ、実際の表示領域を反映しません。幅は\`width\`で判定してください。`,
			},
		],
		'media-feature-name-value-allowed-list': [
			{
				// 値なしの `(any-hover)` と書く（第17章 17-1）
				'any-hover': ['none'],
				// ブレイクポイントは `calc(640 / 16 * 1rem)` の式で書く。px の隙間を足す式（`… + 32px`）は通す（第13章 13-2）
				'/^(min-|max-)?(width|height)$/': ['/^calc\\(.*rem.*\\)$/', '0'],
			},
			{
				message: (name, value) =>
					name === 'any-hover'
						? '`(any-hover: hover)`と値まで書かず、`(any-hover)`と書いてください。'
						: `ブレイクポイント\`${value}\`は、\`calc(640 / 16 * 1rem)\`のように、ピクセル値から rem への変換の式で書いてください。`,
			},
		],
		'media-feature-name-value-no-unknown': true,
		'no-descending-specificity': null,
		'order/order': [
			[
				'custom-properties',
				'declarations',
				{
					type: 'at-rule',
					name: 'supports',
					hasBlock: true,
				},
				{
					type: 'at-rule',
					name: 'container',
					hasBlock: true,
				},
				{
					type: 'at-rule',
					name: 'media',
					hasBlock: true,
				},
				'rules',
			],
			{ unspecified: 'bottom' },
		],
		'plugin/display-multi-keyword-syntax': true,
		'logical-css/require-logical-properties': [
			true,
			{
				ignore: ['overflow-x', 'overflow-y'],
				severity: 'warning',
			},
		],
		'logical-css/require-logical-units': [
			true,
			{
				severity: 'warning',
			},
		],
		'property-disallowed-list': [
			PROPERTY_CHECKS.map((check) => check.prop),
			{
				message: (name) => {
					const check = findPropertyCheck(name)
					return check ? withRules(check.message, check.rules) : `\`${name}\`は使用しないでください。`
				},
				severity: (name) => findPropertyCheck(name)?.severity ?? 'warning',
			},
		],
		'property-no-unknown': [
			true,
			{
				ignoreProperties: [
					'field-sizing',
					'reading-flow',
					'reading-order',
					'navigation',
					'interpolate-size',
					'text-box',
					'interactivity',
					'corner-shape',
					'border-shape',
					'flow-tolerance',
					'text-decoration-inset',
				],
			},
		],
		// 例外は設けない。必要なプレフィックスは、理由のコメントと無効化のコメントを添えて書く（第9章 9-7）。
		'property-no-vendor-prefix': true,
		'keyframes-name-pattern': /^--[\w][\w-]*$/,
		// 打ち間違えたレイヤー名は、エラーにならず新しいレイヤーになる（第4章 4-3）。
		'layer-name-pattern': [
			'^(tokens|reset|base|vendors|compositions|pages|components|patterns|utilities)$',
			{
				message: (name) =>
					`レイヤー名「${name}」は宣言されていません。先頭の\`@layer\`文で宣言した名前を使用してください。`,
			},
		],
		'rule-selector-property-disallowed-list': [
			Object.fromEntries(
				SELECTOR_PROPERTY_CHECKS.map((check) => [toKey(check.selector), check.props.map((item) => toKey(item.prop))]),
			),
			{
				message: (selector, name) => {
					const check = findSelectorPropertyCheck(selector, name)
					return check ? withRules(check.message, check.rules) : `\`${selector}\`に\`${name}\`は指定しないでください。`
				},
				severity: 'warning',
			},
		],
		// クラスの種類（子要素は `_`、ユーティリティは `-` で始める）は文脈で決まるので、ここでは検査しない。
		// 大文字を含む名前だけを報告する。既存のサイトや CMS のクラスを書けるように、BEM の `__` は通す（第19章）。
		'selector-class-pattern': [
			'^[_-]?[a-z][a-z0-9]*([-_]{1,2}[a-z0-9]+)*$',
			{
				message: (selector) =>
					`クラス名「${selector}」は、小文字の kebab-case にしてください（子要素は\`._main-link\`、ユーティリティは\`.-visually-hidden\`）。`,
			},
		],
		'selector-disallowed-list': [
			SELECTOR_CHECKS.map((check) => check.selector),
			{
				splitList: true,
				message: (selector) => {
					const check = findSelectorCheck(selector)
					return check ? withRules(check.message, check.rules) : `セレクタ\`${selector}\`は使用しないでください。`
				},
				severity: 'warning',
			},
		],
		'selector-pseudo-class-no-unknown': [
			true,
			{
				// `:global()` は Astro のスコープ付き <style> で、スロットやスクリプトが作る要素を選ぶための構文
				ignorePseudoClasses: ['target-current', 'global'],
			},
		],
		'selector-max-id': 0,
		'selector-max-universal': [
			1,
			{
				ignoreAfterCombinators: ['+'],
			},
		],
		// `&` で始め、`&__title` のように文字をつなげない（第9章 9-5）
		'selector-nested-pattern': [
			/^&(?![\w-])/,
			{
				message: (selector) =>
					selector.startsWith('&')
						? `\`${selector}\`のように、\`&\`に文字をつなげてクラス名を作らないでください。素の CSS では無効なセレクタになります。`
						: `ネストしたセレクタ\`${selector}\`は、\`&\`で始めてください。`,
			},
		],
		'selector-pseudo-class-disallowed-list': [
			['invalid', 'open', 'read-only'],
			{
				message: (pseudo) =>
					({
						':invalid':
							'入力エラーの見た目は、`:invalid`ではなく`:user-invalid`に指定してください。`:invalid`は入力する前から当てはまります。',
						':open':
							'`<details>`と`<dialog>`の開いた状態は、`:open`ではなく`[open]`で選んでください。`:open`に未対応のブラウザでは、ルールがセレクタリストごと無効になります。',
						':read-only':
							'読み取り専用の入力欄は、`:read-only`ではなく`&[readonly]`で選んでください。`:read-only`は、チェックボックスや無効の入力欄にも当てはまります。',
					})[pseudo] ?? `\`${pseudo}\`は使用しないでください。`,
				severity: 'warning',
			},
		],
		'selector-pseudo-element-disallowed-list': [
			['/^-webkit-scrollbar/'],
			{
				message:
					'スクロールバーの色や太さは変えないでください。どうしても変える場合は、`@media (forced-colors: none)`の中で、標準の`scrollbar-color`と`scrollbar-width`を使用してください。',
				severity: 'warning',
			},
		],
		'selector-pseudo-element-colon-notation': 'double',
		'selector-pseudo-element-no-unknown': [
			true,
			{
				ignorePseudoElements: ['scroll-button'],
			},
		],
		'value-keyword-case': [
			'lower',
			{
				camelCaseSvgKeywords: true,
			},
		],
	},
}
