/**
 * RECSSガイドライン（v0.83.2）の Stylelint 設定を、このプロジェクトに合わせたもの。
 * 出典: RECSSガイドラインのリポジトリの stylelint.config.mjs。独自ルールは ./stylelint/ に写している。
 * taklog（技術ブログ）のリポジトリが使っている設定を、そのまま写した。
 * 本書から変えたのは次の点だけ。ほかのルールはガイドラインを変えたら合わせて変える（lint-config-matches-guideline）。
 * - ignoreFiles をこのプロジェクトの出力先に合わせた
 * - layer-name-pattern から、ガイドラインのサイトだけが使う `starlight` を外した
 * - selector-pseudo-class-no-unknown の例外に、Astro の `:global` を足した
 * - .astro では custom-property-empty-line-before を外した（style 属性まで検査してしまうため。.css では検査する）
 *
 * @type {import('stylelint').Config}
 */
export default {
	ignoreFiles: ['dist/**', 'node_modules/**', '.astro/**'],
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
		'at-rule-property-required-list': {
			'font-face': ['font-family', 'src'],
		},
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
		'custom-property-pattern': null,
		'declaration-block-no-redundant-longhand-properties': [
			true,
			{
				ignoreShorthands: ['/^grid.+/', '/overflow/'],
			},
		],
		'declaration-property-unit-allowed-list': {
			'line-height': [],
		},
		'unit-disallowed-list': [
			['vw', 'vh', 'vi', 'vb', 'vmin', 'vmax'],
			{
				message: (unit) => {
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
		'declaration-property-value-disallowed-list': [
			{
				// 1 と -1 を含むすべての整数を禁止する（相対的な値も --z--forwards と --z--backwards で書く）
				'z-index': ['/^[+-]?\\d+$/'],
				// 改行したときに行が詰まりすぎるため（第14章 14-3）
				'line-height': ['/^1$/'],
			},
			{
				message: (name, value) =>
					name === 'line-height'
						? '`line-height: 1`は使用しないでください。ハーフレディングを取り除くなら`text-box-trim`を使用してください。'
						: `数値\`${value}\`は\`${name}\`プロパティで使用しないでください。z-index のトークンを使用してください。1 と -1 も\`--z--forwards\`と\`--z--backwards\`で指定します。`,
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
		'function-url-no-scheme-relative': true,
		// セレクタのネストは 2 層までだが、@ルールを数えない設定が Stylelint にないので、検査しない（第9章 9-4）。
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
		'selector-class-pattern': null,
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
		'selector-nested-pattern': /^&/,
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
