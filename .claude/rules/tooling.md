---
paths:
  - "package.json"
  - "pnpm-workspace.yaml"
  - "tsconfig.json"
  - ".oxlintrc.json"
  - ".oxfmtrc.jsonc"
  - ".markuplintrc"
  - "stylelint.config.mjs"
  - "stylelint/**"
  - "astro.config.mjs"
  - "lefthook.yml"
  - "playwright.config.ts"
  - "e2e/**"
  - "scripts/**"
---

# ツール

設定は taklog（技術ブログのリポジトリ）から写した。版も taklog と同じにしている。taklog にあってここにないのは、Vitest、knip、GitHub Actions、Dependabot。

- **リンター**: Oxlint（`.oxlintrc.json`）。`.astro` は frontmatter と `<script>` だけが対象。テンプレートの HTML は markuplint（`src/**/*.astro`）、CSS は Stylelint で検査する
  - 型を使う規則（`no-floating-promises`、`no-unsafe-type-assertion` など）も動かす（`options.typeAware`。検査は `oxlint-tsgolint`）。対象は `.ts` だけで、`.astro` の frontmatter と `<script>` には当たらない。型を `as` で狭めず、型ガードで絞る
  - `.markuplintrc` の `overrideMode: "merge"` は外さない。既定の `reset` では、`overrides` に当たるファイルに推奨のルールが当たらず、何も検査されない
  - markuplint のルールを外すときは、理由をこの文書に書く（`.markuplintrc` は JSON でコメントを書けないため）
  - Stylelint の設定と `stylelint/` の独自ルールは、CSS のガイドラインのリポジトリのものを写している。ガイドラインが変わったら合わせて変える
- **フォーマッター**: Oxfmt（`.oxfmtrc.jsonc`）。`.md` と `.mdx` はすべて整形しない（スライドの原稿、AGENTS.md を含む）
- **TypeScript**: 6 系。TypeScript 7 は `astro check` が未対応のため使わない
  - `exactOptionalPropertyTypes` では、省略できるプロパティに `undefined` を渡せない。値がないかもしれないものを渡す props は `?: T | undefined` と書く
- **ブラウザのテスト**: Playwright（`playwright.config.ts`）。テストは `e2e/` に `*.spec.ts` で置き、Chromium、Firefox、WebKit で動かす。手元で初めて動かすときは `pnpm exec playwright install` でブラウザを入れる
  - サーバーは `astro preview --ignore-lock` を 127.0.0.1:4370 で毎回起こす。`--ignore-lock` がないと、ほかの preview が動いているときや、エージェントから実行したとき（バックグラウンドに回る）に起動しない
  - 失敗したときの記録は `node_modules/.cache/playwright` に置く（`.gitignore` を変えずに Git から外すため）
- **Git hooks**: Lefthook（`lefthook.yml`）
  - pre-commit: ステージしたファイルに Oxlint、Stylelint、markuplint、Oxfmt をかけ、修正をステージに戻す
  - commit-msg: Conventional Commits の形式を検査する（`git merge` や `git revert` の既定のメッセージは通す）
  - pre-push: `pnpm test`
- **PR の前の検証**: `scripts/verify.ts`（`pnpm verify`）が、`test`、`build`、`test:html`、`test:e2e` を順に実行し、結果を `.claude/logs/receipts/<ブランチ名>.json` に書く。レビュー係は、この記録の `commit` を HEAD と照らし合わせるので、検査の前後で作業ツリーかコミットが変わると記録を無効（`clean: false`）にする
- **CSS の対象ブラウザ**: `astro.config.mjs` の `vite.build.cssTarget` は、`.browserslistrc` と同じ範囲を手で書いている。どちらかを変えたら、もう片方も変える。`cssTarget` が古いブラウザを含むと、CSS の圧縮が `light-dark()` を書き換えて明暗の色が無効になる（`e2e/frame.spec.ts` の背景の色のテストで検出する）
- **依存の安全性**: `pnpm-workspace.yaml` に書く
  - `minimumReleaseAge` で、公開から 1 週間経っていない版は入れない。セキュリティ修正で待てない版は `minimumReleaseAgeExclude` に足す
  - `trustPolicy: no-downgrade` で、provenance が外れた版など、信頼の段階が下がった版を入れない。正当な理由で下がった版は、理由と issue の URL を添えて `trustPolicyExclude` に足す
  - `strictPeerDependencies` で peer の不一致を失敗にする。範囲が古いだけで動く組み合わせは、`peerDependencyRules.allowedVersions` で個別に許す
  - `.gitignore` の編集は、この Mac のグローバルの設定で Claude Code に拒否されている。無視するパスを足すときは、ユーザーに頼む
