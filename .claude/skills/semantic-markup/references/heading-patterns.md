# コンポーネントシステムにおける見出しパターン

コンポーネントベースのアーキテクチャで適切な見出し階層を維持するための戦略。

## 課題

コンポーネントベース開発は以下の緊張関係を生む。

- コンポーネントはコンテキストをまたいで再利用可能であるべき
- 見出しレベルは周囲のドキュメント構造に依存する
- コンテンツ作成者が見出し階層を理解しているとは限らない
- ハードコードされたレベルは異なるコンテキストで破綻する

## パターン 1: 設定可能な見出しレベル

見出しレベルを props / パラメータとして受け取り、妥当なデフォルト値を持たせる。

```jsx
// React の例
function Card({ title, headingLevel = 3, children }) {
  const Heading = `h${headingLevel}`;
  return (
    <article className="card">
      <Heading>{title}</Heading>
      {children}
    </article>
  );
}
```

```twig
{# Twig の例 #}
{% set heading_tag = heading_level|default(3) %}
<article class="card">
  <h{{ heading_tag }}>{{ title }}</h{{ heading_tag }}>
  {{ content }}
</article>
```

### 使用する場面

- 複数のコンテキストで使われる汎用コンポーネント
- ネストの深さが変動するコンポーネント
- CMS 駆動のコンテンツで、作成者が使い方を制御する場合

### トレードオフ

- 責任がコンポーネントの利用者に移る
- 作成者が正しく選択しない可能性がある
- 妥当なデフォルト値によりリスクは軽減されるが、完全には排除できない

## パターン 2: コンテキストを考慮したデフォルト

既知のコンポーネント関係に基づいてデフォルト値を設定する。

```jsx
// Section は常に新しい見出しコンテキストを開始する
function Section({ title, children }) {
  return (
    <section aria-labelledby="section-title">
      <h2 id="section-title">{title}</h2>
      {children}
    </section>
  );
}

// Section 内の Card は h3 をデフォルトとする
function CardList({ cards }) {
  return (
    <ul className="card-list">
      {cards.map((card) => (
        <li key={card.id}>
          <Card title={card.title} headingLevel={3} />
        </li>
      ))}
    </ul>
  );
}
```

### 使用する場面

- 親子関係が既知のコンポーネント
- 予測可能なネストパターンを持つデザインシステム
- コンテナと子コンポーネントの両方を自分で制御できる場合

### トレードオフ

- 柔軟性が低い
- 想定外のコンテキストで使用されると破綻する
- 想定される使い方のドキュメント化が必要

## パターン 3: 見出しコンポーネントの抽象化

セマンティックと視覚の両方の関心事を扱う見出しコンポーネントを作成する。

```jsx
function Heading({ level, visualLevel = level, children, className = "" }) {
  const Tag = `h${level}`;
  const visualClass = `u-heading-${visualLevel}`;

  return <Tag className={`${visualClass} ${className}`}>{children}</Tag>;
}

// 使用例: セマンティックは h3、視覚的な見た目は h2
<Heading level={3} visualLevel={2}>
  セクションタイトル
</Heading>;
```

### 使用する場面

- デザインがセマンティック階層と異なる視覚的階層を要求する場合
- 深いネストレベルで大きな見出しが必要な場合
- 異なるセマンティックレベル間で一貫した視覚的扱いが必要な場合

### 利点

- 関心事を明確に分離する
- その区別を明示的にドキュメント化する
- デザインを妥協せずに正しいセマンティクスを実現できる

## パターン 4: 継承による設定

汎用コンポーネントが特殊化される際に見出し設定を継承する。

```jsx
// 汎用カード
function Card({ title, headingLevel = 3, headingClass, children }) {
  const Heading = `h${headingLevel}`;
  return (
    <article className="card">
      <Heading className={headingClass}>{title}</Heading>
      {children}
    </article>
  );
}

// 特殊化された商品カード — 自身のコンテキストを知っている
function ProductCard({ product, headingLevel = 3 }) {
  return (
    <Card
      title={product.name}
      headingLevel={headingLevel}
      headingClass="product-card__title"
    >
      <p className="product-card__price">{product.price}</p>
      <p className="product-card__description">{product.description}</p>
    </Card>
  );
}

// ページセクション — 子のコンテキストを設定する
function FeaturedProducts({ products }) {
  return (
    <section aria-labelledby="featured-heading">
      <h2 id="featured-heading">注目の商品</h2>
      <ul className="product-grid">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} headingLevel={3} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

### 使用する場面

- コンポーネントの継承があるデザインシステム
- 汎用コンポーネントが常に特殊化されたコンポーネントでラップされる場合
- 見出しレベルの決定に明確なオーナーシップがある場合

## 視覚的のみの見出し

テキストが見出しのように見えるべきだが、ドキュメントアウトラインには影響させたくない場合：

```html
<!-- 見出しのように見えるが、セマンティック的には見出しではない -->
<p class="-heading--xl">セール明日終了！</p>

<!-- 実際の見出しとの比較 -->
<h2 class="-heading--xl">商品カテゴリ</h2>
```

### 使用する場面

- 目立つが構造的ではないプロモーションテキスト
- 装飾的なタイポグラフィ
- コンテンツセクションを導入しないラベル


## コンポーネント見出しのチェックリスト

見出しを含むコンポーネントを構築する際の確認事項：

- [ ] 見出しレベルは設定可能か？
- [ ] 妥当なデフォルト値があるか？
- [ ] デフォルト値がドキュメント化されているか？
- [ ] 視覚的な見た目を独立して制御できるか？
- [ ] すべての妥当な見出しレベルでコンポーネントが正しく動作するか？
- [ ] 想定されるコンテキストがドキュメント化されているか？

## よくある間違い

### ハードコードされたレベル

```jsx
// 脆弱: 想定外のコンテキストで使用すると破綻する
function Card({ title }) {
  return (
    <article>
      <h3>{title}</h3> {/* h2 レベルで使われたら？ */}
    </article>
  );
}
```

### 見た目でレベルを選択

```html
<!-- 間違い: 小さく見えるから h4 を選択 -->
<h4 class="card-title">商品名</h4>

<!-- 正しい: 適切なレベルに視覚的オーバーライドを適用 -->
<h3 class="card-title -heading--sm">商品名</h3>
```

### デフォルト値の欠如

```jsx
// 危険: 見出しレベルが未定義になりうる
function Card({ title, headingLevel }) {
  const Heading = `h${headingLevel}`; // 渡されなければ h undefined
  return <Heading>{title}</Heading>;
}

// 安全: 常に有効なレベルを持つ
function Card({ title, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  return <Heading>{title}</Heading>;
}
```