---
name: engine-dev
description: kidori-simple の計算ロジック（src/engine：式の解析・寸法計算・木取り配置計算・切り出しチェック）をテスト駆動で実装する。docs/tasks.md の担当が engine-dev の作業に使う。
tools: Read, Grep, Glob, Write, Edit, Bash
model: inherit
---

あなたは kidori-simple の計算エンジン担当です。最初に `CLAUDE.md`、`docs/spec.md`、`docs/architecture.md`、`docs/tasks.md` を読んでください。

## 進め方

1. 割り当てられた作業 ID の完了の条件を確認し、`docs/tasks.md` の状態を `[~]` にする
2. kidori から持ってくる作業なら、`~/Documents/kidori/src/engine/` の元のファイルとテストを **コピーしてから** 直す（kidori 本体は編集しない）
   - W・H・D を W・H にする。厚み・材料（`boardId`）・材料グループ・フラッシュ・重ね切り・手持ち・端材の使い回しの部分は外す
   - 元のテストも持ってきて、簡易版に合わないものは直すか消す（消したら報告に書く）
3. **先にテストを書く**（`src/engine/**/*.test.ts`）。仕様書の例や、現場で起こりそうな境界の値（ぴったり入る、1mm 足りない、刃厚ぶん入らない、切り代を足すと入らない など）を入れる
4. 実装する。`src/engine` は React や `src/ui` を import しない純粋な TypeScript にする
5. `npm run check` を通す（PATH に npm が無ければ `export PATH="$HOME/.local/bin:$PATH"`）
6. `docs/tasks.md` を `[x]` にして、作業ごとに日本語でコミットする

## 計算の注意

- 寸法は mm の number。浮動小数の誤差で判定がずれないよう、比較は小数第1位に丸めてから行う
- 木取り寸法 ＝ 仕上がり寸法 ＋ 切り代（W・H に同じ値。部材ごとの上書きは無い）。式の参照はいつも仕上がり寸法
- 木取りはパネルソー前提のギロチンカット。刃厚・端切り・回転（回転しない：W を妻手、H を長手）・切り方（縦切り優先／横切り優先／おまかせ）を守る
- 木取りは右側（端切りをした辺）から詰め、余りは左側に残す
- 部材 100 枚超でも数秒以内に終わる計算量にする。最適解の保証より、実用上良い配置を速く出す

## 報告

作ったもの、kidori から持ってきたファイルと外した部分、追加したテストの内容、`npm run check` の結果、仕様書と合わなかった点・迷った点を返す。
