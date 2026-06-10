---
title: "LinkCard表示テスト"
description: "リンクカード表示確認用の一時テスト記事。通常URLと明示的なlink-cardディレクティブの共存を確認する。"
date: "2026-06-10"
tags:
  - 表示テスト
draft: true
archive: false
slug: "link-card-smoke-test"
---

このページはリンクカード表示確認用です。

通常URLとリンクカードの表示差分を確認します。

通常URLはそのまま通常リンクとして表示されること。

* https://example.com/plain-url

明示的に `::link-card{...}` と書いた場合だけカードとして表示されること。

::link-card{url="https://example.com/card" title="リンクカードの表示テスト" description="画像なしでも崩れず、外部リンクとして新しいタブで開くことを確認するためのテストカード。" siteName="example.com"}
