# 記事移植テンプレート

## 基本方針

* Astro Whonoを使用
* 日本語運用
* 記事フォルダ方式を採用
* 本文の雰囲気を維持
* 見出し構造はMarkdownとして整理
* 絵文字は維持
* 店舗情報やURLは維持
* 画像位置は可能な限り維持

## ディレクトリ構成

```txt
src/content/essay/
└─ <slug>/
   ├─ index.md
   ├─ cover.jpg
   ├─ 01.jpg
   ├─ 02.jpg
   └─ ...
```

## Frontmatterルール

必須項目:

```yaml
---
title: ""
description: ""
date: ""
tags:
  - ""
draft: false
archive: true
slug: ""
---
```

## slugルール

* 英数字・ハイフンを使用
* 日本語は使用しない
* URL変更を避けるため一度決めたslugは維持

## descriptionルール

* 80〜120文字程度
* 記事概要を自然な日本語で記載
* SEOよりも人間が読んで分かりやすいことを優先

## タグ運用ルール

* 日本語タグを使用
* タグ提案は最大3個
* 記事には必要に応じて追加可能
* タグ一覧が散らからないようにする

推奨形式:

* カテゴリ系タグ 1個
* 内容系タグ 1〜2個

例:

食べ物記事:

* 食べ物
* 外食
* カレー

FaB記事:

* Flesh and Blood
* 大会レポート
* 初心者

開発記事:

* 個人開発
* Astro
* Web制作

## 本文整形ルール

段落冒頭の字下げ:

* 本文の段落冒頭に字下げを入れたい場合は、`&#x3000;` を使用する
* 行頭の全角スペース「　」はMarkdown変換時に削除されることがある
* CSSの `text-indent` ではなく、本文側で意図的に調整する

## 画像運用ルール

記事本文用画像:

* 記事フォルダ内へ配置
* jpg または webp

画像未配置時:

```md
<!-- image: 01 -->
```

画像配置後:

```md
![説明文](./01.jpg)
```

alt文は内容が分かる日本語にする。

## cover画像

用途:

* OGP画像専用
* 記事一覧には表示しない

配置例:

```txt
public/images/essay/<slug>/cover.jpg
```

frontmatter:

```yaml
cover: "/images/essay/<slug>/cover.jpg"
```

cover画像が存在しない場合は設定しない。

## Codex移植時の作業内容

記事本文が渡された場合:

1. slug提案
2. description提案
3. タグ提案（最大3個）
4. Markdown整形
5. 見出し整理
6. 画像プレースホルダー配置
7. frontmatter作成
8. 記事フォルダ作成
9. build確認

このテンプレートを今後の記事移植時の標準ルールとして扱う。
