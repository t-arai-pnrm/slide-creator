---
paths:
  - "src/**/*.css"
  - "src/**/*.astro"
  - "stylelint.config.mjs"
  - "stylelint/**"
---

# CSS

CSS のガイドライン（RECSSガイドライン）に従う。ルールは MCP サーバー recss-guideline で引ける。CSS は css-change のスキルの手順で書き、変えたら `pnpm lint` で Stylelint を通す。この文書の「本書」は、そのガイドラインを指す。

この規約は taklog（技術ブログのリポジトリ）の `.claude/rules/css.md` を写し、スライドに合わない点を変えたもの。

## 値の出どころ

色、文字の大きさ、余白、角丸、動きの値は `DESIGN.md` で決め、CSS のトークンはそれを写す。`DESIGN.md` にない値を CSS に書かない。値が要るときは、先に `DESIGN.md` を変える。

## 配るものに書かないもの

CSS はスライドの HTML に埋め込まれて配られる。CSS のコメントに、ガイドラインの名前とリンクを書かない。根拠を残したいときは、ルールID だけを書く。

## 構成

- 対象のブラウザ: `.browserslistrc`（Safari / iOS は 26 以降）。それより新しい機能は、フォールバックを書けるなら書く
- レイヤー（順に）: `tokens`, `reset`, `base`, `vendors`, `compositions`, `pages`, `components`, `patterns`, `utilities`。入り口は `src/styles/index.css`。順番の宣言は、文書の `<head>` で、レイヤーを使う CSS より前にも書く（`src/layouts/Deck.astro`。markuplint の `head-element-order` に合わせ、レイヤーを使わない Google Fonts の CSS の後ろに置いている）。`reset` は kiso.css、`vendors` は Fontsource の `@font-face`
- コンポーネント: Astro のスコープ付き `<style>` に書き、`@layer components { … }` で包む。1 ファイル 1 コンポーネント
- 命名: ルートはコンポーネント名の kebab-case（`Slide` なら `.slide`）、子要素は `._title`、ユーティリティは `.-visually-hidden`、コンポジションとパターンは接頭辞なし。種類の違うクラスは `|` で区切る
- トークン: `--<分類>--<名前>`。色と文字はプリミティブ（`--color--sand--50`）と役割（`--background--base`、`--text--title--font-size`）の 2 層にし、コンポーネントからは役割を参照する。名前は `DESIGN.md` の表の名前に合わせる
- カスタムプロパティ: 公開プロパティは `--<コンポーネント>--<プロパティ>`、内部プロパティは `--_<名前>`。スタイルクエリで読む真偽値のフラグ（値は `--true` / `--false`）は `is-` か `has-` で始める
- display: 複数キーワードの構文を使う（`flex` ではなく `block flex`）
- ダークモード: 役割のトークンに `light-dark()` で持たせる。テーマの切り替えは `<meta name="color-scheme">` の `content` を書き換える。初期値はライト（`light only`）

## 単位

スライドの中と、操作の部分で、単位の決め方が違う。

- スライドの中: 文字の大きさ、余白、線、角丸は、すべて枠の幅に対する割合（`cqi`）で書く。枠の要素を `container: --frame / inline-size` のコンテナにし（`container-type` を単体で書くと Stylelint が error にする）、その中の値は `cqi` で決める。どの画面でも同じ見た目にするため
- 操作の部分: ボタン、進み具合の表示などは `rem` で書く。枠の大きさに合わせて拡大縮小しない
- ビューポート単位: `vw` / `vh` ではなく論理方向の単位（`svi`、`svb`）を使う（Stylelint で警告）

## 文字

- スライドの中の文字のスタイルは `DESIGN.md` の 6 つ（`number`、`display`、`title`、`body`、`code`、`label`）だけを使う。スライドの外は `rem` の 3 つで、スピーカーノートは `notes`、操作の部分のツールチップとタイマーのラベルは `control`、発表者ビューの経過時間の数字は `timer` を使う
- 和文に `text-wrap: pretty` は付けない（Safari の不具合）
- 枠の中に置いた文字（ボタン、ラベル）のハーフレディングは `text-box-trim` で刈る。`text-box-trim` は flex / grid のコンテナには効かないので、その中の文字の要素に付ける

## 通読済みの章

css-change のスキルの通読する手順で、すべての節を読んだ章。ここにある章は作業のたびに読み直さず、照合だけの手順で進める。

- ガイドラインの版: v0.84.0
- 通読済み: 1〜18 章、20 章（テーマの土台、枠、操作の部分の作業で読んだ。12 章はスライドの図の作業で読んだ。2026-11-12）
- まだ通読していない: 19 章（運用）

## 本書と違う点

ガイドラインのルールと違う作りを、理由と一緒にここに記録する。

- コンポーネントのスコープは `@scope` ではなく、Astro のスコープ付き `<style>` で作る（taklog と同じ）。パターンの中でだけ意味を持つクラス（コードブロックの色分けなど）は、`.scoped` も `to` も付けない `@scope (<パターン>)` に閉じ、`_` を付けない名前にする（taklog の `code-lines.css` と同じ）
- 操作の部分とタイマーのボタンの間は、`menu` の `column-gap` で空け、押せる範囲は透明な `::after` で隙間まで広げる（本書の `no-gaps-between-hover-items` は、`gap` で空けず項目の `padding` で間隔を作るとする）。ハイライトの大きさと位置をボタンの箱に合わせる（`anchor-indicator-as-decoration`）ため、ボタンに `padding` を足して面を内側に寄せる形にしない。隙間はどちらかのボタンの押せる範囲で覆われ、隣とは重ならない（`pseudo-hit-area-no-overlap`）ので、ホバーが外れて点滅する問題は起きない
- 真偽値のフラグの名前は `is-` / `has-` で始める（taklog と同じ）
- スライドの中の文字の大きさは、画面の幅ではなく枠の幅（`cqi`）で決め、`clamp()` で上限と下限を付けない。スライドは画面の大きさにかかわらず同じ見た目にするもので、枠の幅に比例させるのが目的のため。ブラウザの文字の大きさの設定には追従しない
- スライドの中の余白、線、角丸も `cqi` で書く（本書の `unitless-size-tokens`、`padding-and-decoration-in-px` と違う）。本書は余白を `rem` や単位なしの数値のトークンで持つが、文字と同じく枠の幅に比例させるため。トークンも `cqi` の長さで持つ。スライドの中の文字の大きさを `cqi` だけで決める点は、本書の `font-size-in-rem`、`clamp-rem-bounds`、`no-full-liquid-scaling` とも違う（理由は上の項目）
- スライドの中の文字は、ブラウザの拡大で大きくならない（本書の `verify-text-resize-200` と違う）。枠が画面いっぱいに広がるので、拡大しても見た目の大きさが変わらない。スライドは全画面で映すもので、文字の下限を遠くの席から読める大きさ（枠の幅の 2.5%）にしている。ノートも、文書のルートの文字の大きさを画面の幅に比例させるので、画面の幅が 1280px より狭い間は、ブラウザで拡大しても見た目の大きさが変わらず、11px の下限に着いてから大きくなる（下の「文書のルート（`html`）の文字の大きさ」の項目）
- 配色の初期値はライトにし、`<meta name="color-scheme">` の `content` を `light only` で出す（本書の必須のルール `color-scheme-meta-for-light-dark` は `light dark` を求める）。発表者の OS がダークのまま映してしまう失敗を防ぐため（DESIGN.md の「明暗の切り替え」）。`:root` の CSS には `color-scheme` を書かず、`<meta>` の書き換えだけで切り替える
- 値は `DESIGN.md` に書く（本書の `design-md-without-values` と違う）。このプロジェクトは `DESIGN.md` を値の出どころにすると決めていて、CSS はそれを写す
- `@font-face` は `base` ではなく `vendors` のレイヤーに置く（taklog と同じ）。Fontsource のパッケージから写した外部の定義なので、自分で書いた土台と分ける。端末の Noto Sans JP を参照する `local()` だけの `@font-face` も、フォントの定義をまとめて置くため `vendors` に入れる
- 縦に並べたスライドの区切り線は、`gap` ではなく、`.slide` の中の `& + &` の `border-block-start` で引く（本書の `separators-in-gap` と違う）。gap decorations は Chrome と Edge だけが対応していて、本書が代わりに使う影の線は DESIGN.md が使わないと決めている。1 列で折り返さないので、端に線が残る問題は起きない
- スピーカーノートの上下の余白は、DESIGN.md の値のとおり `rem` で書く（本書の `padding-and-decoration-in-px` と違う）。ノートは文字を読むための領域で、文字と一緒に上下の余白も、文書のルートの文字の大きさ（画面の幅に比例する）に合わせて変えるため。左右の余白は `rem` ではなく、taklog と同じページの余白（`--gutter--page`、16px〜64px）にする。ユーザーが、taklog の左右の余白に合わせると決めた（2026-11-13）
- スライドの枠線の内側の余白は `--guide--inline` と `--guide--block` と呼ぶ（本書の `gutter-vs-gap` は、コンテンツの外側の左右の余白を `gutter` と呼ぶ）。DESIGN.md の「見えない枠線（ガイド）」に合わせ、左右と上下を同じ語で呼ぶため
- コードの色分けのトークン（`--syntax--*`）は、コードブロックだけで使うが、グローバルなトークンにする（本書の `no-single-use-token` と違う）。DESIGN.md がコントラスト比と一緒に役割の表で決めている値で、ほかのトークンと同じ場所で値と比を見比べられるようにするため
- 操作の部分の無効のアイコンは、`foreground--muted` と同じプリミティブを相対カラー構文で 50% の不透明度にした `foreground--disabled` にする（本書の `two-text-colors` は、無効も `muted` のまま表すとする）。ふだんのアイコンがすでに `muted` なので、そのままでは押せないことが見た目で分からないため。押せないことを示す見た目として、WCAG の対象外として扱う（DESIGN.md の「操作の部分」）
- 操作の部分の帯の内側の余白、ボタンの間隔、ツールチップの内側の余白、タイマーのカードの内側の余白、発表者ビューの body の内側の余白は、DESIGN.md の値のとおり `rem` で書く（本書の `padding-and-decoration-in-px` と違う）。帯とボタンの角丸も `rem` で決めていて、角丸を同じ中心の円弧にする式（帯の角丸から内側の余白を引く）を、同じ単位で書くため。ツールチップとカードは、帯と同じ単位の値で、操作の部分の余白をそろえるため
- スライドが替わるたびに、要素を 60ms ずつずらして出す（本書の 18-8 と `motion-needs-purpose` は、ずらす演出を頻度の低い UI に限り、順番を 5 つまでとする）。図の最後の項目は 420ms 後に動き始める。DESIGN.md の「動かしてよい場面」で、ユーザーが参考にした発表のスライドに合わせて決めた。前のスライドはすぐに消すので、キーで続けて進めても待たせない
- 文書のルート（`html`）の文字の大きさを `clamp(11px, 1.25svi, 16px)` にし、画面の幅に比例させる（本書の `no-root-font-size-change`、`no-viewport-only-font-size`、`font-size-in-rem`、`clamp-rem-bounds`、`verify-text-resize-200`、`unit-by-text-scaling`、`no-full-liquid-scaling` と違う。880px〜1280px の間は、`rem` で書いた操作の部分がすべて画面の幅に比例して縮む）。Stylelint の 2 件（`no-root-font-size-change` と、`clamp()` の上限と下限を `rem` で求めるルール）は、`src/styles/base/global.css` で `stylelint-disable-next-line` と理由を書いて止めている。`rem` で決めている操作の部分、ツールチップ、ノート、タイマーを、狭い画面でまとめて縮めるため。ユーザーが、ブラウザの文字の大きさの設定への追従は考えないと決めた（DESIGN.md の「文字のスタイル」）。この決定のため、ページの余白を決める `progress()` の区間の端（375px と 1280px）も、`rem` ではなく `px` で書く（本書の 13-10 の例は `rem` で渡す）。`rem` で書くと、区間の端がルートの文字の大きさにつれて動き、幅が 1280px より狭い画面で余白の値がずれるため（880px〜1280px では 64px のまま変わらなくなる。`src/styles/tokens/sizes.css`）。ページの余白（長さ）も `progress()` で決め、`@supports` で囲まない（本書の `shared-fluid-range` の補足と 13-10 は、`progress()` を型スケールの比率にだけ使い、`@supports` で囲むとする）。対象のブラウザ（Safari / iOS 26 以降、Chrome・Edge・Firefox の最新 2 版）が、すべて `progress()` に対応しているため。ルートの文字の大きさの区間（880px〜1280px）は、ページの余白の区間（375px〜1280px）とそろえない（本書の `shared-fluid-range` と違う）。ページの余白は taklog の値を写したもので、ルートの文字の大きさとは別に決めているため
- セーフエリアの値（`env(safe-area-inset-*)`）を、論理プロパティ（`padding-inline`、`padding-block-start`、`padding-block-end`、`inset-block-start`、`inset-inline-end`）と、行頭と行末の名前のトークン（`--gutter--page-start`、`--gutter--page-end`）に当てる（taklog と同じ。本書の `logical-properties` の補足と 13-8 は、物理プロパティで書くよう求める）。スライドは横書きの左から右だけで、行頭が左、行末が右に決まるため。4 辺をまとめて書く `padding` の一括指定では、上、右、下、左の物理的な順で書く
- 発表者ビューのデッキを、大きさのコンテナ（`container: --deck / size`）にし、枠を収める高さを `cqb` でスライドに渡す（本書の非推奨のルール `no-container-type-size` と違う）。デッキの高さは body のグリッドの行（画面の高さからタイマーと操作の部分を引いた残り）で決まるので、高さが決まらない問題は起きない。タイマーと操作の部分の高さは中身で決まり、`100svb` から引く式では書けないため。Stylelint の警告は `src/layouts/Deck.astro` で `stylelint-disable-next-line` と理由を書いて止めている。デッキは `main` 要素なので、形式の上では禁止のルール `no-container-on-page-root` にも当たる。発表者ビューの `main` は body のグリッドの 1 行で、ページのルートの高さを決める要素ではないので、このルールが防ぐ問題は起きない。大きさの封じ込めで、デッキの中の見えない見出し（`.-visually-hidden` の `position: fixed`）の包含ブロックがデッキになるが、見えない要素なので表示には影響しない
- 発表者ビューでは、body の高さを `block-size: 100svb` で決める（本書の `root-scroller-no-fixed-root-height` と `min-block-size-over-fixed-height` と違う）。経過時間、デッキ、操作の部分を画面の高さに収め、デッキの行を残りの高さにするため、グリッドの高さを決める必要がある。長いノートは、領域の中でスクロールさせる
- 操作の部分とタイマーのボタンの帯では、無効のボタンがある帯にも、ホバーとフォーカスに追従するハイライトを使う（本書の `anchor-indicator-as-decoration` の補足は、一部の項目だけが押せる部品や、押し間違えの損失が大きい部品には向かないとする）。前へと次へは端のスライドで、タイマーのボタンは状態によって無効になり、停止は経過時間を 0 に戻す。DESIGN.md の「操作の部分」と「タイマー」で、uiarc の floating button group を元にした見た目にそろえるとユーザーが決めた。無効のボタンにはハイライトを置かないので、押せない項目に面が来ることはない。ハイライトが移動の組と表示の切り替えの組の間の区切り線の上を通ることも、同じ見た目にそろえるために受け入れる。区切り線は押せる項目ではなく、ハイライトは線の上で止まらない
- 角丸のトークンに、役割の名前の `--rounded--control` を置く（本書の 10-4 は、角丸を 1 層のスケールにし、役割の名前を作らないとする）。スライドの中の角丸は `cqi` のスケールで、操作の部分の `rem` の角丸はそのスケールに入らない。DESIGN.md の「形」がこの名前で決めていて、操作の部分とタイマーの 2 つで使う
- 文字の役割のうち、スライドの外で使う `notes`、`control`、`timer` の大きさは、役割の層に `rem` の値を直接書く（本書の `typography-token-two-layers` と違う）。プリミティブは `cqi` で、枠の外では使えない。`rem` のプリミティブを足すと、どれも 1 か所でしか使わないトークンになる
- 図とコードブロックは、コンポーネントではなく `patterns` のレイヤーのパターンにする（本書の `component-decision-tests` と `pattern-leaves-component-properties` の補足は、構造や状態を持つものをコンポーネントにするとする）。原稿は MDX に素の HTML で書き、書く係が手本のクラスをそのまま使うため。コンポーネントにすると、図の種類ごとに Astro のコンポーネントと、その使い方を書く係に覚えさせることになる。発表の表示で順に出す動きは、スライドの状態を読むだけで、パターンの中に状態は持たない
