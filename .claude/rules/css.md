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

- スライドの中: 文字の大きさ、余白、線、角丸は、すべて枠の幅に対する割合（`cqi`）で書く。枠の要素を `container-type: inline-size` のコンテナにし、その中の値は `cqi` で決める。どの画面でも同じ見た目にするため
- 操作の部分: ボタン、進み具合の表示などは `rem` で書く。枠の大きさに合わせて拡大縮小しない
- ビューポート単位: `vw` / `vh` ではなく論理方向の単位（`svi`、`svb`）を使う（Stylelint で警告）

## 文字

- スライドの中の文字のスタイルは `DESIGN.md` の 6 つ（`number`、`display`、`title`、`body`、`code`、`label`）だけを使う。スライドの外のスピーカーノートは `notes`（`rem`）を使う
- 和文に `text-wrap: pretty` は付けない（Safari の不具合）
- 枠の中に置いた文字（ボタン、ラベル）のハーフレディングは `text-box-trim` で刈る。`text-box-trim` は flex / grid のコンテナには効かないので、その中の文字の要素に付ける

## 本書と違う点

ガイドラインのルールと違う作りを、理由と一緒にここに記録する。

- スコープは `@scope` ではなく、Astro のスコープ付き `<style>` で作る（taklog と同じ）
- 真偽値のフラグの名前は `is-` / `has-` で始める（taklog と同じ）
- スライドの中の文字の大きさは、画面の幅ではなく枠の幅（`cqi`）で決め、`clamp()` で上限と下限を付けない。スライドは画面の大きさにかかわらず同じ見た目にするもので、枠の幅に比例させるのが目的のため。ブラウザの文字の大きさの設定には追従しない
- スライドの中の余白、線、角丸も `cqi` で書く。本書は余白を `rem` や単位なしの数値のトークンで持つが、文字と同じく枠の幅に比例させるため。トークンも `cqi` の長さで持つ
- スライドの中の文字は、ブラウザの拡大で大きくならない（本書の `verify-text-resize-200` と違う）。枠が画面いっぱいに広がるので、拡大しても見た目の大きさが変わらない。スライドは全画面で映すもので、文字の下限を遠くの席から読める大きさ（枠の幅の 2.5%）にしている。拡大して読みたい人には、スピーカーノートを通常の大きさの文字で出す
- 配色の初期値はライトにし、`<meta name="color-scheme">` の `content` を `light only` で出す（本書の必須のルール `color-scheme-meta-for-light-dark` は `light dark` を求める）。発表者の OS がダークのまま映してしまう失敗を防ぐため（DESIGN.md の「明暗の切り替え」）。`:root` の CSS には `color-scheme` を書かず、`<meta>` の書き換えだけで切り替える
- 値は `DESIGN.md` に書く（本書の `design-md-without-values` と違う）。このプロジェクトは `DESIGN.md` を値の出どころにすると決めていて、CSS はそれを写す
- `@font-face` は `base` ではなく `vendors` のレイヤーに置く（taklog と同じ）。Fontsource のパッケージから写した外部の定義なので、自分で書いた土台と分ける。端末の Noto Sans JP を参照する `local()` だけの `@font-face` も、フォントの定義をまとめて置くため `vendors` に入れる
- 縦に並べたスライドの区切り線は、`gap` ではなく `.slide + .slide` の `border-block-start` で引く（本書の `separators-in-gap` と違う）。gap decorations は Chrome と Edge だけが対応していて、本書が代わりに使う影の線は DESIGN.md が使わないと決めている。1 列で折り返さないので、端に線が残る問題は起きない
- スピーカーノートの余白は、DESIGN.md の値のとおり `rem` で書く（本書の `padding-and-decoration-in-px` と違う）。ノートは文字を読むための領域で、ブラウザの文字の大きさの設定に合わせて余白も広げるため
- スライドの枠線の内側の余白は `--guide--inline` と `--guide--block` と呼ぶ（本書の `gutter-vs-gap` は、コンテンツの外側の左右の余白を `gutter` と呼ぶ）。DESIGN.md の「見えない枠線（ガイド）」に合わせ、左右と上下を同じ語で呼ぶため
- コードの色分けのトークン（`--syntax--*`）は、コードブロックだけで使うが、グローバルなトークンにする（本書の `no-single-use-token` と違う）。DESIGN.md がコントラスト比と一緒に役割の表で決めている値で、ほかのトークンと同じ場所で値と比を見比べられるようにするため
