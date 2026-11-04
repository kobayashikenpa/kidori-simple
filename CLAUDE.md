# kidori-simple（木取り計算 簡易版）

材料の登録なしで、現場ですぐパネルソーの木取りを計算するスマホ用 Web アプリ。kidori（`https://github.com/kobayashikenpa/kidori`）の簡易版。スマホ（iPhone / Android）で使い、ホーム画面に追加して使う。

- **仕様の正は `docs/spec.md`**。実装で迷ったら仕様書に従い、仕様書に書いていないことは勝手に決めずに進行役（メインの Claude）に報告する
- 作業の一覧は `docs/tasks.md`、設計は `docs/architecture.md`
- 仕様書の「12. 検討中」は、まだ作らないもの。オーナーが決めるまで実装しない

## キドリライト（kidori-lite）との関係

- kidori-simple は、キドリライト（`kobayashikenpa/kidori-lite`）の第2.1版から分けて作る **別のアプリ**（2026-11-04 オーナーの判断）。キドリライトは分ける前の形のまま残す
- **キドリライトのリポジトリは変更しない**。読むだけ
- 同じ `kobayashikenpa.github.io` の上で動くので、保存（localStorage）のキーは必ず `kidori-simple.` で始める（キドリライトの `kidori-lite.` のデータに触らない）
- キドリライトの送るファイル・バックアップ（app: `kidori-lite`）は取り込める。書き出すファイルは app: `kidori-simple`

## kidori との関係

- 計算の一部（式・木取りの配置・切り出しチェック）は kidori の `src/engine` から **コピーして** 簡易版に合わせて直す。どこから何を持ってくるかは `docs/spec.md` 14章と `docs/architecture.md`
- **kidori 本体（`~/Documents/kidori`）は変更しない**。読むだけ
- 厚み・材料・材料グループ・フラッシュ・重ね切り・手持ち材料に関わるコードは持ってこない

## 利用者について

- 利用者（オーナー）は Git も Claude も初心者。報告は日本語で、専門用語には短い説明を添える
- 家具づくりの現場の言葉を使う：部材、板、仕上がり寸法、木取り寸法、調整寸法（逃げ・ほぞ など）、切り代、刃厚、端切り、歩留まり、端材

## 技術

- React + TypeScript（strict）+ Vite、テストは Vitest、リントは oxlint
- 公開先は GitHub Pages（`https://kobayashikenpa.github.io/kidori-simple/`）。`vite.config.ts` の `base` は `/kidori-simple/`
- Node.js / npm / gh は `~/.local/bin` にある。PATH に無ければ `export PATH="$HOME/.local/bin:$PATH"` を先に実行する

## コマンド

| 目的 | コマンド |
|---|---|
| 全チェック（型・リント・テスト） | `npm run check` |
| テストだけ | `npm test` |
| 開発サーバー | `npm run dev` |
| 本番ビルド | `npm run build` |

## 構成

```
src/
  engine/   計算ロジック（React に依存しない純粋な TypeScript）
            式の解析・寸法計算（仕上がり／木取り）・木取り（配置）計算・切り出しチェック。テストは同じ場所に *.test.ts
  ui/       画面（React コンポーネント）
  store/    状態管理と保存（localStorage）
docs/
  spec.md          仕様書
  architecture.md  設計
  tasks.md         作業の一覧（進捗もここで管理）
  glossary.md      画面の用語
```

- `src/engine` は `src/ui` や React を import しない（計算と画面を分けて、計算だけでテストできるようにする）
- 寸法は mm 単位の number。表示時に小数第1位まで

## ルール

- 用語・画面の文言は日本語。部材の寸法は板の面の2つ **W・H** だけ（厚み・D は無い）。「縦・横」は板の向きの説明にだけ使う
- 回転しない部材は **W を板の妻手、H を板の長手** に合わせて置く
- 入力は仕上がり寸法だけ。木取り寸法 ＝ 仕上がり寸法 ＋ 切り代（W・H に同じ値）
- 計算ロジックはテストを先に書く。仕様書の例（6章の 全体・天板・側板・棚板 など）をテストケースに使う
- 完了の条件：`npm run check` が通ること。通らないまま「完了」と報告しない
- 1つの作業ごとにコミットする。コミットメッセージは日本語で、何をしたかが分かるように書く
- `main` へ直接コミットしない。ブランチ → PR → オーナーがマージ
- 依存パッケージを増やすときは、理由を報告に書く

## 開発の流れ（ハーネス）

**オーナーの要望を受けたら、コードを書く前に必ず次の順で進める**：
1. 仕様の整理・要件定義・設計（planner と進行役）を行い、仕様書・設計の案としてオーナーに報告する
2. オーナーの許可を得てから、engine-dev / ui-dev にコードを作らせる（許可の前にコードは書かない）

オーナーが「まだまとまっていない」と言った要望は、仕様書の「12. 検討中」に日付つきで書き溜め、決まったら本文に移す。

進行役（メインの Claude）が、`.claude/agents/` のサブエージェントに作業を割り振る。

1. **planner**：仕様書から作業を分けて `docs/tasks.md` を更新する
2. **engine-dev**：`src/engine` の計算ロジックをテスト駆動で作る（kidori から持ってくるものは、コピーしてから直す）
3. **ui-dev**：`src/ui`・`src/store` のスマホ画面を作る
4. **verifier**：`npm run check` と、仕様書の各項目どおりに動くかを確かめる
5. **reviewer**：差分を仕様書・このファイルのルールと照らしてレビューする

取扱説明書は作らない（2026-10-23 オーナーの判断）。使い方の説明は画面の「ⓘ」に書く。

進行役は結果をまとめてオーナーに報告し、PR を作る。
