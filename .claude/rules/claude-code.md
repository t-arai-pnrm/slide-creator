---
paths:
  - ".claude/**"
---

# Claude Code の設定

`.claude/` のスキル、サブエージェントを変えるときの前提。

## taklog との関係

進め方は taklog（技術ブログのリポジトリ、`/Users/araitakahiro/dev/taklog`）から写した。写したものと、写していないものは次のとおり。

- 写して書き換えたもの: dev-flow と css-change のスキル、`builder`、`css-implementer`、`explorer`、`recss-reader`、`reviewer` の定義。taklog の側を直したら、ここにも同じ直しが要るかを確かめる
- 写していないもの: hook（`article.py`、`css.py`、`bash-writes.py`、`workflow.py`、`checklists.py`）。試作の間は、手順をスキルの本文の指示として守る。指示だけでは守られない箇所が出てきたら、その箇所だけ hook にする
- ほかから写したもの: semantic-markup（`/Users/araitakahiro/dev/astro-template` から）
- CLI で入れたもの: アニメーションのスキル 5 つ（animate、animation-performance、choreograph、emil-design-eng、review-animations）。`pnpm dlx skills@latest add emilkowalski/skills -a claude-code` で入れ、入れた版は `skills-lock.json` に残る。配布元には 18 個あるが、このプロジェクトで使う 5 つだけにしている。スキルの説明文はセッションのたびに読み込まれるため

## モデルの割り当て

- どのモデルに何を任せるかは、サブエージェントの定義の `model` と `effort` で決める。場所を探す係と読む係は haiku、書く係（作る係、実装係）は opus・medium、レビュー係は fable・medium、CSS の判断する係は opus・high。判断する係はプラグインの定義なので、css-change のスキルで呼ぶたびに `model` と `effort` を渡す
- Fable を使うのは、レビュー係（PR の 1 周に 1 回）と、ユーザーが難しいタスクで有効にした助言役だけにする。サブスクリプションでは、Fable は週の利用枠を Opus より速く使い、使えるのも枠の一部に限られる
- 助言役は `.claude/settings.json` の `advisorModel` に書かない。書くと、すべてのセッションとサブエージェント（並列に動かす読む係を含む）が Fable の助言役を持ち、呼ぶたびに会話の全文を読ませる

## スキルの置き場所

- 文章のスキル（japanese-tech-writing、cognitive-rhythm-writing、yomiyasu）は、このリポジトリに置かない。実体は taklog の `.claude/skills/` にあり、この Mac の `~/.claude/skills/` の同じ名前のものが、そこへのシンボリックリンクになっている。規則を直すときは taklog の側を直す
- 作業の前に必ず読ませたいスキルは、サブエージェントの定義の `skills` に書き、起動した時点で全文を読み込ませる
- グローバルの hook（`~/.claude/hooks/require-japanese-skills.py`）は、日本語を書く前に japanese-tech-writing を、日本語のコミットメッセージや PR の前に yomiyasu を求める。定義の `skills` に入っていれば、呼んだとみなされる

## 記録の置き場所

- 検証の記録は `.claude/logs/receipts/`、レビューの判定は `.claude/logs/reviews/`、CSS のチェック表は `.claude/recss-checklists/` に置く。どれも Git の管理から外している

## rules

- rules の文書は、`@import` で別の文書を読み込ませず、中身をそのまま書く。`paths` に当たったときに読み込まれるのは rules のファイルの文字だけで、`@import` は展開されない
